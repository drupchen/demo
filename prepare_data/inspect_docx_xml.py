import docx
from docx.oxml.ns import qn


def get_xml_str(element):
    from lxml import etree
    return etree.tostring(element, encoding='unicode', pretty_print=True)


def debug_style_definitions(docx_path):
    doc = docx.Document(docx_path)
    styles_element = doc.styles.element

    # We are looking for the definitions of Style7 and Style8
    target_styles = ['Style7', 'Style8']

    print("=== STYLE DEFINITION DEBUG ===")

    for style in styles_element.xpath('//w:style'):
        style_id = style.get(qn('w:styleId'))
        if style_id in target_styles:
            print(f"\n--- DEBUGGING STYLE ID: {style_id} ---")
            # Look for Run Properties in the Style
            rPr = style.find(qn('w:rPr'))
            if rPr is not None:
                print(get_xml_str(rPr))
            else:
                print("No rPr found in this style definition.")

    # Also check the Document Defaults
    print("\n--- DOCUMENT DEFAULTS ---")
    doc_defaults = styles_element.find(qn('w:docDefaults'))
    if doc_defaults is not None:
        print(get_xml_str(doc_defaults))


if __name__ == "__main__":
    try:
        debug_style_definitions("input/recitation_manual_tib.docx")
    except Exception as e:
        print(f"Error: {e}")