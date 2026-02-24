import json
import re
from pathlib import Path


def apply_overrides_to_instance(instance_dir, sessions):
    manifest_path = instance_dir / "manifest.json"
    log_folder = instance_dir / "session_logs"
    json_folder = instance_dir / "sessions"

    if not manifest_path.exists() or not log_folder.exists() or not json_folder.exists():
        return

    # 1. Load the base manifest
    with open(manifest_path, 'r', encoding='utf-8') as f:
        manifest = json.load(f)

    # 2. Build the session map from the catalog for dual-audio mapping
    session_map = {s.get("Session_ID"): s for s in sessions if s.get("Session_ID")}

    log_files = list(log_folder.glob("*.log"))

    for log_path in log_files:
        json_path = json_folder / f"{log_path.stem}.json"
        if not json_path.exists():
            continue

        with open(json_path, 'r', encoding='utf-8') as f:
            sync_data = json.load(f)

        overrides = {}
        current_seg = None

        # 3. Parse the log file to find where the human moved the '*'
        with open(log_path, 'r', encoding='utf-8') as f:
            for line in f:
                # Find the segment ID block
                seg_match = re.match(r'^(\d+)\s+\|', line)
                if seg_match:
                    current_seg = int(seg_match.group(1))

                    # If this candidate has the asterisk, it's the chosen one
                    if "*" in line:
                        pos_match = re.search(r'\[pos:(\d+)\]', line)
                        if pos_match:
                            overrides[current_seg] = int(pos_match.group(1))

        # 4. Apply overrides
        if overrides:
            overrides_applied = 0
            for entry in sync_data:
                sid = entry.get('seg_id')

                # If the human selected a different position for this segment
                if sid in overrides:
                    new_pos = overrides[sid]
                    n = len(entry['syl_uuids'])
                    new_slice = manifest[new_pos: new_pos + n]

                    # A. Update the Syllabus UUIDs to point to the new text location
                    entry['syl_uuids'] = [m['id'] for m in new_slice]

                    # B. Re-Sync Dual Media (In case the new location is in a different audio session)
                    media_original = ""
                    media_restored = ""

                    for syl in new_slice:
                        for tag in syl.get('tags', []):
                            if tag in session_map:
                                media_original = session_map[tag].get("Audio_Original_URL", "")
                                media_restored = session_map[tag].get("Audio_Restored_URL", "")
                                break
                        if media_original or media_restored:
                            break

                    entry['media_original'] = media_original
                    entry['media_restored'] = media_restored

                    # Clean up legacy fields if they existed
                    if 'media' in entry: del entry['media']
                    if 'media_type' in entry: del entry['media_type']

                    overrides_applied += 1

            # 5. Save the updated JSON back to the sessions folder
            if overrides_applied > 0:
                with open(json_path, 'w', encoding='utf-8') as f:
                    json.dump(sync_data, f, ensure_ascii=False, indent=2)
                print(f"   ✍️ Applied {overrides_applied} manual overrides to: {json_path.name}")


if __name__ == "__main__":
    # 1. Setup paths
    script_dir = Path(__file__).resolve().parent
    output_dir = script_dir / "output"
    catalog_path = output_dir / "catalog.json"

    if not catalog_path.exists():
        print(f"❌ Error: catalog.json not found at {catalog_path}. Run generate_catalog.py first.")
        exit(1)

    with open(catalog_path, "r", encoding="utf-8") as f:
        catalog = json.load(f)

    print("🚀 Scanning all instances for manual overrides in logs...")

    # 2. Iterate dynamically over the catalog structure
    for teaching in catalog:
        for instance in teaching.get("Instances", []):
            instance_id = instance.get("Instance_ID")
            sessions = instance.get("Sessions", [])

            if not instance_id or not sessions:
                continue

            instance_dir = output_dir / instance_id

            # If the instance has been processed in Step 1, apply overrides
            if instance_dir.exists():
                apply_overrides_to_instance(instance_dir, sessions)

    print("🎉 Manual override sweep complete!")