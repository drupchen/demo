import json
import re
import os
from pathlib import Path


def load_audio_map(tsv_path):
    audio_map = {}
    if not os.path.exists(tsv_path): return audio_map
    with open(tsv_path, 'r', encoding='utf-8') as f:
        for line in f:
            parts = line.strip().split()
            if len(parts) >= 2: audio_map[parts[0]] = parts[-1]
    return audio_map


def apply_overrides_folder(manifest_path, log_folder, json_folder, audio_tsv):
    with open(manifest_path, 'r', encoding='utf-8') as f:
        manifest = json.load(f)

    audio_map = load_audio_map(audio_tsv)
    log_files = list(Path(log_folder).glob("*.log"))

    for log_path in log_files:
        json_path = Path(json_folder) / f"{log_path.stem}.json"
        if not json_path.exists(): continue

        with open(json_path, 'r', encoding='utf-8') as f:
            sync_data = json.load(f)

        overrides = {}
        current_seg = None
        with open(log_path, 'r', encoding='utf-8') as f:
            for line in f:
                seg_match = re.match(r'^(\d+)\s+', line)
                if seg_match: current_seg = int(seg_match.group(1))
                if "*" in line and current_seg:
                    pos_match = re.search(r'\[pos:(\d+)\]', line)
                    if pos_match: overrides[current_seg] = int(pos_match.group(1))

        if overrides:
            for entry in sync_data:
                sid = entry.get('seg_id')
                if sid in overrides:
                    new_pos = overrides[sid]
                    n = len(entry['syl_uuids'])
                    new_slice = manifest[new_pos: new_pos + n]

                    # Update IDs
                    entry['syl_uuids'] = [m['id'] for m in new_slice]

                    # Re-Sync Media (In case override moved segment to a new audio file)
                    media_url = ""
                    if new_slice:
                        for tag in new_slice[0].get('tags', []):
                            if tag in audio_map:
                                media_url = audio_map[tag]
                                break
                    entry['media'] = media_url
                    entry['media_type'] = media_url.split('.')[-1].split('?')[0] if media_url else ""

            with open(json_path, 'w', encoding='utf-8') as f:
                json.dump(sync_data, f, ensure_ascii=False, indent=2)
            print(f"Applied overrides to: {json_path.name}")


if __name__ == "__main__":
    apply_overrides_folder(
        manifest_path='output/recitation_manual_tib_manifest.json',
        log_folder='output/session_logs',
        json_folder='output/sessions',
        audio_tsv='input/audio_sources.tsv'
    )