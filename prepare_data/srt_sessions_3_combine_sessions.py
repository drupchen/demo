import json
import re
from pathlib import Path


def natural_sort_key(s):
    """Sort key that handles embedded numbers naturally (A1, A2, A10)."""
    return [int(c) if c.isdigit() else c.lower() for c in re.split(r'(\d+)', s)]


def compile_single_instance(instance_id, sessions_folder, output_file):
    """
    Takes the compiled sessions for a single instance and merges them,
    injecting global metadata along the way.

    When the alignment-tool has produced _corrected variants, those are
    preferred over the originals. _original_backup files are ignored.
    """
    all_segments = []

    if not (sessions_folder.exists() and sessions_folder.is_dir()):
        print(f"   ⚠️ Warning: No 'sessions' sub-folder found at {sessions_folder}")
        return

    # Discover base session names (exclude _corrected / _original_backup suffixes)
    base_names = set()
    for filepath in sessions_folder.glob('*.json'):
        stem = filepath.stem
        if stem.endswith('_original_backup'):
            continue  # skip backups entirely
        if stem.endswith('_corrected'):
            base_names.add(stem[:-10])  # strip _corrected
        else:
            base_names.add(stem)

    for name in sorted(base_names, key=natural_sort_key):
        corrected_path = sessions_folder / f"{name}_corrected.json"
        original_path = sessions_folder / f"{name}.json"

        # Prefer corrected version if it exists
        if corrected_path.is_file():
            filepath = corrected_path
        elif original_path.is_file():
            filepath = original_path
        else:
            continue

        try:
            with filepath.open('r', encoding='utf-8') as f:
                session_data = json.load(f)

            for segment in session_data:
                segment['global_seg_id'] = f"{name}_seg{segment['seg_id']}"
                segment['source_session'] = name

            all_segments.extend(session_data)
            suffix = " (corrected)" if filepath == corrected_path else ""
            print(f"      ➕ Merged: {filepath.name}{suffix}")
        except Exception as e:
            print(f"      ❌ Error reading {filepath.name}: {e}")

    # Save the compiled file
    if len(all_segments) > 0:
        with output_file.open('w', encoding='utf-8') as out:
            json.dump(all_segments, out, ensure_ascii=False, indent=2)
        print(f"   🎯 Success! Saved {len(all_segments)} segments to {output_file.name}")
    else:
        print(f"   ⚠️ Warning: No valid JSON segments found inside {sessions_folder}")


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