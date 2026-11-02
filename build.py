"""Baut die Mi-Ramen-Website aus src/site-src.html:
   1. site/        fertige Version zum Hochladen auf den eigenen Webspace (mit SEO-Head, Bildern, sitemap.xml)
   2. preview.html Vorschau-Version mit eingebetteten Bildern (für claude.ai)

Aufruf:  python3 build.py
Vor dem Livegang SITE_URL auf die echte Domain setzen.
"""
import base64, json, pathlib

SITE_URL = "https://www.ihre-domain.de"   # TODO: echte Domain eintragen, ohne / am Ende
ROOT = pathlib.Path(__file__).parent
SRC = ROOT / "src"
OUT = ROOT / "site"
IMAGES = {"__LOGO__": "logo.webp", "__LOGO_DARK__": "logo-dark.webp", "__RAMEN__": "ramen.webp", "__INTERIOR__": "interior.webp",
          "__COUNTER__": "counter.webp", "__ROOM__": "room.webp",
          "__KATSU__": "katsu.webp", "__TATAR__": "tatar.webp"}

TITLE = "Mi Ramen Langenfeld – Ramen & Sushi Restaurant am Marktplatz"
DESCRIPTION = ("Mi Ramen in Langenfeld (Rheinland): japanisches Restaurant mit Ramen, Sushi, Donburi und Udon "
               "am Marktplatz 6. Speisekarte ansehen und online Tisch reservieren. Tel. 02173 8931968.")

SCHEMA = {
    "@context": "https://schema.org",
    "@type": "Restaurant",
    "@id": SITE_URL + "/#restaurant",
    "name": "Mi Ramen",
    "alternateName": "Mi Ramen Langenfeld – Noodles & Sushi",
    "description": "Japanisches Restaurant in Langenfeld (Rheinland) mit Ramen, Sushi, Donburi, Yaki Soba und Udon.",
    "url": SITE_URL + "/",
    "logo": SITE_URL + "/img/logo.webp",
    "image": [SITE_URL + "/img/og-image.jpg", SITE_URL + "/img/ramen.webp", SITE_URL + "/img/katsu.webp", SITE_URL + "/img/tatar.webp", SITE_URL + "/img/interior.webp"],
    "telephone": "+49 2173 8931968",
    "priceRange": "€€",
    "servesCuisine": ["Japanisch", "Ramen", "Sushi", "Donburi", "Udon"],
    "acceptsReservations": True,
    "hasMenu": SITE_URL + "/#menu",
    "address": {
        "@type": "PostalAddress",
        "streetAddress": "Marktplatz 6",
        "postalCode": "40764",
        "addressLocality": "Langenfeld (Rheinland)",
        "addressRegion": "NRW",
        "addressCountry": "DE",
    },
    "openingHoursSpecification": [
        {"@type": "OpeningHoursSpecification", "dayOfWeek": ["Tuesday", "Wednesday", "Thursday", "Friday"], "opens": "12:00", "closes": "15:30"},
        {"@type": "OpeningHoursSpecification", "dayOfWeek": ["Tuesday", "Wednesday", "Thursday", "Friday"], "opens": "17:00", "closes": "22:00"},
        {"@type": "OpeningHoursSpecification", "dayOfWeek": ["Saturday", "Sunday"], "opens": "12:00", "closes": "22:00"},
    ],
}


def faq_schema(src):
    """FAQ-Schema aus den deutschen Fragen der Seite erzeugen."""
    import re
    pairs = re.findall(r'<summary data-i18n="faqQ\d+">(.*?)</summary><p data-i18n="faqA\d+">(.*?)</p>', src)
    return {"@context": "https://schema.org", "@type": "FAQPage",
            "mainEntity": [{"@type": "Question", "name": q, "acceptedAnswer": {"@type": "Answer", "text": a}} for q, a in pairs]}


def split_head(src):
    head, body = src.split("</style>\n", 1)
    head_lines = [l for l in (head + "</style>").splitlines()
                  if not l.startswith(("<title>", '<meta name="claude:', '<meta name="description"'))]
    return "\n".join(head_lines), body


def build_site(src):
    OUT.mkdir(exist_ok=True)
    (OUT / "img").mkdir(exist_ok=True)
    for f in IMAGES.values():
        (OUT / "img" / f).write_bytes((SRC / "img" / f).read_bytes())
    for f in ["og-image.jpg", "favicon.png", "apple-touch-icon.png"]:
        (OUT / "img" / f).write_bytes((SRC / "img" / f).read_bytes())
    html = src
    for key, f in IMAGES.items():
        html = html.replace(key, "img/" + f)
    html = html.replace('<img src="img/ramen.webp"', '<img src="img/ramen.webp" fetchpriority="high"')
    head, body = split_head(html)
    ld = lambda o: '<script type="application/ld+json">' + json.dumps(o, ensure_ascii=False) + "</script>"
    seo = f"""<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>{TITLE}</title>
<meta name="description" content="{DESCRIPTION}">
<meta name="robots" content="index, follow">
<link rel="canonical" href="{SITE_URL}/">
<meta name="theme-color" content="#E3191F">
<meta name="geo.region" content="DE-NW">
<meta name="geo.placename" content="Langenfeld (Rheinland)">
<meta property="og:type" content="restaurant">
<meta property="og:locale" content="de_DE">
<meta property="og:locale:alternate" content="en_GB">
<meta property="og:site_name" content="Mi Ramen Langenfeld">
<meta property="og:title" content="{TITLE}">
<meta property="og:description" content="{DESCRIPTION}">
<meta property="og:url" content="{SITE_URL}/">
<meta property="og:image" content="{SITE_URL}/img/og-image.jpg">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" type="image/png" href="img/favicon.png">
<link rel="apple-touch-icon" href="img/apple-touch-icon.png">
<link rel="preload" as="image" href="img/ramen.webp">
{ld(SCHEMA)}
{ld(faq_schema(src))}
"""
    (OUT / "index.html").write_text(seo + head + "\n</head>\n<body>\n" + body + "\n</body>\n</html>\n", encoding="utf-8")
    (OUT / "robots.txt").write_text(f"User-agent: *\nAllow: /\n\nSitemap: {SITE_URL}/sitemap.xml\n", encoding="utf-8")
    (OUT / "sitemap.xml").write_text(
        '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
        f"  <url><loc>{SITE_URL}/</loc><changefreq>monthly</changefreq><priority>1.0</priority></url>\n</urlset>\n", encoding="utf-8")


def build_preview(src):
    html = src
    for key, f in IMAGES.items():
        html = html.replace(key, "data:image/webp;base64," + base64.b64encode((SRC / "img" / f).read_bytes()).decode())
    (ROOT / "preview.html").write_text(html, encoding="utf-8")


if __name__ == "__main__":
    src = (SRC / "site-src.html").read_text(encoding="utf-8")
    build_site(src)
    build_preview(src)
    print("Fertig: site/ und preview.html")
