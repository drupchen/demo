import json
from pathlib import Path


def compile_single_instance(instance_id, sessions_folder, output_file):
    """
    Takes the compiled sessions for a single instance and merges them,
    injecting global metadata along the way.
    """
    all_segments = []

    # Check if the sessions directory exists and is valid
    if sessions_folder.exists() and sessions_folder.is_dir():
        # Iterate through all JSON session files in this instance's folder
        for filepath in sessions_folder.glob('*.json'):
            with filepath.open('r', encoding='utf-8') as f:
                try:
                    session_data = json.load(f)

                    # --- YOUR UNTOUCHED PARSING LOGIC ---
                    session_name = filepath.stem  # Gets filename without the .json
                    for segment in session_data:
                        # Create a unique Global ID
                        segment['global_seg_id'] = f"{session_name}_seg{segment['seg_id']}"
                        # Tag the segment with its source teaching so the UI knows where it came from
                        segment['source_session'] = session_name
                    # ------------------------------------

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
            print(f"   ⚠️ Warning: No valid JSON segments found inside {sessions_folder}")
    else:
        print(f"   ⚠️ Warning: No 'sessions' sub-folder found at {sessions_folder}")


if __name__ == "__main__":
    # 1. Setup Base Paths
    output_dir = Path(__file__).resolve().parent / 'output'
    catalog_path = output_dir / "catalog.json"

    # 2. Verify Catalog Exists
    if not catalog_path.exists():
        print(f"❌ Error: catalog.json not found at {catalog_path}. Run generate_catalog.py first.")
        exit(1)

    with catalog_path.open("r", encoding="utf-8") as f:
        catalog = json.load(f)

    print("🚀 Starting final session compilation...")

    # 3. Loop through catalog to process instances
    for teaching in catalog:
        for instance in teaching.get("Instances", []):
            instance_id = instance.get("Instance_ID")
            teaching_id = teaching.get("Teaching_ID")

            if not instance_id:
                continue

            # 4. Define instance-specific paths inside the output folder
            instance_dir = output_dir / instance_id
            sessions_folder = instance_dir / 'sessions'

            # Update: Name the file dynamically based on the instance ID
            final_output_path = instance_dir / f"{instance_id}_compiled_sessions.json"

            if not sessions_folder.exists():
                instance_id = teaching_id
                instance_dir = output_dir / instance_id
                sessions_folder = instance_dir / 'sessions'
                final_output_path = instance_dir / f"{instance_id}_compiled_sessions.json"

            # 5. Validate prerequisites before running the combining logic
            if not sessions_folder.exists() or not any(sessions_folder.iterdir()):
                print(f"⚠️ Warning: No session files found in {sessions_folder} for {instance_id}. Skipping.")
                continue

            print(f"\n⏳ Compiling sessions for Instance: {instance_id}")

            try:
                # Execute the compilation logic for this specific instance
                compile_single_instance(
                    instance_id=instance_id,
                    sessions_folder=sessions_folder,
                    output_file=final_output_path
                )
            except Exception as e:
                print(f"   ❌ Error compiling {instance_id}: {e}")

    print("\n🎉 Final compilation complete!")