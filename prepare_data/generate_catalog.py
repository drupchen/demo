import csv
import json
from pathlib import Path


def generate_global_catalog():
    # 1. Setup paths
    base_dir = Path("/media/drupchen/Khyentse Önang/Website/website_data")
    output_dir = Path(__file__).resolve().parent / 'output'
    db_dir = base_dir / "db"

    teachings_tsv = db_dir / "Khyentse Önang Teachings Relational Database - 1 Teachings.tsv"
    instances_tsv = db_dir / "Khyentse Önang Teachings Relational Database - 2 Instances.tsv"
    sessions_tsv = db_dir / "Khyentse Önang Teachings Relational Database - 3 Sessions.tsv"
    output_json_path = output_dir / "catalog.json"

    # Verify files
    for file_path in [teachings_tsv, instances_tsv, sessions_tsv]:
        if not file_path.exists():
            print(f"❌ Error: Database file not found at {file_path}")
            return

    print("📚 Reading relational TSV database...")

    catalog_map = {}
    instances_map = {}

    # 1. Parse Tab 1: Teachings
    with teachings_tsv.open(mode="r", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f, delimiter='\t')
        for row in reader:
            # Clean keys and values (removes hidden tabs from spreadsheet)
            clean_row = {str(k).strip(): str(v).strip() for k, v in row.items() if k is not None}

            teaching_id = clean_row.get("Teaching_ID")
            if not teaching_id:
                continue

            # Extract Level: Handles "1", "0", or empty strings gracefully
            raw_level = clean_row.get("Practice_Level")
            try:
                access_level = int(raw_level) if raw_level and raw_level.isdigit() else 4
            except ValueError:
                access_level = 4

            catalog_map[teaching_id] = {
                "Teaching_ID": teaching_id,
                "Title_bo": clean_row.get("Title_bo", ""),
                "Access_Level": access_level,
                "Instances": {}  # <--- FIXED: Initialize as dict to avoid TypeError
            }

    # 2. Parse Tab 2: Instances
    with instances_tsv.open(mode="r", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f, delimiter='\t')
        for row in reader:
            # Clean row data
            clean_row = {str(k).strip(): str(v).strip() for k, v in row.items() if k is not None and v}

            teaching_id = clean_row.get("Teaching_ID")
            instance_id = clean_row.get("Instance_ID")

            if instance_id and teaching_id in catalog_map:
                clean_row["Sessions"] = []

                # This now works because "Instances" is a dictionary
                catalog_map[teaching_id]["Instances"][instance_id] = clean_row
                instances_map[instance_id] = clean_row
            elif instance_id:
                print(f"⚠️ Warning: Instance '{instance_id}' missing parent Teaching '{teaching_id}'.")

    # 3. Parse Tab 3: Sessions
    with sessions_tsv.open(mode="r", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f, delimiter='\t')
        for row in reader:
            # Clean row data
            clean_row = {str(k).strip(): str(v).strip() for k, v in row.items() if k is not None and v}

            instance_id = clean_row.get("Instance_ID")
            session_id = clean_row.get("Session_ID")

            if session_id and instance_id in instances_map:
                instances_map[instance_id]["Sessions"].append(clean_row)
            elif session_id:
                print(f"⚠️ Warning: Session '{session_id}' missing parent Instance '{instance_id}'.")

    # 4. Cleanup and Convert to JSON Array
    final_catalog = []
    for teaching in catalog_map.values():
        # Convert the internal dict back into a list for the frontend
        teaching["Instances"] = list(teaching["Instances"].values())

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