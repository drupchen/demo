"""
One-off script to fix stale audio URLs in _corrected.json session files.

The alignment tool saved these files before srt_sessions_1_parse.py was fixed,
so they contain wrong per-segment audio URLs. This script overwrites them with
the correct URLs from the catalog (one audio file per session).

Safe to delete after running.
"""
import json
from pathlib import Path


def load_audio_map(catalog_path, target_instance_id):
    """Build Session_ID → {original, restored} URL map for one instance."""
    with open(catalog_path, 'r', encoding='utf-8') as f:
        catalog = json.load(f)

    for teaching in catalog:
        for instance in teaching.get("Instances", []):
            if instance.get("Instance_ID") == target_instance_id:
                audio_map = {}
                for session in instance.get("Sessions", []):
                    sid = session.get("Session_ID", "").strip()
                    orig = session.get("Audio_Original_URL", "").strip()
                    rest = session.get("Audio_Restored_URL", "").strip()
                    if sid and (orig or rest):
                        audio_map[sid] = {"original": orig, "restored": rest}
                return audio_map
    return {}


def patch_instance(instance_id, sessions_folder, audio_map):
    """Patch all _corrected.json files in a sessions folder."""
    patched = 0
    for filepath in sessions_folder.glob("*_corrected.json"):
        # Extract session tag: "A1_069 A-Yeshey Lama_1_corrected.json" → "A1"
        base_name = filepath.stem.replace("_corrected", "")
        session_tag = base_name.split('_')[0]

        if session_tag not in audio_map:
            print(f"   ⚠️ No audio mapping for tag '{session_tag}' in {filepath.name}")
            continue

        urls = audio_map[session_tag]
        media_original = urls.get("original", "")
        media_restored = urls.get("restored", "")
        url_for_ext = media_restored or media_original
        media_ext = url_for_ext.split('.')[-1].split('?')[0] if url_for_ext else ""

        with open(filepath, 'r', encoding='utf-8') as f:
            segments = json.load(f)

        changed = False
        for seg in segments:
            if seg.get("media_original") != media_original or seg.get("media_restored") != media_restored:
                seg["media_original"] = media_original
                seg["media_restored"] = media_restored
                seg["media_type"] = media_ext
                changed = True

        if changed:
            with open(filepath, 'w', encoding='utf-8') as f:
                json.dump(segments, f, ensure_ascii=False, indent=2)
            print(f"   ✅ Patched: {filepath.name}")
            patched += 1

    return patched


if __name__ == "__main__":
    output_dir = Path(__file__).resolve().parent / 'output'
    catalog_path = output_dir / "catalog.json"

    if not catalog_path.exists():
        print(f"❌ Error: catalog.json not found at {catalog_path}")
        exit(1)

    with open(catalog_path, "r", encoding="utf-8") as f:
        catalog = json.load(f)

    print("🔧 Patching stale audio URLs in _corrected.json files...\n")

    total_patched = 0
    for teaching in catalog:
        for instance in teaching.get("Instances", []):
            instance_id = instance.get("Instance_ID")
            if not instance_id:
                continue

            sessions_folder = output_dir / instance_id / "sessions"
            if not sessions_folder.exists():
                # Try teaching_id fallback
                teaching_id = teaching.get("Teaching_ID")
                sessions_folder = output_dir / teaching_id / "sessions"
                if not sessions_folder.exists():
                    continue
                instance_id = teaching_id

            corrected_files = list(sessions_folder.glob("*_corrected.json"))
            if not corrected_files:
                continue

            print(f"📂 {instance_id} ({len(corrected_files)} corrected files)")
            audio_map = load_audio_map(catalog_path, instance_id)
            total_patched += patch_instance(instance_id, sessions_folder, audio_map)

    print(f"\n🎉 Done! Patched {total_patched} files.")
    print("Now re-run: python srt_sessions_3_combine_sessions.py")
