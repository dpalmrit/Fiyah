# ScoutLogi_TwelveLabsPoller -- Lambda handler (v6)
# Runs every 1 minute via EventBridge.
# Polls TwelveLabs for task status on all submitted player_sessions docs.
# On ready: atomically claims doc (submitted→processing) then runs scout analyze().
#
# v5 changes:
#   - Game sessions: 3 windowed analyze() calls (each ~1/3 of match duration)
#     → 2 observations per window = 6 total, spread across full match
#   - 4th call synthesises overall_grade + summary from merged feedback
#   - All language is observational only — no definitive ability claims
#   - timestamps required as array (2+ per item) for game sessions

import os
import re
import json
import logging
from datetime import datetime, timezone, timedelta

import boto3
from twelvelabs import TwelveLabs
from twelvelabs.types.video_context import VideoContext_AssetId
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

INDEX_ID = os.environ.get("TWELVELABS_INDEX_ID", "69e86dd4ee1ea6f59f0308d9")

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

# ── Windowed prompt (games): 2 observations per time segment ──────────────────
WINDOW_PROMPT = """You are a soccer scout reviewing a specific segment of match footage.

Analyze ONLY the footage in this segment and return EXACTLY 2 observations as JSON.
Use observational language only — describe what you saw, not absolute ability claims.

Return this structure (no extra fields, no markdown):

{{
  "feedback": [
    {{
      "category": "<skill category most relevant to this position, specific to what you observed in this segment>",
      "rating": "<green/yellow/red>",
      "comment": "<1 sentence describing what was visibly observed in this segment — use language like 'appeared to', 'was observed to', 'showed signs of', 'in this passage of play'>",
      "timestamps": ["<MM:SS>", "<MM:SS>"]
    }}
  ]
}}

Language rules — strictly enforced:
- Use observational framing: "appeared to", "was observed to", "showed signs of", "in this footage"
- Do NOT use definitive claims: no "exceptional", "elite", "always", "consistently", "never"
- Do NOT claim attributes that require a metric (speed, strength, endurance) without a visible moment to cite
- Each observation must reference something visible in this specific footage segment

Rating guide: green = clear strength observed, yellow = adequate/mixed, red = clear weakness observed.

TIMESTAMPS REQUIRED FOR EVERY ITEM:
- Search this segment for moments that support each observation
- Provide 2-3 timestamps per item as MM:SS strings in the original video timecode
- Timestamps must be real moments from this footage segment, not estimated

Return only valid JSON — no preamble, no markdown."""

# ── Summary prompt (games): synthesise grade + summary from merged feedback ───
SUMMARY_PROMPT = """You are a soccer scout writing a match report summary.

Based on the observed feedback items below, return an overall grade and summary as JSON.
Use observational language only — the report reflects what was seen in this specific match.

Observed feedback:
{feedback_json}

Return this structure (no extra fields, no markdown):

{{
  "overall_grade": "<A/B/C/D/F>",
  "summary": "<2-3 sentences summarising what was observed across the full match — use phrases like 'showed', 'appeared to', 'was observed to', 'in this match demonstrated'. Do not make claims about the player's general ability beyond what the footage showed.>"
}}

Grade guide: calibrate to the player's age bracket ({age_bracket}) — an A for a U12 is different from an A for a U18.
The grade should reflect the overall pattern of observations across all segments of the match.

Return only valid JSON — no preamble, no markdown."""

# ── Training prompt (no timestamps, no windowing needed) ─────────────────────
BASE_PROMPT_TRAINING = """You are a soccer scout reviewing training session footage.

Analyze the footage and return a JSON report with EXACTLY this structure (no extra fields, no markdown):

{{
  "overall_grade": "<A/B/C/D/F>",
  "summary": "<2-3 sentence summary using observational language — 'appeared to', 'was observed to', 'showed signs of'>",
  "feedback": [
    {{
      "category": "<skill category relevant to this position>",
      "rating": "<green/yellow/red>",
      "comment": "<1 sentence describing what was visibly observed — no definitive ability claims>"
    }}
  ]
}}

Language rules:
- Use observational framing only: "appeared to", "was observed to", "showed signs of"
- Do NOT use: "exceptional", "elite", "always", "consistently", "never"
- Do NOT claim speed/strength/endurance without a visible moment

Rating guide: green = clear strength observed, yellow = adequate/mixed, red = clear weakness observed.
Grade guide: calibrate to the player's age bracket.
Include 4-6 feedback items focused on the skills most important for this player's position.
Return only valid JSON. No preamble, no explanation, no markdown code fences."""


_PROMPT_STRIP = re.compile(r'[\x00-\x1f\x7f\{\}\\]')


def _safe(value: str, max_len: int = 60) -> str:
    """Strip control characters and prompt-structural characters from user-supplied fields."""
    return _PROMPT_STRIP.sub('', str(value or ''))[:max_len].strip()


def _now():
    return datetime.now(timezone.utc).isoformat()


