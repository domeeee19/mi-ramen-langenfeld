# Mi Ramen Langenfeld – Website & Reservierungen

Website und Reservierungssystem für **Mi Ramen – Noodles & Sushi**, Marktplatz 6, 40764 Langenfeld.

## Inhalt

| Ordner / Datei | Zweck |
|---|---|
| `src/site-src.html` | Quelle der Website (Deutsch/Englisch, Speisekarte, Reservierung, FAQ, Impressum, Datenschutz) |
| `src/img/` | Bilder und Logos (hell/dunkel) |
| `build.py` | Baut `site/` (zum Hochladen) und `preview.html` (Vorschau mit eingebetteten Bildern) |
| `site/` | Fertige Website inkl. SEO-Head, `sitemap.xml`, `robots.txt` – diesen Ordner auf den Webspace laden |
| `apps-script/` | Google Apps Script: Reservierungen speichern, E-Mails senden, Buchungs-App (`ANLEITUNG.md`) |
| `vorlage/` | Buchungstool für weitere Kunden: Beispiel-Einstellungen und Checkliste (`NEUER-KUNDE.md`) |
| `qr/` | QR-Codes für die Demo |
| `demo.html` | Demo-Seite mit QR-Codes |

## Website bauen

```bash
python3 build.py
```

Vorher in `build.py` `SITE_URL` auf die echte Domain setzen.

## Reservierungen einrichten

Siehe [`apps-script/ANLEITUNG.md`](apps-script/ANLEITUNG.md). Danach die Web-App-URL in `src/site-src.html` bei `appsScriptUrl` eintragen und neu bauen.

## Vor dem Livegang

- Passwort als Skripteigenschaft `ADMIN_PASSWORD` speichern, in `apps-script/Config.gs` `TEST_MODE` auf `false` setzen
- Gelb markierte Platzhalter in Impressum und Datenschutzerklärung ausfüllen
- Schriftarten lokal einbinden (Google Fonts) und Datenschutzerklärung anpassen
