import uuid
from pathlib import Path
import docx
import re
import logging
import json
from docx.oxml.ns import qn
from botok import ChunkTokenizer

# Setup logging
logging.basicConfig(
    filename='parsing_tags.log', level=logging.WARNING,
    format='%(asctime)s - %(levelname)s - %(message)s'
)

# 1. Define a custom Namespace for your project
# This ensures your UUIDs don't collide with other systems using uuid5
NAMESPACE_KHYENTSE = uuid.uuid5(uuid.NAMESPACE_URL, "khyentse.website.data")

def get_formatting_from_xml(element):
    """Extracts size and vertical alignment (super/sub) from a raw XML rPr element."""
    if element is None: return None, None, None

    size = None
    is_super = False
    is_sub = False

    szCs = element.find(qn('w:szCs'))
    if szCs is not None and szCs.get(qn('w:val')):
        size = int(szCs.get(qn('w:val'))) / 2
    else:
        sz = element.find(qn('w:sz'))
        if sz is not None and sz.get(qn('w:val')):
            size = int(sz.get(qn('w:val'))) / 2

    vertAlign = element.find(qn('w:vertAlign'))
    if vertAlign is not None:
        val = vertAlign.get(qn('w:val'))
        if val == 'superscript': is_super = True
        if val == 'subscript': is_sub = True

    return size, is_super, is_sub

def get_final_formatting(run, para, style_map, doc_defaults):
    res_size, res_super, res_sub = doc_defaults

    pStyle = para._element.pPr.find(qn('w:pStyle')) if para._element.pPr is not None else None
    if pStyle is not None:
        s_id = pStyle.get(qn('w:val'))
        if s_id in style_map:
            s_sz, s_sup, s_sub = style_map[s_id]
            if s_sz: res_size = s_sz
            if s_sup: res_super = s_sup
            if s_sub: res_sub = s_sub

    p_sz, p_sup, p_sub = get_formatting_from_xml(
        para._element.pPr.find(qn('w:rPr'))) if para._element.pPr is not None else (None, None, None)
    if p_sz: res_size = p_sz
    if p_sup: res_super = p_sup
    if p_sub: res_sub = p_sub

    rStyle = run._element.rPr.find(qn('w:rStyle')) if run._element.rPr is not None else None
    if rStyle is not None:
        s_id = rStyle.get(qn('w:val'))
        if s_id in style_map:
            s_sz, s_sup, s_sub = style_map[s_id]
            if s_sz: res_size = s_sz
            if s_sup: res_super = s_sup
            if s_sub: res_sub = s_sub

    r_sz, r_sup, r_sub = get_formatting_from_xml(run._element.rPr)
    if r_sz: res_size = r_sz
    if r_sup: res_super = r_sup
    if r_sub: res_sub = r_sub

    return res_size, res_super, res_sub

def categorize(size, is_super, is_sub, big_t, title_t):
    if is_super or is_sub:
        return "SMALL"
    if size:
        if size >= (title_t - 0.5): return "TITLE"
        if size >= (big_t - 0.5): return "BIG"
    return "BIG"

