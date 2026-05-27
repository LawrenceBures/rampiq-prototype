"""
RampIQ document builder.
Converts the two phase 4 markdown documents into branded HTML and PDF.
"""
from pathlib import Path
import re
import subprocess
import sys

DOCS_DIR = Path(__file__).parent
STYLE_PATH = DOCS_DIR / "style.css"

# ----- 1. light markdown -> html (no external deps; we own the markdown so this is safe)

def md_to_html(md_text: str) -> str:
    lines = md_text.split("\n")
    out = []
    in_list = False
    in_table = False
    table_rows = []

    def flush_list():
        nonlocal in_list
        if in_list:
            out.append("</ul>")
            in_list = False

    def flush_table():
        nonlocal in_table, table_rows
        if in_table and table_rows:
            out.append("<table>")
            # first row is header
            header = table_rows[0]
            out.append("<thead><tr>")
            for cell in header:
                out.append(f"<th>{inline(cell.strip())}</th>")
            out.append("</tr></thead>")
            out.append("<tbody>")
            for row in table_rows[2:]:  # skip separator row
                out.append("<tr>")
                for cell in row:
                    out.append(f"<td>{inline(cell.strip())}</td>")
                out.append("</tr>")
            out.append("</tbody></table>")
            table_rows = []
            in_table = False

    def inline(text: str) -> str:
        # bold
        text = re.sub(r"\*\*([^*]+)\*\*", r"<strong>\1</strong>", text)
        # italic
        text = re.sub(r"(?<!\*)\*([^*]+)\*(?!\*)", r"<em>\1</em>", text)
        # inline code
        text = re.sub(r"`([^`]+)`", r"<code>\1</code>", text)
        return text

    for raw in lines:
        line = raw.rstrip()

        if not line.strip():
            flush_list()
            flush_table()
            continue

        # tables (pipe-delimited)
        if line.lstrip().startswith("|"):
            in_table = True
            cells = [c for c in line.strip().strip("|").split("|")]
            table_rows.append(cells)
            continue
        else:
            flush_table()

        # headings
        if line.startswith("# "):
            flush_list()
            out.append(f"<h1>{inline(line[2:])}</h1>")
            continue
        if line.startswith("## "):
            flush_list()
            out.append(f"<h2>{inline(line[3:])}</h2>")
            continue
        if line.startswith("### "):
            flush_list()
            out.append(f"<h3>{inline(line[4:])}</h3>")
            continue
        if line.startswith("#### "):
            flush_list()
            out.append(f"<h4>{inline(line[5:])}</h4>")
            continue

        # horizontal rule
        if line.strip() in ("---", "***"):
            flush_list()
            out.append("<hr/>")
            continue

        # list items (- or *)
        m = re.match(r"^\s*[-*]\s+(.*)", line)
        if m:
            if not in_list:
                out.append("<ul>")
                in_list = True
            out.append(f"<li>{inline(m.group(1))}</li>")
            continue

        # paragraphs
        flush_list()
        # italic-only line acts as signature/closing
        if line.startswith("*") and line.endswith("*") and len(line) > 2:
            out.append(f'<p class="signature">{inline(line)}</p>')
        else:
            out.append(f"<p>{inline(line)}</p>")

    flush_list()
    flush_table()
    return "\n".join(out)


# ----- 2. cover page builder

def build_cover(title: str, subtitle: str, doc_num: str, audience: str) -> str:
    return f"""
<div class="cover">
  <div class="cover-header">
    <div class="cover-mark"></div>
    <div class="cover-brand">Ramp<span class="iq">IQ</span></div>
    <div class="cover-tag">{doc_num}</div>
  </div>

  <div class="cover-eyebrow">Phase 4 · Pre-Pilot · Internal & Pilot-Audience</div>
  <h1 class="cover-title">{title}</h1>
  <p class="cover-sub">{subtitle}</p>

  <div class="cover-meta-grid">
    <div>
      <div class="cover-meta-l">Audience</div>
      <div class="cover-meta-v">{audience}</div>
    </div>
    <div>
      <div class="cover-meta-l">Status</div>
      <div class="cover-meta-v"><b>Pre-pilot</b> · scope-locking</div>
    </div>
    <div>
      <div class="cover-meta-l">Version</div>
      <div class="cover-meta-v">1.0 · May 2026</div>
    </div>
    <div>
      <div class="cover-meta-l">Companion docs</div>
      <div class="cover-meta-v">System Boundary · Data Map</div>
    </div>
  </div>

  <div class="cover-foot">RampIQ · Operational intelligence for ramp · Confidential</div>
</div>
"""


# ----- 3. wrap into full HTML doc

def wrap_html(title_string: str, body_html: str, cover_html: str) -> str:
    css_text = STYLE_PATH.read_text()
    return f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<title>{title_string}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@300;400;500;600;700&family=Instrument+Serif:ital@0;1&family=Inter+Tight:wght@300;400;500;600;700;800;900&display=swap" rel="stylesheet">
<style>{css_text}</style>
</head>
<body data-title="{title_string}">
{cover_html}
{body_html}
</body>
</html>
"""


# ----- 4. main build

DOCS = [
    {
        "src": DOCS_DIR / "01-system-boundary.md",
        "html_out": DOCS_DIR / "01-system-boundary.html",
        "pdf_out": DOCS_DIR / "01-system-boundary.pdf",
        "cover_title": "System <em>Boundary</em><br/>Document",
        "cover_subtitle": "What RampIQ is, what it does, what it does not do, and what assumptions must hold for it to operate. Read this before any integration discussion.",
        "doc_num": "DOC 01 · BOUNDARY",
        "audience": "Pilot leadership · IT integration · ramp leadership",
        "title_string": "System Boundary",
    },
    {
        "src": DOCS_DIR / "02-data-dependency-map.md",
        "html_out": DOCS_DIR / "02-data-dependency-map.html",
        "pdf_out": DOCS_DIR / "02-data-dependency-map.pdf",
        "cover_title": "Data <em>Dependency</em><br/>Map",
        "cover_subtitle": "Every input RampIQ requires, mapped to its source system, integration approach, real-world maturity, and degraded-operation behavior.",
        "doc_num": "DOC 02 · DATA MAP",
        "audience": "IT integration · solution architects · ops technology",
        "title_string": "Data Dependency Map",
    },
]


def main():
    try:
        from weasyprint import HTML
    except ImportError:
        print("weasyprint not installed", file=sys.stderr)
        sys.exit(1)

    for d in DOCS:
        print(f"Building {d['src'].name} …")
        md = d["src"].read_text()
        body = md_to_html(md)
        cover = build_cover(d["cover_title"], d["cover_subtitle"], d["doc_num"], d["audience"])
        html = wrap_html(d["title_string"], body, cover)
        d["html_out"].write_text(html)
        print(f"  → wrote {d['html_out'].name}")

        # render to PDF
        HTML(string=html, base_url=str(DOCS_DIR)).write_pdf(d["pdf_out"])
        print(f"  → wrote {d['pdf_out'].name}")

    print("\nAll documents built.")


if __name__ == "__main__":
    main()
