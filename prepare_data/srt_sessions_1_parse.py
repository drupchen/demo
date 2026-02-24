import json
import pysrt
import re
from pathlib import Path
from thefuzz import fuzz
from botok import ChunkTokenizer


def load_audio_map(catalog_path, target_instance_id):
    """Extracts both original and restored audio mappings for a SPECIFIC instance."""
    catalog_path = Path(catalog_path)
    audio_map = {}

    if not catalog_path.exists():
        print(f"Error: {catalog_path} not found.")
        return audio_map

    with catalog_path.open('r', encoding='utf-8') as f:
        catalog = json.load(f)

    for teaching in catalog:
        for instance in teaching.get("Instances", []):
            # --- THE FIX: Filter by Instance_ID ---
            if instance.get("Instance_ID") == target_instance_id:
                for session in instance.get("Sessions", []):
                    session_id = session.get("Session_ID")

                    original_url = session.get("Audio_Original_URL", "")
                    restored_url = session.get("Audio_Restored_URL", "")

                    if session_id and (original_url or restored_url):
                        audio_map[session_id.strip()] = {
                            "original": original_url.strip() if original_url else "",
                            "restored": restored_url.strip() if restored_url else ""
                        }
                # Early exit: we found the instance and built its map, no need to keep scanning
                return audio_map

    return audio_map


def get_clean_syllables(text):
    """Parses SRT text exactly like the base layer, returning only valid text syllables."""
    segments = re.split(r'(<[^>]+>|\n)', text)
    syls = []

    for segment in segments:
        # FIX 1: Use regex to remove spaces (Python's .replace('\s', '') looks for literal backslashes)
        segment = re.sub(r'\s+', '', segment)
        if not segment: continue

        if (segment.startswith('<') and segment.endswith('>')) or segment == '\n':
            continue

        tokenizer = ChunkTokenizer(segment)
        for token_nature, token_text in tokenizer.tokenize():
            if token_nature != 'SPACE' and token_text.strip():
                # FIX 2: Strip the actual token to kill trailing spaces on punctuation
                syls.append(token_text.strip())

    return syls


