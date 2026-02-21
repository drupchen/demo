import json
from pathlib import Path

# Define the root directory where all teachings live
TEACHINGS_DIR = Path('output')


def compile_all_teachings():
    print("--- Starting Compiler ---")

    # Check if the base directory exists
    if not TEACHINGS_DIR.exists():
        print(f"❌ ERROR: Cannot find base directory: {TEACHINGS_DIR}")
        return

    print(f"📂 Looking for teaching folders inside: {TEACHINGS_DIR}")

    # iterdir() loops through the contents of the directory
    for teaching_path in TEACHINGS_DIR.iterdir():

        # Skip if it's not a directory (ignores hidden files like .DS_Store)
        if not teaching_path.is_dir() or 'log' in teaching_path.stem:
            continue

        teaching_name = teaching_path.name
        print(f"\n📁 Processing Teaching Folder: {teaching_name}")

        # pathlib uses the / operator to cleanly join paths
        sessions_dir = teaching_path
        output_file = teaching_path.parent / f'{teaching_name}_compiled.json'

        all_segments = []

        if sessions_dir.exists() and sessions_dir.is_dir():
            for filepath in sessions_dir.glob('*.json'):
                with filepath.open('r', encoding='utf-8') as f:
                    try:
                        session_data = json.load(f)

                        # --- THE NEW FIX: INJECT GLOBAL METADATA ---
                        session_name = filepath.stem  # Gets filename without the .json
                        for segment in session_data:
                            # Create a unique Global ID
                            segment['global_seg_id'] = f"{session_name}_seg{segment['seg_id']}"
                            # Tag the segment with its source teaching so the UI knows where it came from
                            segment['source_session'] = session_name
                            # -------------------------------------------

                        all_segments.extend(session_data)
                        print(f"      ➕ Merged: {filepath.name}")
                    except Exception as e:
                        print(f"      ❌ Error reading {filepath.name}: {e}")

            # Save the compiled file
            if len(all_segments) > 0:
                with output_file.open('w', encoding='utf-8') as out:
                    json.dump(all_segments, out, ensure_ascii=False, indent=2)
                print(f"   🎯 Success! Saved {len(all_segments)} segments to {output_file.name}")
            else:
                print(f"   ⚠️ Warning: No valid JSON files found inside {sessions_dir}")
        else:
            print(f"   ⚠️ Warning: No 'sessions' sub-folder found in {teaching_path}")


if __name__ == '__main__':
    compile_all_teachings()