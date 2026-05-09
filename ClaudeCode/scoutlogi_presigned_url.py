import json
import os
import uuid
import boto3
from botocore.exceptions import ClientError

s3 = boto3.client("s3")

BUCKET = os.environ["S3_BUCKET"]
PREFIX = os.environ.get("S3_PREFIX", "clips/")
URL_EXPIRY = int(os.environ.get("URL_EXPIRY_SECONDS", "300"))

ALLOWED_ORIGINS = [
    "https://pitchscout.ai",
    "https://www.pitchscout.ai",
    "https://dpalmrit.github.io",
]

CORS_HEADERS = {
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
}


def cors_headers(event):
    origin = (event.get("headers") or {}).get("origin", "")
    allowed = origin if origin in ALLOWED_ORIGINS else ALLOWED_ORIGINS[0]
    return {**CORS_HEADERS, "Access-Control-Allow-Origin": allowed}


def respond(status, body, event):
    return {
        "statusCode": status,
        "headers": {"Content-Type": "application/json", **cors_headers(event)},
        "body": json.dumps(body),
    }


def lambda_handler(event, context):
    # Handle CORS preflight
    if event.get("requestContext", {}).get("http", {}).get("method") == "OPTIONS":
        return {"statusCode": 204, "headers": cors_headers(event), "body": ""}

    try:
        body = json.loads(event.get("body") or "{}")
    except json.JSONDecodeError:
        return respond(400, {"error": "Invalid JSON body"}, event)

    email = (body.get("email") or "").strip().lower()
    filename = (body.get("filename") or "").strip()
    content_type = (body.get("content_type") or "video/mp4").strip()

    if not email or "@" not in email:
        return respond(400, {"error": "Valid email required"}, event)
    if not filename:
        return respond(400, {"error": "filename required"}, event)
    if not content_type.startswith("video/"):
        return respond(400, {"error": "Only video/* content types accepted"}, event)

    session_id = str(uuid.uuid4())
    ext = filename.rsplit(".", 1)[-1] if "." in filename else "mp4"
    s3_key = f"{PREFIX}{session_id}.{ext}"

    try:
        presigned_url = s3.generate_presigned_url(
            "put_object",
            Params={
                "Bucket": BUCKET,
                "Key": s3_key,
                "ContentType": content_type,
                "Metadata": {"email": email, "original_filename": filename},
            },
            ExpiresIn=URL_EXPIRY,
        )
    except ClientError as e:
        print(f"ERROR generating presigned URL: {e}")
        return respond(500, {"error": "Could not generate upload URL"}, event)

    return respond(
        200,
        {
            "upload_url": presigned_url,
            "session_id": session_id,
            "s3_key": s3_key,
            "expires_in": URL_EXPIRY,
        },
        event,
    )
