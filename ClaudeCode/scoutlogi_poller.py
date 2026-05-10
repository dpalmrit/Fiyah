# ScoutLogi_TwelveLabsPoller -- Lambda handler (v3)
# Runs every 1 minute via EventBridge.
# Polls TwelveLabs for task status on all submitted player_sessions docs.
# On ready: atomically claims doc (submitted→processing) then runs scout analyze().
# Final statuses: complete (report written) | failed (TwelveLabs error) | analysis_failed (prompt error)
#
# Changes from v2:
#   - Atomic claim via find_one_and_update (submitted→processing) prevents duplicate
#     analysis when multiple Poller instances run concurrently (race condition fix)

import os
import json
import logging
from datetime import datetime, timezone

import boto3
from twelvelabs import TwelveLabs
from pymongo import MongoClient

log = logging.getLogger()
log.setLevel(logging.INFO)

API_KEY    = os.environ["TWELVELABS_API_KEY"]
MONGO_URI  = os.environ["MONGODB_URI"]
MONGO_DB   = os.environ.get("MONGODB_DB", "scoutlogi")
MONGO_COLL = os.environ.get("MONGODB_COLLECTION", "player_sessions")

EMAIL_SENDER_FN = os.environ.get("EMAIL_SENDER_FN", "ScoutLogi_EmailSender")

tl_client  = TwelveLabs(api_key=API_KEY)
mongo      = MongoClient(MONGO_URI)
coll       = mongo[MONGO_DB][MONGO_COLL]
lambda_cli = boto3.client("lambda", region_name=os.environ.get("AWS_REGION", "us-east-1"))

MATCH_TYPE_LABEL = {
    "League":     "League Game",
    "Tournament": "Tournament Game",
    "Friendly":   "Friendly Game",
    "Training":   "Training Session",
}

GAME_MATCH_TYPES = {"League", "Tournament", "Friendly"}

POSITION_CONTEXT = {
    "GK":  "goalkeeper — evaluate shot-stopping, distribution, command of the box, positioning on crosses",
    "CB":  "centre-back — evaluate defending 1v1, aerial duels, reading of the game, passing out from the back",
    "LB":  "left-back — evaluate defensive positioning, overlapping runs, crossing, recovery pace",
    "RB":  "right-back — evaluate defensive positioning, overlapping runs, crossing, recovery pace",
    "CDM": "defensive midfielder — evaluate ball-winning, positioning, short passing, protecting the back line",
    "CM":  "central midfielder — evaluate passing range, work rate, ball retention, movement between lines",
    "CAM": "attacking midfielder — evaluate creativity, through-ball vision, movement in final third, link-up play",
    "LW":  "left winger — evaluate pace, dribbling, cutting inside, delivery into the box",
    "RW":  "right winger — evaluate pace, dribbling, cutting inside, delivery into the box",
    "ST":  "striker — evaluate movement off the ball, finishing, hold-up play, pressing from the front",
}

BASE_PROMPT_GAMES = """You are an elite soccer scout with 20+ years of experience evaluating players at the professional level.

Analyze the footage and return a JSON scouting report with EXACTLY this structure (no extra fields, no markdown):

{{
  "overall_grade": "<A/B/C/D/F>",
  "summary": "<2-3 sentence overall assessment tailored to the player's position and age group>",
  "feedback": [
    {{
      "category": "<skill category relevant to this position>",
      "rating": "<green/yellow/red>",
      "comment": "<1 sentence specific observation>",
      "timestamp": "<MM:SS of the moment in the video this observation is drawn from, e.g. 34:12. Omit this field entirely if no specific moment can be identified>"
    }}
  ]
}}

Rating guide: green = strength, yellow = developing/adequate, red = needs significant improvement.
Grade guide: calibrate expectations to the player's age bracket — an A for a U12 means different things than an A for a U18.
Include 4-6 feedback items focused on the skills most important for this player's position.
For each feedback item, provide a timestamp (MM:SS) pinpointing the specific moment in the footage that supports your observation. Omit the timestamp field entirely for any item where no clear moment can be identified.
Return only valid JSON. No preamble, no explanation, no markdown code fences."""