def sync_and_log_folder(manifest_path, srt_folder, catalog_path, output_folder, log_folder, instance_id):
    manifest_file = Path(manifest_path)
    srt_dir = Path(srt_folder)
    out_dir = Path(output_folder)
    log_dir = Path(log_folder)

    out_dir.mkdir(parents=True, exist_ok=True)
    log_dir.mkdir(parents=True, exist_ok=True)

    with manifest_file.open('r', encoding='utf-8') as f:
        manifest = json.load(f)

    clean_manifest = []
    for idx, m in enumerate(manifest):
        if m.get('nature') != 'SPACE' and m.get('text', '').strip():
            # FIX 3: Strip the manifest text as well
            clean_manifest.append({'text': m['text'].strip(), 'original_idx': idx})

    # Pass the instance_id to properly isolate the audio URLs
    audio_map = load_audio_map(catalog_path, instance_id)
    srt_files = list(srt_dir.glob("*.srt"))

    print(f"Found {len(srt_files)} SRT files. Starting sync...")

    for srt_path in srt_files:
        subs = pysrt.open(str(srt_path), encoding='utf-8')
        base_name = srt_path.stem

        json_out = out_dir / f"{base_name}.json"
        log_out = log_dir / f"{base_name}.log"

        final_sync_data = []

        last_clean_pos = 0
        last_manifest_idx = None

        with log_out.open('w', encoding='utf-8') as log:
            log.write(f"AUDIT LOG FOR: {srt_path.name}\n")
            log.write("-" * 140 + "\n")

            for sub in subs:
                srt_syls = get_clean_syllables(sub.text)
                if not srt_syls:
                    continue

                n = len(srt_syls)
                srt_str = "".join(srt_syls)

                prefix_len = min(5, n)
                target_prefix = srt_syls[:prefix_len]
                target_prefix_str = "".join(target_prefix)

                best_match = None

                for i in range(last_clean_pos, len(clean_manifest) - prefix_len + 1):
                    window_prefix = clean_manifest[i: i + prefix_len]
                    window_prefix_str = "".join([m['text'] for m in window_prefix])

                    # FIX 4: Use a >85% fuzzy match instead of strict ==
                    if fuzz.ratio(window_prefix_str, target_prefix_str) >= 85:
                        window_full = clean_manifest[i: i + n]
                        window_full_str = "".join([m['text'] for m in window_full])
                        score = fuzz.ratio(srt_str, window_full_str)

                        if score >= THRESHOLD:
                            start_idx = clean_manifest[i]['original_idx']
                            end_clean_idx = min(i + n - 1, len(clean_manifest) - 1)
                            current_manifest_end = clean_manifest[end_clean_idx]['original_idx'] + 1

                            best_match = {
                                'clean_pos': i,
                                'score': score,
                                'manifest_start': start_idx,
                                'manifest_end': current_manifest_end,
                                'text': window_full_str
                            }
                            break

                if best_match:
                    ctx = "".join([m['text'] for m in
                                   clean_manifest[max(0, best_match['clean_pos'] - 10):best_match['clean_pos']]])
                    log.write(
                        f"{sub.index:<6} | * A | {best_match['score']:>3}%      | ...{ctx[-30:]:>32} | {best_match['text'][:50]} [pos:{best_match['clean_pos']}]\n")

                    if last_manifest_idx is None:
                        slice_start = best_match['manifest_start']
                    else:
                        slice_start = last_manifest_idx

                    match_slice = manifest[slice_start: best_match['manifest_end']]

                    # --- DUAL AUDIO SYNC MAPPING (WITH PRIORITY) ---
                    media_original = ""
                    media_restored = ""
                    media_ext = ""

                    if match_slice:
                        session_tag = base_name  # e.g., "A3" from "A3.srt"
                        tag_found = None

                        # Pass 1: Try to find the exact tag for THIS specific session
                        for syl in match_slice:
                            if session_tag in syl.get('tags', []) and session_tag in audio_map:
                                tag_found = session_tag
                                break

                        # Pass 2: Fallback to the first available tag if the specific one isn't found
                        if not tag_found:
                            for syl in match_slice:
                                for tag in syl.get('tags', []):
                                    if tag in audio_map:
                                        tag_found = tag
                                        break
                                if tag_found:
                                    break

                        # Apply the audio URLs based on the tag we found
                        if tag_found:
                            media_original = audio_map[tag_found].get("original", "")
                            media_restored = audio_map[tag_found].get("restored", "")

                            url_for_ext = media_restored or media_original
                            if url_for_ext:
                                media_ext = url_for_ext.split('.')[-1].split('?')[0]

                    final_sync_data.append({
                        "seg_id": sub.index,
                        "media_original": media_original,
                        "media_restored": media_restored,
                        "media_type": media_ext,
                        "start": str(sub.start),
                        "end": str(sub.end),
                        "syl_uuids": [m['id'] for m in match_slice]
                    })

                    last_clean_pos = best_match['clean_pos'] + n
                    last_manifest_idx = best_match['manifest_end']
                else:
                    warn_msg = f"WARNING: No match found for SRT Segment {sub.index} (Prefix: {target_prefix_str})."
                    print(warn_msg)
                    log.write(
                        f"{sub.index:<6} | ERROR | NO MATCH FOUND FOR: {srt_str[:40]} | SEARCH STARTED AT: {last_clean_pos}\n")

                log.write("-" * 140 + "\n")

        with json_out.open('w', encoding='utf-8') as f:
            json.dump(final_sync_data, f, ensure_ascii=False, indent=2)
        print(f"Finished: {base_name}")


if __name__ == "__main__":
    THRESHOLD = 80

    base_dir = Path("/media/drupchen/Khyentse Önang/Website/website_data")
    output_dir = Path(__file__).resolve().parent / 'output'
    catalog_path = output_dir / "catalog.json"

    if not catalog_path.exists():
        print(f"❌ Error: catalog.json not found at {catalog_path}.")
        exit(1)

    with open(catalog_path, "r", encoding="utf-8") as f:
        catalog = json.load(f)

    print("🚀 Starting dynamic SRT synchronization (Apples-to-Apples Mode)...")

    for teaching in catalog:
        for instance in teaching.get("Instances", []):
            instance_id = instance.get("Instance_ID")
            teaching_id = instance.get("Teaching_ID")
            if not instance_id: continue

            manifest_path = output_dir / instance_id / 'manifest.json'
            srt_folder = base_dir / "teachings" / instance_id / "srt_files"
            instance_output_folder = output_dir / instance_id / "sessions"
            instance_log_folder = output_dir / instance_id / "session_logs"

            if not manifest_path.exists():
                instance_id = teaching_id
                manifest_path = output_dir / instance_id / 'manifest.json'
                srt_folder = base_dir / "teachings" / instance_id / "srt_files"
                instance_output_folder = output_dir / instance_id / "sessions"
                instance_log_folder = output_dir / instance_id / "session_logs"

            if not manifest_path.exists() or not srt_folder.exists():
                continue

            print(f"\n⏳ Syncing SRTs for Instance: {instance_id}")

            try:
                # --- Pass the Instance ID here ---
                sync_and_log_folder(
                    manifest_path=str(manifest_path),
                    srt_folder=str(srt_folder),
                    catalog_path=str(catalog_path),
                    output_folder=str(instance_output_folder),
                    log_folder=str(instance_log_folder),
                    instance_id=instance_id
                )
                print(f"   ✅ Finished syncing for {instance_id}")
            except Exception as e:
                print(f"   ❌ Error syncing {instance_id}: {e}")

    print("\n🎉 Synchronization complete!")