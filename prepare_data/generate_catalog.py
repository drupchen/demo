import csv
import json
from pathlib import Path


def generate_global_catalog():
    # 1. Setup modern paths using pathlib
    # Assuming this script is run from within the 'prepare_data' directory
    base_dir = Path("/media/drupchen/Khyentse Önang/Website/website_data")
    output_dir = Path(__file__).resolve().parent / 'output'
    db_dir = base_dir / "db"

    teachings_tsv = db_dir / "Khyentse Önang Teachings Relational Database - 1 Teachings.tsv"
    instances_tsv = db_dir / "Khyentse Önang Teachings Relational Database - 2 Instances.tsv"
    sessions_tsv = db_dir / "Khyentse Önang Teachings Relational Database - 3 Sessions.tsv"
    output_json_path = output_dir / "catalog.json"

    # Verify all files exist
    for file_path in [teachings_tsv, instances_tsv, sessions_tsv]:
        if not file_path.exists():
            print(f"❌ Error: Database file not found at {file_path}")
            return

    print("📚 Reading relational TSV database...")

    catalog_map = {}
    instances_map = {}  # We keep a flat lookup dictionary for instances to easily attach sessions

    # 1. Parse Tab 1: Teachings (The Root Texts)
    with teachings_tsv.open(mode="r", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f, delimiter='\t')
        for row in reader:
            teaching_id = row.get("Teaching_ID")
            if teaching_id:
                clean_row = {k: v for k, v in row.items() if v and v.strip() != ""}
                clean_row["Instances"] = {}  # Using a dict temporarily for easier lookup
                catalog_map[teaching_id] = clean_row

    # 2. Parse Tab 2: Instances (The Teaching Events)
    with instances_tsv.open(mode="r", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f, delimiter='\t')
        for row in reader:
            teaching_id = row.get("Teaching_ID")
            instance_id = row.get("Instance_ID")

            if instance_id and teaching_id in catalog_map:
                clean_row = {k: v for k, v in row.items() if v and v.strip() != ""}
                clean_row["Sessions"] = []  # Prepare array for Tab 3 data

                # Link to Parent Teaching
                catalog_map[teaching_id]["Instances"][instance_id] = clean_row
                # Add to flat lookup map for the next step
                instances_map[instance_id] = clean_row
            elif instance_id and teaching_id not in catalog_map:
                print(f"⚠️ Warning: Instance '{instance_id}' missing parent Teaching '{teaching_id}'.")

    # 3. Parse Tab 3: Sessions (Media & Subtitles)
    with sessions_tsv.open(mode="r", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f, delimiter='\t')
        for row in reader:
            instance_id = row.get("Instance_ID")
            session_id = row.get("Session_ID")

            if session_id and instance_id in instances_map:
                clean_row = {k: v for k, v in row.items() if v and v.strip() != ""}
                # Link to Parent Instance
                instances_map[instance_id]["Sessions"].append(clean_row)
            elif session_id and instance_id not in instances_map:
                print(f"⚠️ Warning: Session '{session_id}' missing parent Instance '{instance_id}'.")

    # 4. Cleanup and Convert to JSON Array
    final_catalog = []
    for teaching in catalog_map.values():
        # Convert the Instances dict back into a list for the final JSON
        teaching["Instances"] = list(teaching["Instances"].values())

        # Only add teachings that actually have valid instances attached
        if len(teaching["Instances"]) > 0:
            final_catalog.append(teaching)

    # Save output
    output_json_path.parent.mkdir(parents=True, exist_ok=True)
    with output_json_path.open(mode="w", encoding="utf-8") as f:
        json.dump(final_catalog, f, indent=2, ensure_ascii=False)

    print(f"✅ Success! Global catalog generated.")
    print(f"📄 Output saved to: {output_json_path.resolve()}")


if __name__ == "__main__":
    generate_global_catalog()
