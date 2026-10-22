import re
from typing import Optional, Dict, Any, Tuple
import pymupdf

# In-memory LRU-like cache for highlight computation per (document_id, snippet, page)
HIGHLIGHT_CACHE: Dict[Tuple[str, str, Optional[int]], Dict[str, Any]] = {}
MAX_CACHE_ENTRIES = 500


def clean_text_for_search(text: str) -> str:
    """Normalize whitespace and strip common metadata prefixes."""
    s = re.sub(r'\s+', ' ', text or '').strip()
    prefixes = [
        "Diagnosis identified from medical record: ",
        "Prescription entry: ",
        "Laboratory investigation result: ",
    ]
    for pfx in prefixes:
        if s.startswith(pfx):
            s = s[len(pfx):].strip()
    return s


def compute_pdf_highlights(
    pdf_bytes: bytes,
    snippet: str,
    page_hint: Optional[int] = None,
) -> Dict[str, Any]:
    """
    Search for snippet in PDF using PyMuPDF.
    Returns:
    {
        "page": int (1-indexed),
        "pageWidth": float,
        "pageHeight": float,
        "rects": [{"x0": float, "y0": float, "x1": float, "y1": float}],
        "matchType": "exact" | "fuzzy" | "page_only" | "none"
    }
    """
    try:
        doc = pymupdf.open(stream=pdf_bytes, filetype="pdf")
    except Exception:
        return {
            "page": 1,
            "pageWidth": 0.0,
            "pageHeight": 0.0,
            "rects": [],
            "matchType": "none",
        }

    total_pages = len(doc)
    if total_pages == 0:
        doc.close()
        return {
            "page": 1,
            "pageWidth": 0.0,
            "pageHeight": 0.0,
            "rects": [],
            "matchType": "none",
        }

    # Determine page order: start with page_hint if valid, then remaining pages
    pages_to_check = []
    if page_hint and 1 <= page_hint <= total_pages:
        pages_to_check.append(page_hint - 1)
        for i in range(total_pages):
            if i != page_hint - 1:
                pages_to_check.append(i)
    else:
        pages_to_check = list(range(total_pages))

    # Check if there is any text in the document
    has_text_layer = False
    for i in range(total_pages):
        try:
            page_text = doc[i].get_text()
            if page_text and page_text.strip():
                has_text_layer = True
                break
        except Exception:
            pass

    if not has_text_layer:
        # Scanned PDF with no text layer
        target_p = (page_hint - 1) if (page_hint and 1 <= page_hint <= total_pages) else 0
        p = doc[target_p]
        res = {
            "page": target_p + 1,
            "pageWidth": float(p.rect.width),
            "pageHeight": float(p.rect.height),
            "rects": [],
            "matchType": "page_only",
        }
        doc.close()
        return res

    core_snippet = clean_text_for_search(snippet)

    # 1. Exact match attempts
    for p_idx in pages_to_check:
        page = doc[p_idx]
        candidates = [snippet, core_snippet]
        for cand in candidates:
            if not cand or not cand.strip():
                continue
            rects = page.search_for(cand.strip())
            if rects:
                res = {
                    "page": p_idx + 1,
                    "pageWidth": float(page.rect.width),
                    "pageHeight": float(page.rect.height),
                    "rects": [{"x0": float(r.x0), "y0": float(r.y0), "x1": float(r.x1), "y1": float(r.y1)} for r in rects],
                    "matchType": "exact",
                }
                doc.close()
                return res

    # 2. Match with punctuation and hyphens removed (e.g. "Metformin — 500 mg" -> "Metformin 500 mg")
    candidate_no_punct = re.sub(r'[\—\-\:\(\)\[\],]', ' ', core_snippet)
    candidate_no_punct = re.sub(r'\s+', ' ', candidate_no_punct).strip()
    if candidate_no_punct and candidate_no_punct != core_snippet:
        for p_idx in pages_to_check:
            page = doc[p_idx]
            rects = page.search_for(candidate_no_punct)
            if rects:
                res = {
                    "page": p_idx + 1,
                    "pageWidth": float(page.rect.width),
                    "pageHeight": float(page.rect.height),
                    "rects": [{"x0": float(r.x0), "y0": float(r.y0), "x1": float(r.x1), "y1": float(r.y1)} for r in rects],
                    "matchType": "exact",
                }
                doc.close()
                return res

    # 3. Fuzzy match: sliding windows of distinctive tokens
    raw_tokens = [t.strip(",.:;—/()[]") for t in core_snippet.split() if t.strip(",.:;—/()[]")]
    stopwords = {"and", "the", "with", "for", "from", "record", "identified", "patient", "entry", "result", "daily", "once", "twice"}
    tokens = [t for t in raw_tokens if t.lower() not in stopwords and len(t) > 1]

    candidate_windows = []
    # 3-token windows
    if len(tokens) >= 3:
        for i in range(len(tokens) - 2):
            candidate_windows.append(" ".join(tokens[i:i+3]))
    # 2-token windows (e.g. medicine + dose, lab + value)
    if len(tokens) >= 2:
        for i in range(len(tokens) - 1):
            candidate_windows.append(" ".join(tokens[i:i+2]))
    # Distinctive single token (>= 4 letters or contains digits)
    for t in tokens:
        if len(t) >= 4 or any(c.isdigit() for c in t):
            candidate_windows.append(t)

    for cand in candidate_windows:
        for p_idx in pages_to_check:
            page = doc[p_idx]
            rects = page.search_for(cand)
            if rects:
                res = {
                    "page": p_idx + 1,
                    "pageWidth": float(page.rect.width),
                    "pageHeight": float(page.rect.height),
                    "rects": [{"x0": float(r.x0), "y0": float(r.y0), "x1": float(r.x1), "y1": float(r.y1)} for r in rects],
                    "matchType": "fuzzy",
                }
                doc.close()
                return res

    # 4. Fallback: page_only (if page_hint valid) or none
    target_p = (page_hint - 1) if (page_hint and 1 <= page_hint <= total_pages) else 0
    p = doc[target_p]
    match_type = "page_only" if page_hint else "none"
    res = {
        "page": target_p + 1,
        "pageWidth": float(p.rect.width),
        "pageHeight": float(p.rect.height),
        "rects": [],
        "matchType": match_type,
    }
    doc.close()
    return res


def get_cached_pdf_highlights(
    document_id: str,
    snippet: str,
    page_hint: Optional[int],
    pdf_bytes: bytes
) -> Dict[str, Any]:
    global HIGHLIGHT_CACHE
    cache_key = (document_id, snippet or '', page_hint)
    if cache_key in HIGHLIGHT_CACHE:
        return HIGHLIGHT_CACHE[cache_key]

    result = compute_pdf_highlights(pdf_bytes, snippet, page_hint)

    if len(HIGHLIGHT_CACHE) >= MAX_CACHE_ENTRIES:
        # Evict oldest entry
        first_key = next(iter(HIGHLIGHT_CACHE))
        del HIGHLIGHT_CACHE[first_key]

    HIGHLIGHT_CACHE[cache_key] = result
    return result
