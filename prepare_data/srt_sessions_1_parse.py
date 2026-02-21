import json
import pysrt
import os
from pathlib import Path
from thefuzz import fuzz
from botok import ChunkTokenizer


def load_audio_map(tsv_path):
    """Robust TSV/Space-separated loader: {tag: url}"""
    audio_map = {}
    if not os.path.exists(tsv_path):
        print(f"Error: {tsv_path} not found.")
        return audio_map
    with open(tsv_path, 'r', encoding='utf-8') as f:
        for line in f:
            parts = line.strip().split()  # Splits by any whitespace (tab or spaces)
            if len(parts) >= 2:
                audio_map[parts[0]] = parts[-1]  # Key=Identifier, Value=URL
    return audio_map


def sync_and_log_folder(manifest_path, srt_folder, audio_tsv, output_folder, log_folder):
    os.makedirs(output_folder, exist_ok=True)
    os.makedirs(log_folder, exist_ok=True)

    with open(manifest_path, 'r', encoding='utf-8') as f:
        manifest = json.load(f)

    audio_map = load_audio_map(audio_tsv)
    srt_files = list(Path(srt_folder).glob("*.srt"))

    print(f"Found {len(srt_files)} SRT files. Starting sync...")

    for srt_path in srt_files:
        subs = pysrt.open(str(srt_path), encoding='utf-8')
        base_name = srt_path.stem

        json_out = Path(output_folder) / f"{base_name}.json"
        log_out = Path(log_folder) / f"{base_name}.log"

        final_sync_data = []
        last_pos_end = 0

        with open(log_out, 'w', encoding='utf-8') as log:
            log.write(f"AUDIT LOG FOR: {srt_path.name}\n")
            log.write("-" * 140 + "\n")

            for sub in subs:
                tokenizer = ChunkTokenizer(sub.text)
                srt_tokens = [t[1] for t in tokenizer.tokenize()]
                srt_str = "".join(srt_tokens).strip()
                n = len(srt_tokens)

                # Search Manifest
                candidates = []

                # --- STRICT PROGRESSION ---
                # Search strictly starts where the last segment ended.
                # No backward scanning, making overlaps mathematically impossible.
                start_search_idx = last_pos_end

                # Prefix check to prevent false early anchors
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
                    if last_pos_end == 0:
                        boost = 0
                    else:
                        boost = 25 if i == last_pos_end else (15 if abs(i - last_pos_end) < 20 else 0)

                    # --- UNCAPPED SCORING ---
                    # We no longer cap at 100. If an anchor is perfect, it scores 125,
                    # ensuring it permanently defeats any adjacent fuzzy matches.
                    score = base + boost

                    if score >= THRESHOLD:
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

                        # Note: Scores in the log may now read >100% (e.g., 125%)
                        # This explicitly confirms that the proximity anchor was triggered.
                        log.write(
                            f"{sub.index:<6} | {pick} {label:<2} | {cand['score']:>3}%      | ...{ctx:<32} | {cand['text'][:50]} [pos:{cand['pos']}]\n")

                    # --- STRICT MATCH SLICE (Exactly as Tokenized) ---
                    match_slice = manifest[best['pos']: best['pos'] + n]
                    # -------------------------------------------------

                    # SYNC DATA MAPPING
                    media_url = ""
                    media_ext = ""
                    if match_slice:
                        for syl in match_slice:
                            for tag in syl.get('tags', []):
                                if tag in audio_map:
                                    media_url = audio_map[tag]
                                    media_ext = media_url.split('.')[-1].split('?')[0]
                                    break
                            if media_url:
                                break

                    final_sync_data.append({
                        "seg_id": sub.index,
                        "media": media_url,
                        "media_type": media_ext,
                        "start": str(sub.start),
                        "end": str(sub.end),
                        "syl_uuids": [m['id'] for m in match_slice]
                    })

                    # Pointer moves strictly to the end of the matched sequence
                    last_pos_end = best['pos'] + n
                else:
                    warn_msg = f"WARNING: No match found for SRT Segment {sub.index} (searching forward from index {start_search_idx}). Text: {sub.text[:40]}..."
                    print(warn_msg)
                    log.write(
                        f"{sub.index:<6} | ERROR | NO MATCH FOUND FOR: {sub.text[:40]} | SEARCH STARTED AT: {start_search_idx}\n")

                log.write("-" * 140 + "\n")

        with open(json_out, 'w', encoding='utf-8') as f:
            json.dump(final_sync_data, f, ensure_ascii=False, indent=2)
        print(f"Finished: {base_name}")


if __name__ == "__main__":
    THRESHOLD = 80
    sync_and_log_folder(
        manifest_path='output/recitation_manual_tib_manifest.json',
        srt_folder='input/srt_files',
        audio_tsv='input/media_sources.tsv',
        output_folder='output/sessions',
        log_folder='output/session_logs'
    )