def _normalise_ts(ts):
    """Convert HH:MM:SS → MM:SS (total minutes) for soccer match timecodes."""
    parts = ts.strip().split(':')
    if len(parts) == 3:
        h, m, s = int(parts[0]), int(parts[1]), int(parts[2])
        return f"{h * 60 + m:02d}:{s:02d}"
    return ts


def _normalise_feedback_timestamps(feedback):
    for item in feedback:
        if 'timestamps' in item:
            item['timestamps'] = [_normalise_ts(t) for t in item['timestamps']]
        elif 'timestamp' in item:
            item['timestamp'] = _normalise_ts(item['timestamp'])
    return feedback


def _player_context(doc):
    position    = _safe(doc.get("position", ""),    max_len=10)
    age_bracket = _safe(doc.get("age_bracket", ""), max_len=10)
    raw_match   = doc.get("match_type", "")
    match_type  = MATCH_TYPE_LABEL.get(raw_match, _safe(raw_match, max_len=20))
    jersey      = _safe(doc.get("jersey_number", ""), max_len=3)
    foot        = _safe(doc.get("dominant_foot", ""), max_len=10)
    kit_colour  = _safe(doc.get("kit_colour", ""),    max_len=20)

    pos_context = POSITION_CONTEXT.get(position, f"playing {position}")
    kit_note    = f" in the {kit_colour.lower()} kit" if kit_colour else ""
    focus_line  = (
        f"Focus exclusively on jersey #{jersey}{kit_note}. "
        f"If both teams have a #{jersey}, analyse only the player{kit_note}."
        if jersey else ""
    )
    return (
        f"Player details:\n"
        f"- Position: {position} ({pos_context})\n"
        f"- Age bracket: {age_bracket}\n"
        f"- Dominant foot: {foot}\n"
        f"- Context: {match_type}\n"
        + (f"- Jersey: #{jersey}{kit_note}\n" if jersey else "")
        + f"\n{focus_line}\n\n"
    )


def _get_video_duration(video_id):
    """Retrieve precise video duration in seconds from TwelveLabs index."""
    try:
        video = tl_client.indexes.videos.retrieve(INDEX_ID, video_id)
        sm = getattr(video, "system_metadata", None)
        if sm:
            return getattr(sm, "duration", None)
    except Exception as exc:
        log.warning("could not retrieve video duration: %s", exc)
    return None


def _run_game_analysis(video_id, doc):
    """
    Three windowed pegasus1.5 analyze() calls (start_time/end_time) across thirds
    of the match, each producing 2 feedback items with timestamps from that window.
    A 4th call synthesises overall_grade + summary from the merged 6 items.
    Requires VideoContext_AssetId (pegasus1.5 does not accept video_id directly).
    """
    duration = _get_video_duration(video_id)
    if not duration:
        log.warning("duration unknown — falling back to single full-video call")
        return _run_single_analysis(video_id, doc)

    video_obj = VideoContext_AssetId(asset_id=video_id)
    third     = duration / 3
    # Subtract a small buffer on the last window to avoid floating-point overshoot errors
    windows = [
        (0,         third,          f"00:00 – {int(third//60):02d}:{int(third%60):02d}"),
        (third,     2 * third,      f"{int(third//60):02d}:{int(third%60):02d} – {int(2*third//60):02d}:{int(2*third%60):02d}"),
        (2 * third, duration - 0.5, f"{int(2*third//60):02d}:{int(2*third%60):02d} – {int(duration//60):02d}:{int((duration-1)%60):02d}"),
    ]

    context      = _player_context(doc)
    all_feedback = []

    for idx, (start, end, label) in enumerate(windows):
        seg_note = f"This segment covers {label} of the match.\n\n"
        prompt   = context + seg_note + WINDOW_PROMPT
        log.info("analyzing segment %d/3 %.0f–%.0f", idx + 1, start, end)

        try:
            result = tl_client.analyze(
                video=video_obj,
                prompt=prompt,
                model_name="pegasus1.5",
                start_time=float(start),
                end_time=float(end),
            )
            data  = json.loads(result.data)
            items = _normalise_feedback_timestamps(data.get("feedback", []))
            log.info("segment %d: %d items", idx + 1, len(items))
            all_feedback.extend(items)
        except Exception as exc:
            log.error("segment %d analysis failed: %s", idx + 1, exc)

    if not all_feedback:
        raise RuntimeError("all windowed analysis calls failed")

    age_bracket    = _safe(doc.get("age_bracket", ""), max_len=10)
    summary_prompt = SUMMARY_PROMPT.format(
        feedback_json=json.dumps(all_feedback, indent=2),
        age_bracket=age_bracket,
    )
    log.info("synthesising summary from %d feedback items", len(all_feedback))
    summary_result = tl_client.analyze(
        video=video_obj,
        prompt=summary_prompt,
        model_name="pegasus1.5",
    )
    summary_data = json.loads(summary_result.data)

    return {
        "overall_grade": summary_data.get("overall_grade", "B"),
        "summary":       summary_data.get("summary", ""),
        "feedback":      all_feedback,
    }