BASE_PROMPT_TRAINING = """You are an elite soccer scout with 20+ years of experience evaluating players at the professional level.

Analyze the footage and return a JSON scouting report with EXACTLY this structure (no extra fields, no markdown):

{{
  "overall_grade": "<A/B/C/D/F>",
  "summary": "<2-3 sentence overall assessment tailored to the player's position and age group>",
  "feedback": [
    {{
      "category": "<skill category relevant to this position>",
      "rating": "<green/yellow/red>",
      "comment": "<1 sentence specific observation>"
    }}
  ]
}}

Rating guide: green = strength, yellow = developing/adequate, red = needs significant improvement.
Grade guide: calibrate expectations to the player's age bracket — an A for a U12 means different things than an A for a U18.
Include 4-6 feedback items focused on the skills most important for this player's position.
Return only valid JSON. No preamble, no explanation, no markdown code fences."""


def _now():
    return datetime.now(timezone.utc).isoformat()


def _build_prompt(doc):
    position    = doc.get("position", "")
    age_bracket = doc.get("age_bracket", "")
    match_type  = MATCH_TYPE_LABEL.get(doc.get("match_type", ""), doc.get("match_type", ""))
    jersey      = doc.get("jersey_number", "")
    foot        = doc.get("dominant_foot", "")
    kit_colour  = doc.get("kit_colour", "")

    pos_context = POSITION_CONTEXT.get(position, f"playing {position}")
    kit_note    = f" in the {kit_colour.lower()} kit" if kit_colour else ""
    focus_line  = (
        f"Focus exclusively on jersey #{jersey}{kit_note}. "
        f"If both teams have a #{jersey}, analyse only the player{kit_note}."
        if jersey else ""
    )

    context = (
        f"Player details:\n"
        f"- Position: {position} ({pos_context})\n"
        f"- Age bracket: {age_bracket}\n"
        f"- Dominant foot: {foot}\n"
        f"- Context: {match_type}\n"
        + (f"- Jersey: #{jersey}{kit_note}\n" if jersey else "")
        + f"\n{focus_line}\n\n"
    )

    is_game = doc.get("match_type", "") in GAME_MATCH_TYPES
    base = BASE_PROMPT_GAMES if is_game else BASE_PROMPT_TRAINING
    return context + base


def _run_analysis(task_id, doc):
    result = tl_client.analyze(
        video_id=task_id,
        prompt=_build_prompt(doc),
        model_name="pegasus1.2",
    )
    return json.loads(result.data)


def handler(event, context):
    pending = list(coll.find({"job_status": "submitted"}, {
        "_id": 1, "task_id": 1,
        "position": 1, "age_bracket": 1, "dominant_foot": 1,
        "match_type": 1, "jersey_number": 1, "kit_colour": 1,
    }))
    log.info("found %d submitted doc(s) to poll", len(pending))

    updated = 0
    for doc in pending:
        task_id = doc.get("task_id")
        if not task_id:
            log.warning("doc %s has no task_id — skipping", doc["_id"])
            continue

        try:
            task = tl_client.tasks.retrieve(task_id)
            status = getattr(task, "status", None)
            log.info("task_id=%s status=%s", task_id, status)
        except Exception as exc:
            log.error("failed to retrieve task_id=%s: %s", task_id, exc)
            continue

        if status not in {"ready", "failed"}:
            continue

        if status == "failed":
            coll.update_one({"_id": doc["_id"]}, {"$set": {
                "job_status": "failed",
                "error": getattr(task, "error", None),
                "updated_at": _now(),
            }})
            log.info("doc %s → failed", doc["_id"])
            updated += 1
            continue

        # status == "ready" — atomically claim the doc before running analysis
        # (prevents duplicate processing when multiple Poller instances run concurrently)
        claimed = coll.find_one_and_update(
            {"_id": doc["_id"], "job_status": "submitted"},
            {"$set": {"job_status": "processing", "updated_at": _now()}},
        )
        if claimed is None:
            log.info("doc %s already claimed by another poller — skipping", doc["_id"])
            continue

        try:
            report = _run_analysis(task_id, doc)
            coll.update_one({"_id": doc["_id"]}, {"$set": {
                "job_status": "complete",
                "report_output": report,
                "updated_at": _now(),
            }})
            log.info("doc %s → complete (grade=%s)", doc["_id"], report.get("overall_grade"))
            lambda_cli.invoke(
                FunctionName=EMAIL_SENDER_FN,
                InvocationType="Event",
            )
        except Exception as exc:
            log.error("analysis failed for task_id=%s: %s", task_id, exc)
            coll.update_one({"_id": doc["_id"]}, {"$set": {
                "job_status": "analysis_failed",
                "error": str(exc),
                "updated_at": _now(),
            }})
        updated += 1

    return {
        "statusCode": 200,
        "body": json.dumps({"polled": len(pending), "updated": updated}),
    }
