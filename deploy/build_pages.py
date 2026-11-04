"""Stellt die Demo für GitHub Pages zusammen (wird von .github/workflows/pages.yml ausgeführt).

_site/          Website (aus build.py)
_site/app/      Buchungs-App im Demo-Modus mit Beispieldaten
_site/demo/     Demo-Seite mit QR-Codes zu Website und App

Lokal testen:  SITE_URL=https://domeeee19.github.io/mi-ramen-langenfeld NOINDEX=1 python3 deploy/build_pages.py
"""
import os, pathlib, re, shutil, subprocess, sys

import segno

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / "_site"
BASE = os.environ.get("SITE_URL", "https://domeeee19.github.io/mi-ramen-langenfeld").rstrip("/")
WEBSITE_URL, APP_URL = BASE + "/", BASE + "/app/"

# 1) Website bauen und kopieren
subprocess.run([sys.executable, str(ROOT / "build.py")], check=True, env={**os.environ, "SITE_URL": BASE})
shutil.rmtree(OUT, ignore_errors=True)
shutil.copytree(ROOT / "site", OUT)
(OUT / ".nojekyll").write_text("")

CLAUDE_META = re.compile(r'<meta name="claude:[^>]*>\n?')

# 2) Buchungs-App: Admin.html ist für Apps Script ein HTML-Fragment, hier als vollständiges Dokument ausliefern
head = ('<!doctype html>\n<html lang="de">\n<head>\n<meta charset="utf-8">\n'
        '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n'
        '<meta name="robots" content="noindex, nofollow">\n'
        '<link rel="icon" type="image/png" href="../img/favicon.png">\n</head>\n<body>\n')
(OUT / "app").mkdir()
(OUT / "app" / "index.html").write_text(head + CLAUDE_META.sub("", (ROOT / "apps-script" / "Admin.html").read_text(encoding="utf-8")) + "\n</body>\n</html>\n", encoding="utf-8")

# 3) Demo-Seite mit QR-Codes zu den neuen Adressen
def qr_svg(url):
    return segno.make(url, error="q").svg_inline(scale=8, border=2, dark="#1B1B1A", light="#FFFFFF", omitsize=True)

demo = CLAUDE_META.sub("", (ROOT / "demo.html").read_text(encoding="utf-8"))
qrs = iter([qr_svg(WEBSITE_URL), qr_svg(APP_URL)])
demo = re.sub(r'(<div class="qr">).*?(</div>)', lambda m: m.group(1) + next(qrs) + m.group(2), demo, flags=re.S)
demo = re.sub(r"https://claude\.ai/artifact/No8dhb9YgZ4WZ1yUhwDWUX", WEBSITE_URL, demo)
demo = re.sub(r"https://claude\.ai/artifact/RfZzTYTKZZzW5XQSn8Fy6H", APP_URL, demo)
demo = re.sub(r"claude\.ai/artifact/No8dhb9YgZ4WZ1yUhwDWUX", WEBSITE_URL.split("://", 1)[1], demo)
demo = re.sub(r"claude\.ai/artifact/RfZzTYTKZZzW5XQSn8Fy6H", APP_URL.split("://", 1)[1], demo)
assert "claude" not in demo.lower(), "Demo-Seite enthält noch claude-Links"
demo = demo.replace('target="_blank" rel="noopener"', 'rel="noopener"')
(OUT / "demo").mkdir()
(OUT / "demo" / "index.html").write_text(head + demo + "\n</body>\n</html>\n", encoding="utf-8")

# QR-Codes zum Drucken
for name, url in [("website", WEBSITE_URL), ("app", APP_URL)]:
    q = segno.make(url, error="q")
    q.save(str(OUT / "demo" / f"qr-{name}.png"), scale=14, border=3, dark="#1B1B1A", light="#FFFFFF")

print("Fertig:", WEBSITE_URL, APP_URL, BASE + "/demo/")