def _run_single_analysis(video_id, doc):
    """Single full-video call for training sessions (no windowing needed)."""
    context = _player_context(doc)
    prompt  = context + BASE_PROMPT_TRAINING
    result  = tl_client.analyze(
        video_id=video_id,
        prompt=prompt,
        model_name="pegasus1.2",
    )
    return json.loads(result.data)


def _fire_failure_alert(session_id: str):
    """Async-invoke EmailSender in failure_alert mode. Dedup handled in EmailSender."""
    try:
        lambda_cli.invoke(
            FunctionName=EMAIL_SENDER_FN,
            InvocationType="Event",
            Payload=json.dumps({"mode": "failure_alert", "session_id": session_id}).encode(),
        )
        log.info("failure alert queued for session %s", session_id)
    except Exception as exc:
        log.error("could not queue failure alert for %s: %s", session_id, exc)


def handler(event, context):
    # Recover docs stuck in 'processing' beyond Lambda max runtime (15 min).
    # This happens when a Lambda invocation times out or crashes mid-analysis.
    stale_cutoff = (datetime.now(timezone.utc) - timedelta(minutes=25)).isoformat()
    recovered = coll.update_many(
        {"job_status": "processing", "updated_at": {"$lt": stale_cutoff}},
        {"$set": {"job_status": "submitted", "updated_at": _now()}},
    ).modified_count
    if recovered:
        log.warning("reset %d stale processing doc(s) back to submitted", recovered)

    # Send failure alerts for sessions stuck in processing/submitted >30 min
    # (de-duped by failure_alert_sent flag in EmailSender)
    alert_cutoff = (datetime.now(timezone.utc) - timedelta(minutes=30)).isoformat()
    stalled_docs = list(coll.find(
        {
            "job_status":          {"$in": ["processing", "submitted"]},
            "updated_at":          {"$lt": alert_cutoff},
            "failure_alert_sent":  {"$ne": True},
        },
        {"_id": 1},
    ).limit(5))
    for stalled in stalled_docs:
        log.warning("stall alert queued for session %s (>30 min in flight)", stalled["_id"])
        _fire_failure_alert(str(stalled["_id"]))

    pending = list(coll.find({"job_status": "submitted"}, {
        "_id": 1, "task_id": 1,
        "position": 1, "age_bracket": 1, "dominant_foot": 1,
        "match_type": 1, "jersey_number": 1, "kit_colour": 1,
    }).limit(20))
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
                "job_status":   "failed",
                "error":        getattr(task, "error", None),
                "error_detail": str(getattr(task, "error", "TwelveLabs indexing failed")),
                "error_stage":  "indexing",
                "updated_at":   _now(),
            }})
            log.info("doc %s → failed", doc["_id"])
            _fire_failure_alert(str(doc["_id"]))
            # Cascade failure to any players waiting on this shared video
            if doc.get("is_team_uploader") and doc.get("match_id"):
                cascaded = coll.update_many(
                    {"match_id": doc["match_id"], "job_status": {"$in": ["pending_match", "submitted"]}},
                    {"$set": {"job_status": "failed", "error": "Shared video indexing failed", "updated_at": _now()}},
                ).modified_count
                if cascaded:
                    log.warning("cascaded failure to %d team player(s)", cascaded)
            updated += 1
            continue

        claimed = coll.find_one_and_update(
            {"_id": doc["_id"], "job_status": "submitted"},
            {"$set": {"job_status": "processing", "updated_at": _now()}},
        )
        if claimed is None:
            log.info("doc %s already claimed by another poller — skipping", doc["_id"])
            continue

        try:
            is_game = doc.get("match_type", "") in GAME_MATCH_TYPES
            if is_game:
                report = _run_game_analysis(task_id, doc)
            else:
                report = _run_single_analysis(task_id, doc)

            coll.update_one({"_id": doc["_id"]}, {"$set": {
                "job_status":    "complete",
                "report_output": report,
                "updated_at":    _now(),
            }})
            log.info("doc %s → complete (grade=%s)", doc["_id"], report.get("overall_grade"))
            session_id_str = str(doc["_id"])
            # Fire report email sweep
            lambda_cli.invoke(FunctionName=EMAIL_SENDER_FN, InvocationType="Event")
            # Notify pending event claims for this session
            lambda_cli.invoke(
                FunctionName=EMAIL_SENDER_FN,
                InvocationType="Event",
                Payload=json.dumps({"mode": "event_claim", "session_id": session_id_str}).encode(),
            )
        except Exception as exc:
            log.error("analysis failed for task_id=%s: %s", task_id, exc)
            coll.update_one({"_id": doc["_id"]}, {"$set": {
                "job_status":   "analysis_failed",
                "error":        str(exc)[:300],
                "error_detail": str(exc)[:300],
                "error_stage":  "analysis",
                "updated_at":   _now(),
            }})
            _fire_failure_alert(str(doc["_id"]))
        updated += 1

    return {
        "statusCode": 200,
        "body": json.dumps({"polled": len(pending), "updated": updated}),
    }
