import json
from pathlib import Path
from opensearchpy import OpenSearch, helpers

# 1. Initialize OpenSearch Client
# Update with your actual cluster details (e.g., AWS OpenSearch, Local Docker)
client = OpenSearch(
    hosts=[{'host': 'localhost', 'port': 9200}],
    http_compress=True
)

INDEX_NAME = "khyentse-archive-segments"


def create_index():
    # Create index with a mapping that supports standard text search
    # Note: For advanced Tibetan, you might later add a custom ICU analyzer here.
    mapping = {
        "mappings": {
            "properties": {
                "instance_id": {"type": "keyword"},
                "session_id": {"type": "keyword"},
                "start": {"type": "keyword"},
                "media_url": {"type": "keyword"},
                "text": {"type": "text"},  # The searchable concatenated Tibetan text
                "syl_uuids": {"type": "keyword"}
            }
        }
    }
    if not client.indices.exists(index=INDEX_NAME):
        client.indices.create(index=INDEX_NAME, body=mapping)
        print(f"Created index: {INDEX_NAME}")


def generate_segment_documents():
    output_dir = Path(__file__).resolve().parent / 'output'
    catalog_path = output_dir / "catalog.json"

    with catalog_path.open("r", encoding="utf-8") as f:
        catalog = json.load(f)

    for teaching in catalog:
        for instance in teaching.get("Instances", []):
            instance_id = instance.get("Instance_ID")

            instance_dir = output_dir / instance_id
            manifest_path = instance_dir / "manifest.json"
            sessions_path = instance_dir / f"{instance_id}_compiled_sessions.json"

            if not manifest_path.exists() or not sessions_path.exists():
                continue

            # Load manifest and create a lookup dict for syllables
            with manifest_path.open("r", encoding="utf-8") as mf:
                manifest_data = json.load(mf)
                syl_map = {syl["id"]: syl["text"] for syl in manifest_data}

            # Load sessions
            with sessions_path.open("r", encoding="utf-8") as sf:
                sessions_data = json.load(sf)

            # Build documents
            for segment in sessions_data:
                # Reconstruct the full text for the segment from the syllable UUIDs
                segment_text = "".join([syl_map.get(uid, "") for uid in segment.get("syl_uuids", [])])

                # We use the first syllable ID as the anchor to pass to the player
                anchor_syl_id = segment["syl_uuids"][0] if segment.get("syl_uuids") else ""

                media_url = segment.get("media_restored") or segment.get("media_original") or ""

                yield {
                    "_index": INDEX_NAME,
                    "_id": segment["global_seg_id"],
                    "_source": {
                        "instance_id": instance_id,
                        "teaching_title": teaching.get("Title_bo", ""),
                        "session_id": segment["source_session"],
                        "start": segment["start"],
                        "end": segment["end"],
                        "media_url": media_url,
                        "text": segment_text.strip(),
                        "first_syl_id": anchor_syl_id
                    }
                }


if __name__ == "__main__":
    print("🚀 Starting OpenSearch ingestion...")
    create_index()

    # Bulk index the generated segment documents
    success, failed = helpers.bulk(client, generate_segment_documents())
    print(f"✅ Successfully indexed {success} segments.")
    if failed:
        print(f"❌ Failed to index {failed} segments.")