# 2. Add instance_id to the function parameters
def process_document(docx_path, big_t, title_t, instance_id):
    doc = docx.Document(docx_path)

    style_map = {}
    for style in doc.styles.element.xpath('//w:style'):
        s_id = style.get(qn('w:styleId'))
        style_map[s_id] = get_formatting_from_xml(style.find(qn('w:rPr')))

    defaults_node = doc.styles.element.find(qn('w:docDefaults'))
    doc_defaults = get_formatting_from_xml(
        defaults_node.find(qn('w:rPrDefault')).find(qn('w:rPr'))) if defaults_node is not None else (12.0, False, False)

    final_syllables = []
    global_counter = 1
    active_tags = set()

    # Helper function to generate deterministic IDs
    def generate_stable_id(index, text):
        unique_string = f"{instance_id}_{index}_{text}"
        return str(uuid.uuid5(NAMESPACE_KHYENTSE, unique_string))

    for para in doc.paragraphs:
        para_text = ""
        run_formats = []
        current_idx = 0

        for run in para.runs:
            if not run.text: continue

            f_size, f_super, f_sub = get_final_formatting(run, para, style_map, doc_defaults)
            semantic_size = categorize(f_size, f_super, f_sub, big_t, title_t)

            length = len(run.text)
            run_formats.append((current_idx, current_idx + length, semantic_size))

            para_text += run.text
            current_idx += length

        def get_format_at(idx):
            for start, end, size in run_formats:
                if start <= idx < end:
                    return size
            return "BIG"

        if para_text:
            segments = re.split(r'(<[^>]+>|\n)', para_text)
            current_char_idx = 0

            for segment in segments:
                if not segment: continue

                if segment.startswith('<') and segment.endswith('>'):
                    clean_tag = re.sub(r'\s+', '', segment)
                    if clean_tag.startswith('</'):
                        active_tags.discard(clean_tag[2:-1])
                    else:
                        active_tags.add(clean_tag[1:-1])
                    current_char_idx += len(segment)

                elif segment == '\n':
                    token_size = get_format_at(current_char_idx)
                    final_syllables.append({
                        'index': global_counter,
                        'id': generate_stable_id(global_counter, '\n'), # 3. Use stable ID
                        'text': '\n',
                        'nature': 'SPACE',
                        'size': token_size,
                        'tags': list(active_tags)
                    })
                    global_counter += 1
                    current_char_idx += len(segment)

                else:
                    tokenizer = ChunkTokenizer(segment)
                    for token_nature, token_text in tokenizer.tokenize():
                        token_size = get_format_at(current_char_idx)

                        final_syllables.append({
                            'index': global_counter,
                            'id': generate_stable_id(global_counter, token_text), # 3. Use stable ID
                            'text': token_text,
                            'nature': token_nature,
                            'size': token_size,
                            'tags': list(active_tags)
                        })
                        global_counter += 1
                        current_char_idx += len(token_text)

        final_syllables.append({
            'index': global_counter,
            'id': generate_stable_id(global_counter, '\n'), # 3. Use stable ID
            'text': '\n',
            'nature': 'SPACE',
            'size': run_formats[0][2] if run_formats else 'BIG',
            'tags': list(active_tags)
        })
        global_counter += 1

    return final_syllables

if __name__ == "__main__":
    base_dir = Path("/media/drupchen/Khyentse Önang/Website/website_data")
    output_dir = Path(__file__).resolve().parent / 'output'
    catalog_path = output_dir / "catalog.json"

    BIG_T, TITLE_T = 26.0, 36.0

    if not catalog_path.exists():
        print(f"❌ Error: catalog.json not found at {catalog_path}. Run generate_catalog.py first.")
        exit(1)

    with open(catalog_path, "r", encoding="utf-8") as f:
        catalog = json.load(f)

    print("🚀 Starting dynamic base layer ingestion (with Deterministic UUIDs)...")

    for teaching in catalog:
        for instance in teaching.get("Instances", []):
            instance_id = instance.get("Instance_ID")
            teaching_id = instance.get("Teaching_ID")
            text_docx = instance.get("Text_Docx")
            sessions = instance.get("Sessions", [])

            if not instance_id or not text_docx:
                continue

            instance_dir = base_dir / "teachings" / instance_id
            docx_path = instance_dir / text_docx
            srt_dir = instance_dir / "srt_files"

            if not docx_path.exists():
                instance_id = teaching_id
                instance_dir = base_dir / "teachings" / instance_id
                docx_path = instance_dir / text_docx
                srt_dir = instance_dir / "srt_files"

            if not docx_path.exists():
                print(f"⚠️ Warning: Master Docx file not found at {docx_path}")
                continue

            print(f"\n⏳ Processing Instance: {instance_id}")
            print(f"   📄 Reading: {text_docx}")

            try:
                # 4. Pass the instance_id into the processing function
                manifest_data = process_document(docx_path, BIG_T, TITLE_T, instance_id)

                instance_output_dir = output_dir / instance_id
                instance_output_dir.mkdir(parents=True, exist_ok=True)

                output_path = instance_output_dir / 'manifest.json'
                with open(output_path, "w", encoding="utf-8") as out_f:
                    json.dump(manifest_data, out_f, ensure_ascii=False, indent=2)

                print(f"   ✅ Success! {len(manifest_data)} syllables saved to manifest.json")

            except Exception as e:
                print(f"   ❌ Error processing {text_docx} for {instance_id}: {e}")
                continue

            if not sessions:
                print(f"   ⚠️ No sessions found in catalog for {instance_id}.")
                continue

            print(f"   🎬 Verifying {len(sessions)} SRT sessions...")
            for session in sessions:
                session_id = session.get("Session_ID")
                srt_filename = session.get("SRT_Text")

                if not srt_filename:
                    print(f"      ⚠️ Session {session_id} is missing an SRT filename.")
                    continue

                srt_path = srt_dir / srt_filename

                if not srt_path.exists():
                    print(f"      ❌ Missing SRT file: {srt_path}")
                else:
                    print(f"      ✅ Found SRT: {srt_filename} (Ready for sync)")

    print("\n🎉 Base layer ingestion complete!")