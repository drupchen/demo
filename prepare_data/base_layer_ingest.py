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


def get_formatting_from_xml(element):
    """Extracts size and vertical alignment (super/sub) from a raw XML rPr element."""
    if element is None: return None, None, None

    size = None
    is_super = False
    is_sub = False

    # 1. Extract Size (Priority: Complex Script szCs -> Standard sz)
    szCs = element.find(qn('w:szCs'))
    if szCs is not None and szCs.get(qn('w:val')):
        size = int(szCs.get(qn('w:val'))) / 2
    else:
        sz = element.find(qn('w:sz'))
        if sz is not None and sz.get(qn('w:val')):
            size = int(sz.get(qn('w:val'))) / 2

    # 2. Extract Super/Sub (vertAlign)
    vertAlign = element.find(qn('w:vertAlign'))
    if vertAlign is not None:
        val = vertAlign.get(qn('w:val'))
        if val == 'superscript': is_super = True
        if val == 'subscript': is_sub = True

    return size, is_super, is_sub


def get_final_formatting(run, para, style_map, doc_defaults):
    """
    Follows the exact Word Hierarchy to resolve size and super/sub flags:
    Run -> Character Style -> Paragraph Properties -> Paragraph Style -> Doc Defaults
    """
    # Initialize with doc defaults
    res_size, res_super, res_sub = doc_defaults

    # 1. Layer: Paragraph Style (Base)
    pStyle = para._element.pPr.find(qn('w:pStyle')) if para._element.pPr is not None else None
    if pStyle is not None:
        s_id = pStyle.get(qn('w:val'))
        if s_id in style_map:
            s_sz, s_sup, s_sub = style_map[s_id]
            if s_sz: res_size = s_sz
            if s_sup: res_super = s_sup
            if s_sub: res_sub = s_sub

    # 2. Layer: Paragraph Local Properties (pPr -> rPr)
    p_sz, p_sup, p_sub = get_formatting_from_xml(
        para._element.pPr.find(qn('w:rPr'))) if para._element.pPr is not None else (None, None, None)
    if p_sz: res_size = p_sz
    if p_sup: res_super = p_sup
    if p_sub: res_sub = p_sub

    # 3. Layer: Character Style (Run Style)
    rStyle = run._element.rPr.find(qn('w:rStyle')) if run._element.rPr is not None else None
    if rStyle is not None:
        s_id = rStyle.get(qn('w:val'))
        if s_id in style_map:
            s_sz, s_sup, s_sub = style_map[s_id]
            if s_sz: res_size = s_sz
            if s_sup: res_super = s_sup
            if s_sub: res_sub = s_sub

    # 4. Layer: Local Run Properties (Strongest)
    r_sz, r_sup, r_sub = get_formatting_from_xml(run._element.rPr)
    if r_sz: res_size = r_sz
    if r_sup: res_super = r_sup
    if r_sub: res_sub = r_sub

    return res_size, res_super, res_sub


def categorize(size, is_super, is_sub, big_t, title_t):
    # Rule 1: Priority Check for Superscript or Subscript
    if is_super or is_sub:
        return "SMALL"

    # Rule 2: Size Categorization
    if size:
        if size >= (title_t - 0.5): return "TITLE"
        if size >= (big_t - 0.5): return "BIG"

    return "BIG"


def process_document(docx_path, big_t, title_t):
    doc = docx.Document(docx_path)

    # Pre-calculate Style Map (Size and Super/Sub)
    style_map = {}
    for style in doc.styles.element.xpath('//w:style'):
        s_id = style.get(qn('w:styleId'))
        style_map[s_id] = get_formatting_from_xml(style.find(qn('w:rPr')))

    # Get Doc Defaults
    defaults_node = doc.styles.element.find(qn('w:docDefaults'))
    doc_defaults = get_formatting_from_xml(
        defaults_node.find(qn('w:rPrDefault')).find(qn('w:rPr'))) if defaults_node is not None else (12.0, False, False)

    final_syllables = []
    global_counter = 1
    active_tags = set()

    for para in doc.paragraphs:
        # We REMOVED the `if not para.text.strip(): continue` line here
        # so that we do not skip empty paragraphs (which represent multiple newlines).

        para_text = ""
        run_formats = []
        current_idx = 0

        # 1. Flatten the paragraph and map formats to character indices
        for run in para.runs:
            if not run.text: continue

            # Resolve the formatting through the hierarchy
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
            return "BIG"  # Safe fallback

        # 2. Parse tags AND isolate soft-newlines on the unified paragraph string
        # We only run this block if there is actual text to parse.
        if para_text:
            segments = re.split(r'(<[^>]+>|\n)', para_text)
            current_char_idx = 0

            for segment in segments:
                if not segment: continue

                # Handle Tags
                if segment.startswith('<') and segment.endswith('>'):
                    clean_tag = re.sub(r'\s+', '', segment)
                    if clean_tag.startswith('</'):
                        active_tags.discard(clean_tag[2:-1])
                    else:
                        active_tags.add(clean_tag[1:-1])

                    current_char_idx += len(segment)

                # Handle Explicit Soft Newlines (Shift+Enter)
                elif segment == '\n':
                    token_size = get_format_at(current_char_idx)
                    final_syllables.append({
                        'index': global_counter,
                        'id': str(uuid.uuid4()),
                        'text': '\n',
                        'nature': 'SPACE',
                        'size': token_size,
                        'tags': list(active_tags)
                    })
                    global_counter += 1
                    current_char_idx += len(segment)

                # Handle Regular Text
                else:
                    tokenizer = ChunkTokenizer(segment)
                    for token_nature, token_text in tokenizer.tokenize():
                        token_size = get_format_at(current_char_idx)

                        final_syllables.append({
                            'index': global_counter,
                            'id': str(uuid.uuid4()),
                            'text': token_text,
                            'nature': token_nature,
                            'size': token_size,
                            'tags': list(active_tags)
                        })
                        global_counter += 1
                        current_char_idx += len(token_text)

        # 3. Inject the structural newline at the end of the paragraph object
        final_syllables.append({
            'index': global_counter,
            'id': str(uuid.uuid4()),
            'text': '\n',
            'nature': 'SPACE',
            # If the paragraph was completely empty, fallback to 'BIG', otherwise use the size of the first run
            'size': run_formats[0][2] if run_formats else 'BIG',
            'tags': list(active_tags)
        })
        global_counter += 1

    return final_syllables


if __name__ == "__main__":
    INPUT_FILE = Path("input/recitation_manual_tib.docx")
    BIG_T, TITLE_T = 26.0, 36.0  # Your thresholds

    print(f"Ingesting: {INPUT_FILE.name}")
    manifest_data = process_document(INPUT_FILE, BIG_T, TITLE_T)

    output_path = Path("output") / (INPUT_FILE.stem + '_manifest.json')
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(manifest_data, f, ensure_ascii=False, indent=2)

    print(f"Success! {len(manifest_data)} syllables processed.")