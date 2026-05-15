import json
import math
import os
import secrets
import string
import uuid
from datetime import datetime, timezone, timedelta

import boto3
from botocore.exceptions import ClientError
from pymongo import MongoClient

s3 = boto3.client("s3")

BUCKET              = os.environ["S3_BUCKET"]
PREFIX              = os.environ.get("S3_PREFIX", "clips/")
URL_EXPIRY          = int(os.environ.get("URL_EXPIRY_SECONDS", "3600"))
PART_SIZE           = 50 * 1024 * 1024   # 50 MB per part
MULTIPART_THRESHOLD = 100 * 1024 * 1024  # files > 100 MB use multipart
MONGO_URI  = os.environ["MONGODB_URI"]
MONGO_DB   = os.environ.get("MONGODB_DB", "scoutlogi")
MONGO_COLL = os.environ.get("MONGODB_COLLECTION", "player_sessions")

mongo        = MongoClient(MONGO_URI)
db           = mongo[MONGO_DB]
coll         = db[MONGO_COLL]
allowlist    = db["beta_allowlist"]
event_roster = db["event_roster"]
admin_users  = db["admin_users"]


ALLOWED_ORIGINS = [
    "https://pitchscout.ai",
    "https://www.pitchscout.ai",
    "https://demo.pitchscout.ai",
    "https://dpalmrit.github.io",
]

VALID_POSITIONS   = {"GK","CB","LB","RB","CDM","CM","CAM","LW","RW","ST"}
VALID_AGE         = {"U13","U14","U15","U16","U17","U18","U19","Other"}
VALID_FOOT        = {"Right","Left","Both"}
VALID_MATCH_TYPE  = {"Friendly","League","Tournament","Training"}

CORS_HEADERS = {
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
}


def cors_headers(event):
    origin = (event.get("headers") or {}).get("origin", "")
    allowed = origin if origin in ALLOWED_ORIGINS else "null"
    return {**CORS_HEADERS, "Access-Control-Allow-Origin": allowed}


def respond(status, body, event):
    return {
        "statusCode": status,
        "headers": {"Content-Type": "application/json", **cors_headers(event)},
        "body": json.dumps(body),
    }


