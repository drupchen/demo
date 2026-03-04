"""
Alignment Correction Tool — Flask backend.

Serves the web UI and provides API endpoints for loading/saving
syllable-to-audio alignment data from the prepare_data pipeline.

Usage:
    cd alignment-tool
    pip install -r requirements.txt
    python app.py
    # Open http://localhost:5000
"""

import os
import re
import json
import shutil

from flask import Flask, jsonify, request, send_from_directory, Response
import requests as http_requests

app = Flask(__name__, static_folder="static", static_url_path="/static")

# Path to the prepare_data output directory
OUTPUT_DIR = os.environ.get(
    "ALIGNMENT_DATA_DIR",
    os.path.join(os.path.dirname(__file__), "..", "prepare_data", "output"),
)
OUTPUT_DIR = os.path.abspath(OUTPUT_DIR)


def natural_sort_key(s):
    """Sort strings with embedded numbers naturally (A1, A2, A10, ...)."""
    return [
        int(part) if part.isdigit() else part.lower()
        for part in re.split(r"(\d+)", s)
    ]


# ── Serve the SPA ──────────────────────────────────────────────

@app.route("/")
def index():
    return send_from_directory("static", "index.html")


# ── API endpoints ──────────────────────────────────────────────

@app.route("/api/instances")
def list_instances():
    """List instance directories that contain a manifest.json."""
    instances = []
    if os.path.isdir(OUTPUT_DIR):
        for name in sorted(os.listdir(OUTPUT_DIR)):
            path = os.path.join(OUTPUT_DIR, name)
            if os.path.isdir(path) and os.path.isfile(os.path.join(path, "manifest.json")):
                instances.append(name)
    return jsonify(instances)


@app.route("/api/manifest/<instance_id>")
def get_manifest(instance_id):
    """Load the full manifest.json for an instance."""
    path = os.path.join(OUTPUT_DIR, instance_id, "manifest.json")
    if not os.path.isfile(path):
        return jsonify({"error": "Manifest not found"}), 404
    with open(path, "r", encoding="utf-8") as f:
        data = json.load(f)
    return jsonify(data)


@app.route("/api/sessions/<instance_id>")
def list_sessions(instance_id):
    """List session files for an instance (naturally sorted, excludes _corrected/_backup)."""
    sessions_dir = os.path.join(OUTPUT_DIR, instance_id, "sessions")
    if not os.path.isdir(sessions_dir):
        return jsonify([])
    sessions = []
    for fname in os.listdir(sessions_dir):
        if fname.endswith(".json") and "_corrected" not in fname and "_backup" not in fname:
            sessions.append(fname.replace(".json", ""))
    sessions.sort(key=natural_sort_key)
    return jsonify(sessions)


@app.route("/api/session/<instance_id>/<session_name>")
def get_session(instance_id, session_name):
    """Load a session JSON. Prefers _corrected.json if it exists."""
    sessions_dir = os.path.join(OUTPUT_DIR, instance_id, "sessions")

    corrected_path = os.path.join(sessions_dir, f"{session_name}_corrected.json")
    original_path = os.path.join(sessions_dir, f"{session_name}.json")

    is_corrected = False
    if os.path.isfile(corrected_path):
        path = corrected_path
        is_corrected = True
    elif os.path.isfile(original_path):
        path = original_path
    else:
        return jsonify({"error": "Session not found"}), 404

    with open(path, "r", encoding="utf-8") as f:
        data = json.load(f)

    return jsonify({"segments": data, "is_corrected": is_corrected, "session_name": session_name})


@app.route("/api/save/<instance_id>/<session_name>", methods=["POST"])
def save_session(instance_id, session_name):
    """Save corrected segments as {session_name}_corrected.json."""
    sessions_dir = os.path.join(OUTPUT_DIR, instance_id, "sessions")
    if not os.path.isdir(sessions_dir):
        return jsonify({"error": "Sessions directory not found"}), 404

    segments = request.get_json()
    if not isinstance(segments, list):
        return jsonify({"error": "Expected a JSON array of segments"}), 400

    # Backup original if no backup exists
    original_path = os.path.join(sessions_dir, f"{session_name}.json")
    backup_path = os.path.join(sessions_dir, f"{session_name}_original_backup.json")
    if os.path.isfile(original_path) and not os.path.isfile(backup_path):
        shutil.copy2(original_path, backup_path)

    # Save corrected version
    corrected_path = os.path.join(sessions_dir, f"{session_name}_corrected.json")
    with open(corrected_path, "w", encoding="utf-8") as f:
        json.dump(segments, f, ensure_ascii=False, indent=2)

    return jsonify({"status": "ok", "path": corrected_path})


