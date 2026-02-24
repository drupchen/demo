import json
import pysrt
import os
from pathlib import Path
from thefuzz import fuzz
from botok import ChunkTokenizer


def sync_srt_to_manifest(srt_path, manifest, session_map, output_file, log_file, threshold=80):
    """Processes a single SRT file against the loaded manifest."""
    subs = pysrt.open(str(srt_path), encoding='utf-8')

    final_sync_data = []
    last_pos_end = 0

    with open(log_file, 'w', encoding='utf-8') as log:
        log.write(f"AUDIT LOG FOR: {srt_path.name}\n")
        log.write("-" * 140 + "\n")

        for sub in subs:
            tokenizer = ChunkTokenizer(sub.text)
            srt_tokens = [t[1] for t in tokenizer.tokenize()]
            srt_str = "".join(srt_tokens).strip()
            n = len(srt_tokens)

            if n == 0:
                continue

            # Search Manifest
            candidates = []

            # --- STRICT PROGRESSION ---
            start_search_idx = last_pos_end
            prefix_len = min(5, n)
            srt_prefix_str = "".join(srt_tokens[:prefix_len]).strip()

            for i in range(start_search_idx, len(manifest) - n + 1):
                m_slice = manifest[i: i + n]

                # Prefix validation
                m_prefix_str = "".join([m['text'] for m in m_slice[:prefix_len]]).strip()
                if fuzz.ratio(srt_prefix_str, m_prefix_str) < 80:
                    continue

                m_str = "".join([m['text'] for m in m_slice]).strip()
                base = fuzz.ratio(srt_str, m_str)

                # Disable boost for the very first segment
                boost = 0
                if last_pos_end != 0:
                    boost = 25 if i == last_pos_end else (15 if abs(i - last_pos_end) < 20 else 0)

                # --- UNCAPPED SCORING ---
                score = base + boost

                if score >= threshold:
                    candidates.append({'pos': i, 'score': score, 'text': m_str, 'base': base})

            unique_cands = []
            if candidates:
                candidates.sort(key=lambda x: x['pos'])
                group = [candidates[0]]
                for m in candidates[1:]:
                    if m['pos'] <= group[-1]['pos'] + n:
                        group.append(m)
                    else:
                        unique_cands.append(max(group, key=lambda x: x['score']))
                        group = [m]
                unique_cands.append(max(group, key=lambda x: x['score']))

            if unique_cands:
                unique_cands.sort(key=lambda x: x['score'], reverse=True)
                best = unique_cands[0]

                # Audit Log Entry
                for idx, cand in enumerate(unique_cands):
                    pick = "*" if idx == 0 else " "
                    label = chr(65 + idx) if idx < 26 else f"Z{idx}"
                    ctx = "".join([m['text'] for m in manifest[max(0, cand['pos'] - 25):cand['pos']]]).strip()[-30:]

                    log.write(
                        f"{sub.index:<6} | {pick} {label:<2} | {cand['score']:>3}%      | ...{ctx:<32} | {cand['text'][:50]} [pos:{cand['pos']}]\n")

                # --- STRICT MATCH SLICE (Exactly as Tokenized) ---
                match_slice = manifest[best['pos']: best['pos'] + n]

                # DUAL-MEDIA MAPPING (Original & Restored)
                media_original = ""
                media_restored = ""

                for syl in match_slice:
                    for tag in syl.get('tags', []):
                        if tag in session_map:
                            media_original = session_map[tag].get("Audio_Original_URL", "")
                            media_restored = session_map[tag].get("Audio_Restored_URL", "")
                            break
                    if media_original or media_restored:
                        break

                final_sync_data.append({
                    "seg_id": sub.index,
                    "media_original": media_original,
                    "media_restored": media_restored,
                    "start": str(sub.start),
                    "end": str(sub.end),
                    "syl_uuids": [m['id'] for m in match_slice]
                })

                last_pos_end = best['pos'] + n
            else:
                warn_msg = f"WARNING: No match found for SRT Segment {sub.index} (searching forward from index {start_search_idx}). Text: {sub.text[:40]}..."
                print(warn_msg)
                log.write(
                    f"{sub.index:<6} | ERROR | NO MATCH FOUND FOR: {sub.text[:40]} | SEARCH STARTED AT: {start_search_idx}\n")

            log.write("-" * 140 + "\n")

    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(final_sync_data, f, ensure_ascii=False, indent=2)


if __name__ == "__main__":
    # 1. Base Paths mapped exactly to your setup
    base_dir = Path("/media/drupchen/Khyentse Önang/Website/website_data")
    output_dir = Path(__file__).resolve().parent / 'output'
    catalog_path = output_dir / "catalog.json"

    THRESHOLD = 80

    if not catalog_path.exists():
        print(f"❌ Error: catalog.json not found at {catalog_path}. Run generate_catalog.py first.")
        exit(1)

    with open(catalog_path, "r", encoding="utf-8") as f:
        catalog = json.load(f)

    print("🚀 Starting dynamic SRT parsing...")

    # 2. Iterate dynamically over the catalog structure
    for teaching in catalog:
        for instance in teaching.get("Instances", []):
            instance_id = instance.get("Instance_ID")
            sessions = instance.get("Sessions", [])

            if not instance_id or not sessions:
                continue

            manifest_path = output_dir / instance_id / "manifest.json"
            if not manifest_path.exists():
                print(f"⚠️ Warning: manifest.json not found for {instance_id}. Skipping...")
                continue

            print(f"\n📂 Processing Instance: {instance_id} ({len(sessions)} sessions found)")

            # Load the base text manifest generated in Step 2
            with open(manifest_path, 'r', encoding='utf-8') as f:
                manifest = json.load(f)

            # 3. Create a lookup map linking the Word doc Tag (Session_ID) to the media URL variables
            session_map = {s.get("Session_ID"): s for s in sessions if s.get("Session_ID")}

            # Prepare dynamic output directories for this specific instance
            instance_sessions_dir = output_dir / instance_id / "sessions"
            instance_logs_dir = output_dir / instance_id / "session_logs"
            instance_sessions_dir.mkdir(parents=True, exist_ok=True)
            instance_logs_dir.mkdir(parents=True, exist_ok=True)

            # 4. Process each SRT file declared in the database
            for session in sessions:
                srt_filename = session.get("SRT_Text")
                if not srt_filename:
                    continue

                srt_path = base_dir / "teachings" / instance_id / "srt_files" / srt_filename

                if not srt_path.exists():
                    print(f"  ❌ Missing SRT: {srt_filename}")
                    continue

                print(f"  ⏳ Parsing SRT: {srt_filename}...")

                output_json = instance_sessions_dir / f"{srt_path.stem}.json"
                output_log = instance_logs_dir / f"{srt_path.stem}.log"

                try:
                    sync_srt_to_manifest(srt_path, manifest, session_map, output_json, output_log, THRESHOLD)
                    print(f"  ✅ Finished: {srt_path.stem}")
                except Exception as e:
                    print(f"  ❌ Error processing {srt_filename}: {e}")

    print("\n🎉 SRT parsing complete!")