def lambda_handler(event, context):
    if event.get("requestContext", {}).get("http", {}).get("method") == "OPTIONS":
        return {"statusCode": 204, "headers": cors_headers(event), "body": ""}

    # Extract email from JWT claims (set by Cognito authorizer)
    try:
        claims = event["requestContext"]["authorizer"]["jwt"]["claims"]
        email  = claims.get("email", "").strip().lower()
    except (KeyError, TypeError):
        return respond(401, {"error": "Unauthorized"}, event)

    if not email or "@" not in email:
        return respond(401, {"error": "No email in token"}, event)

    try:
        body = json.loads(event.get("body") or "{}")
    except json.JSONDecodeError:
        return respond(400, {"error": "Invalid JSON body"}, event)

    filename      = str(body.get("filename") or "").strip()
    content_type  = str(body.get("content_type") or "video/mp4").strip()
    jersey_number = str(body.get("jersey_number") or "").strip()
    dominant_foot = str(body.get("dominant_foot") or "Right").strip()
    position      = str(body.get("position") or "").strip().upper()
    age_bracket   = str(body.get("age_bracket") or "").strip()
    match_type    = str(body.get("match_type") or "Friendly").strip()
    team_upload   = bool(body.get("team_upload", False))
    event_id      = str(body.get("event_id") or "").strip().lower() or None

    is_event_upload = bool(event_id)

    # ── Auth gate ─────────────────────────────────────────────────────────────
    if is_event_upload:
        # Event uploads bypass the beta allowlist — coach is Cognito-authenticated.
        # Verify the coach is assigned to this event.
        coach_doc = admin_users.find_one({"email": email, "role": "coach"})
        if not coach_doc:
            # Full admins / superusers can also upload to events
            admin_doc = admin_users.find_one({"email": email, "role": {"$in": ["admin", "superuser"]}})
            if not admin_doc:
                return respond(403, {"error": "not_authorised_for_event_upload"}, event)
        elif event_id not in (coach_doc.get("assigned_events") or []):
            return respond(403, {"error": "not_assigned_to_this_event"}, event)
    else:
        if not allowlist.find_one({"email": email}):
            return respond(403, {"error": "not_on_beta_list"}, event)

    if not filename:
        return respond(400, {"error": "filename required"}, event)
    if not jersey_number:
        return respond(400, {"error": "jersey_number required"}, event)

    # ── Jersey validation ─────────────────────────────────────────────────────
    if is_event_upload:
        # Event rosters allow any jersey string (1-99 or non-standard)
        jersey_number = jersey_number[:10]
    else:
        try:
            jersey_int = int(jersey_number)
            if jersey_int < 1 or jersey_int > 99:
                raise ValueError
            jersey_number = str(jersey_int)
        except ValueError:
            return respond(400, {"error": "jersey_number must be an integer between 1 and 99"}, event)

    # ── Release gate (event uploads only) ─────────────────────────────────────
    if is_event_upload:
        roster_doc = event_roster.find_one({"event_id": event_id, "jersey_number": jersey_number})
        if not roster_doc:
            return respond(403, {"error": f"Jersey #{jersey_number} not on roster for event '{event_id}'. Add the player first."}, event)
        if not roster_doc.get("release_signed"):
            return respond(403, {"error": f"release_not_signed", "message": f"Parent release for Jersey #{jersey_number} has not been signed yet."}, event)
    if not content_type.startswith("video/"):
        return respond(400, {"error": "Only video/* content types accepted"}, event)

    if position and position not in VALID_POSITIONS:
        return respond(400, {"error": f"Invalid position. Must be one of: {', '.join(sorted(VALID_POSITIONS))}"}, event)
    if age_bracket and age_bracket not in VALID_AGE:
        return respond(400, {"error": f"Invalid age_bracket"}, event)
    if dominant_foot and dominant_foot not in VALID_FOOT:
        return respond(400, {"error": f"Invalid dominant_foot"}, event)
    if match_type and match_type not in VALID_MATCH_TYPE:
        return respond(400, {"error": f"Invalid match_type"}, event)

    file_size = int(body.get("file_size") or 0)
    if file_size > 5 * 1024 * 1024 * 1024:
        return respond(400, {"error": "File exceeds 5 GB limit"}, event)

    # Rate-limit: max 3 pending/submitted uploads per email in the last hour
    cutoff = (datetime.now(timezone.utc) - timedelta(hours=1)).isoformat()
    recent = coll.count_documents({
        "email": email,
        "job_status": {"$in": ["pending_upload", "submitted"]},
        "created_at": {"$gte": cutoff},
    })
    if recent >= 3:
        return respond(429, {"error": "Too many uploads in progress. Please wait before submitting another."}, event)

    ext    = filename.rsplit(".", 1)[-1] if "." in filename else "mp4"
    s3_key = f"{PREFIX}{str(uuid.uuid4())}.{ext}"

    report_token = secrets.token_hex(16)  # 32-char hex, unguessable report URL

    # Team upload: generate a join_code so other players can link to this video
    _JOIN_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'  # no ambiguous 0/O/1/I/L
    match_id  = str(uuid.uuid4()) if team_upload else None
    join_code = ''.join(secrets.choice(_JOIN_CHARS) for _ in range(6)) if team_upload else None

    now = datetime.now(timezone.utc).isoformat()
    doc = {
        "email":          email,
        "jersey_number":  jersey_number,
        "dominant_foot":  dominant_foot,
        "position":       position,
        "age_bracket":    age_bracket,
        "match_type":     match_type,
        "kit_colour":     str(body.get("kit_colour") or "").strip(),
        "video_filename": filename,
        "s3_key":         s3_key,
        "job_status":     "pending_upload",
        "report_token":   report_token,
        "created_at":     now,
        "updated_at":     now,
    }
    if event_id:
        doc["event_id"] = event_id
    if team_upload:
        doc["is_team_uploader"] = True
        doc["match_id"]         = match_id
        doc["join_code"]        = join_code
        doc["shared_video"]     = True
    result = coll.insert_one(doc)
    session_id = str(result.inserted_id)

    if file_size > MULTIPART_THRESHOLD:
        try:
            mpu = s3.create_multipart_upload(
                Bucket=BUCKET,
                Key=s3_key,
                ContentType=content_type,
            )
        except ClientError as e:
            print(f"ERROR creating multipart upload: {e}")
            return respond(500, {"error": "Could not initiate upload"}, event)

        upload_id   = mpu["UploadId"]
        total_parts = math.ceil(file_size / PART_SIZE)
        try:
            part_urls = [
                s3.generate_presigned_url(
                    "upload_part",
                    Params={"Bucket": BUCKET, "Key": s3_key,
                            "UploadId": upload_id, "PartNumber": n},
                    ExpiresIn=URL_EXPIRY,
                )
                for n in range(1, total_parts + 1)
            ]
        except ClientError as e:
            print(f"ERROR generating part URLs: {e}")
            s3.abort_multipart_upload(Bucket=BUCKET, Key=s3_key, UploadId=upload_id)
            return respond(500, {"error": "Could not generate upload URLs"}, event)

        return respond(200, {
            "multipart":     True,
            "upload_id":     upload_id,
            "part_urls":     part_urls,
            "part_size":     PART_SIZE,
            "total_parts":   total_parts,
            "session_id":    session_id,
            "report_token":  report_token,
            "s3_key":        s3_key,
            "expires_in":    URL_EXPIRY,
            **({"join_code": join_code, "match_id": match_id} if team_upload else {}),
        }, event)

    else:
        try:
            presigned_url = s3.generate_presigned_url(
                "put_object",
                Params={"Bucket": BUCKET, "Key": s3_key, "ContentType": content_type},
                ExpiresIn=URL_EXPIRY,
            )
        except ClientError as e:
            print(f"ERROR generating presigned URL: {e}")
            return respond(500, {"error": "Could not generate upload URL"}, event)

        return respond(200, {
            "multipart":    False,
            "upload_url":   presigned_url,
            "session_id":   session_id,
            "report_token": report_token,
            "s3_key":       s3_key,
            "expires_in":   URL_EXPIRY,
            **({"join_code": join_code, "match_id": match_id} if team_upload else {}),
        }, event)