@app.route("/api/combine/<instance_id>", methods=["POST"])
def combine_sessions(instance_id):
    """Combine all sessions into {instance_id}_compiled_sessions.json.

    For each base session, prefers _corrected.json over the original.
    Injects global_seg_id and source_session metadata (same as
    srt_sessions_3_combine_sessions.py).
    """
    instance_dir = os.path.join(OUTPUT_DIR, instance_id)
    sessions_dir = os.path.join(instance_dir, "sessions")
    if not os.path.isdir(sessions_dir):
        return jsonify({"error": "Sessions directory not found"}), 404

    # Discover base session names (exclude _corrected, _backup suffixes)
    base_names = set()
    for fname in os.listdir(sessions_dir):
        if not fname.endswith(".json"):
            continue
        stem = fname[:-5]  # strip .json
        if stem.endswith("_corrected"):
            base_names.add(stem[:-10])  # strip _corrected
        elif stem.endswith("_original_backup"):
            continue  # skip backups entirely
        else:
            base_names.add(stem)

    all_segments = []
    corrected_count = 0
    original_count = 0

    for name in sorted(base_names, key=natural_sort_key):
        corrected_path = os.path.join(sessions_dir, f"{name}_corrected.json")
        original_path = os.path.join(sessions_dir, f"{name}.json")

        if os.path.isfile(corrected_path):
            path = corrected_path
            corrected_count += 1
        elif os.path.isfile(original_path):
            path = original_path
            original_count += 1
        else:
            continue

        with open(path, "r", encoding="utf-8") as f:
            try:
                session_data = json.load(f)
            except Exception:
                continue

        for segment in session_data:
            segment["global_seg_id"] = f"{name}_seg{segment.get('seg_id', 0)}"
            segment["source_session"] = name

        all_segments.extend(session_data)

    if not all_segments:
        return jsonify({"error": "No segments found to combine"}), 400

    output_path = os.path.join(instance_dir, f"{instance_id}_compiled_sessions.json")
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(all_segments, f, ensure_ascii=False, indent=2)

    return jsonify({
        "status": "ok",
        "total_segments": len(all_segments),
        "sessions_corrected": corrected_count,
        "sessions_original": original_count,
        "path": output_path,
    })


@app.route("/api/audio-proxy")
def audio_proxy():
    """Proxy remote audio to avoid CORS. Supports Range requests for seeking."""
    url = request.args.get("url")
    if not url:
        return jsonify({"error": "Missing url parameter"}), 400

    headers = {}
    if "Range" in request.headers:
        headers["Range"] = request.headers["Range"]

    try:
        resp = http_requests.get(url, headers=headers, stream=True, timeout=30)
    except http_requests.RequestException as e:
        return jsonify({"error": str(e)}), 502

    # Determine content type from URL extension
    ext = url.rsplit(".", 1)[-1].lower() if "." in url else "mp4"
    content_types = {
        "m4a": "audio/mp4",
        "mp4": "audio/mp4",
        "mp3": "audio/mpeg",
        "ogg": "audio/ogg",
        "wav": "audio/wav",
    }
    content_type = content_types.get(ext, "audio/mp4")

    response_headers = {
        "Content-Type": content_type,
        "Accept-Ranges": "bytes",
    }
    if "Content-Range" in resp.headers:
        response_headers["Content-Range"] = resp.headers["Content-Range"]
    if "Content-Length" in resp.headers:
        response_headers["Content-Length"] = resp.headers["Content-Length"]

    return Response(
        resp.iter_content(chunk_size=8192),
        status=resp.status_code,
        headers=response_headers,
    )


if __name__ == "__main__":
    print(f"Data directory: {OUTPUT_DIR}")
    print(f"Open http://localhost:5000")
    app.run(debug=True, port=5000)
