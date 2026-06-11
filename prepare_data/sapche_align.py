"""Align a sapche export (character offsets) to manifest syllable UUIDs."""
from __future__ import annotations
import json

WHITESPACE = set(" \n\t\r\u00a0")  # NBSP (U+00A0) appears in the Tibetan text


def is_marker(syllable: dict) -> bool:
    """True for audio-session markers like '{051 B-Lama Yangtig_1}'."""
    text = syllable.get("text", "").strip()
    return text.startswith("{") and text.endswith("}")


def assign_outline(roots: list[dict]) -> None:
    """Annotate every node in the tree with number, depth, and part (in-place)."""
    def walk(node, prefix, depth):
        node["number"] = ".".join(map(str, prefix))
        node["depth"] = depth
        node["part"] = prefix[0] if prefix else None
        for idx, child in enumerate(node.get("children") or [], start=1):
            walk(child, prefix + [idx], depth + 1)
    for root in roots:
        walk(root, [], 0)


def resolve_anchors(node: dict, offset_to_sylid) -> tuple:
    """Recursively set startSylId/endSylId; fall back to child anchors when span is None."""
    child_anchors = [resolve_anchors(c, offset_to_sylid)
                     for c in (node.get("children") or [])]
    if node.get("original_start") is not None:
        start = offset_to_sylid(node["original_start"])
    else:
        start = child_anchors[0][0] if child_anchors else None
    if node.get("original_end") is not None:
        end = offset_to_sylid(node["original_end"])
    else:
        end = child_anchors[-1][1] if child_anchors else None
    node["startSylId"] = start
    node["endSylId"] = end
    return (start, end)


def build_offset_to_sylid(clean: str, owner: list[str], orig: str):
    """Return f(offset)->sylid. One-pass alignment tolerant of whitespace diffs."""
    n = len(orig)
    orig_to_clean = [0] * (n + 1)
    i = j = 0
    while j < n and i < len(clean):
        orig_to_clean[j] = i
        a, b = clean[i], orig[j]
        if a == b:
            i += 1; j += 1
        elif a in WHITESPACE and b in WHITESPACE:
            i += 1; j += 1
        elif a in WHITESPACE:
            i += 1
        elif b in WHITESPACE:
            j += 1
        else:
            i += 1; j += 1
    last = min(i, len(clean) - 1) if clean else 0
    while j <= n:
        orig_to_clean[j] = last
        j += 1

    def offset_to_sylid(off: int):
        ci = orig_to_clean[min(max(off, 0), n)]
        while ci < len(clean) and clean[ci] in WHITESPACE:
            ci += 1
        return owner[ci] if ci < len(owner) else None

    return offset_to_sylid


def build_clean_stream(manifest: list[dict]) -> tuple[str, list[str]]:
    """Concatenate non-marker syllable text; return (text, per-char owner uuid)."""
    chars: list[str] = []
    owner: list[str] = []
    for syl in manifest:
        if is_marker(syl):
            continue
        sid = syl["id"]
        for ch in syl["text"]:
            chars.append(ch)
            owner.append(sid)
    return "".join(chars), owner


# ── A5 ────────────────────────────────────────────────────────────────────────

KEEP = ("id", "title", "number", "depth", "part", "startSylId", "endSylId")


def _prune(node: dict) -> dict:
    out = {k: node.get(k) for k in KEEP}
    out["children"] = [_prune(c) for c in (node.get("children") or [])]
    return out


def transform(doc: dict, manifest: list[dict], instance_id: str) -> dict:
    clean, owner = build_clean_stream(manifest)
    f = build_offset_to_sylid(clean, owner, doc["original_text"])
    roots = doc["roots"]
    assign_outline(roots)
    for root in roots:
        resolve_anchors(root, f)
    return {"instance_id": instance_id, "roots": [_prune(r) for r in roots]}


def _count(nodes):
    return sum(1 + _count(n["children"]) for n in nodes)


def main(argv=None):
    import argparse, os
    p = argparse.ArgumentParser(description="Align sapche export to syllable UUIDs")
    p.add_argument("export_path")
    p.add_argument("instance_id")
    p.add_argument("--archive", default=os.path.join(
        os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
        "floating-pecha-ui", "public", "data", "archive"))
    args = p.parse_args(argv)
    doc = json.load(open(args.export_path))
    manifest = json.load(open(os.path.join(args.archive, args.instance_id, "manifest.json")))
    out = transform(doc, manifest, args.instance_id)
    dest = os.path.join(args.archive, args.instance_id, "sapche.json")
    json.dump(out, open(dest, "w"), ensure_ascii=False, indent=2)
    n = _count(out["roots"])
    print(f"wrote {dest} ({n} sections)")


if __name__ == "__main__":
    main()
