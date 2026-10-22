#!/usr/bin/env python3
"""Genera index.html con estilos y scripts incrustados a partir de src/. Uso: python3 build.py"""
import re, pathlib
root = pathlib.Path(__file__).parent
src = root / "src"
html = (src / "index.template.html").read_text(encoding="utf-8")
css = (src / "styles.css").read_text(encoding="utf-8")
html = html.replace('<link rel="stylesheet" href="styles.css">', "<style>\n" + css + "</style>")
def inline(m):
    js = (src / m.group(1)).read_text(encoding="utf-8").replace("</script", "<\\/script")
    return "<script>\n" + js + "</script>"
html = re.sub(r'<script src="(js/[^"]+)"></script>', inline, html)
(root / "index.html").write_text(html, encoding="utf-8")
print("index.html generado,", len(html) // 1024, "KB")
