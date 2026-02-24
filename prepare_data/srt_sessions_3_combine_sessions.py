import json
from pathlib import Path


def compile_all_instances():
    print("--- Starting Session Compiler ---")

    # 1. Setup paths based on the new architecture
    script_dir = Path(__file__).resolve().parent
    output_dir = script_dir / "output"

    # Check if the output directory exists
    if not output_dir.exists():
        print(f"❌ ERROR: Cannot find output directory: {output_dir}")
        return

    print(f"📂 Looking for instance folders inside: {output_dir}")

    # 2. Iterate through all instance folders in the output directory
    for instance_path in output_dir.iterdir():
        # We only care about directories (this skips catalog.json and hidden files)
        if not instance_path.is_dir() or instance_path.name.startswith('.'):
            continue

        instance_id = instance_path.name
        print(f"\n📁 Processing Instance Folder: {instance_id}")

        sessions_dir = instance_path / "sessions"
        output_file = instance_path / f"{instance_id}_compiled_sessions.json"

        all_segments = []

        # 3. Check if the sessions subdirectory exists
        if sessions_dir.exists() and sessions_dir.is_dir():
            # 4. Read all individual session JSONs chronologically
            for filepath in sorted(sessions_dir.glob('*.json')):
                with filepath.open('r', encoding='utf-8') as f:
                    try:
                        session_data = json.load(f)

                        # --- INJECT GLOBAL METADATA ---
                        session_name = filepath.stem  # Gets filename without the .json
                        for segment in session_data:
                            # Create a unique Global ID
                            segment['global_seg_id'] = f"{session_name}_seg{segment['seg_id']}"
                            # Tag the segment with its source session
                            segment['source_session'] = session_name

                            # Note: media_original and media_restored are already in the segment
                            # payload from Step 3!

                        all_segments.extend(session_data)
                        print(f"      ➕ Merged: {filepath.name} ({len(session_data)} segments)")
                    except Exception as e:
                        print(f"      ❌ Error reading {filepath.name}: {e}")

            # 5. Save the compiled file
            if len(all_segments) > 0:
                with output_file.open('w', encoding='utf-8') as out:
                    json.dump(all_segments, out, ensure_ascii=False, indent=2)
                print(f"   🎯 Success! Saved {len(all_segments)} total segments to {output_file.name}")
            else:
                print(f"   ⚠️ Warning: No valid session JSON files found inside {sessions_dir}")
        else:
            print(f"   ⚠️ Warning: No 'sessions' sub-folder found in {instance_path}")

    print("\n🎉 Compilation complete! The archive payloads are ready for Next.js.")


if __name__ == '__main__':
    compile_all_instances()