import docx
from botok import ChunkTokenizer


def debug_tokenizer(docx_path):
    doc = docx.Document(docx_path)

    for p_idx, para in enumerate(doc.paragraphs):
        if not para.text.strip():
            continue

        print(f"\n{'=' * 60}")
        print(f"PARAGRAPH {p_idx + 1}")
        print(f"{'=' * 60}")
        print(f"RAW TEXT: {para.text}\n")

        # 1. How Botok sees the entire unbroken paragraph
        print("--- BOTOK OUTPUT (FULL PARAGRAPH) ---")
        full_tokenizer = ChunkTokenizer(para.text)
        print(full_tokenizer.tokenize())
        print("\n")

        # 2. How your original script saw it (Run by Run)
        print("--- RUN-BY-RUN BREAKDOWN ---")
        for r_idx, run in enumerate(para.runs):
            if not run.text:
                continue

            print(f"Run {r_idx + 1} Raw Text : {repr(run.text)}")

            # Show botok's output for this specific run
            run_tokenizer = ChunkTokenizer(run.text)
            print(f"Run {r_idx + 1} Botok    : {run_tokenizer.tokenize()}\n")


if __name__ == "__main__":
    # Point this to your test document
    debug_tokenizer("input/recitation_manual_tib.docx")