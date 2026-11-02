# Mi Ramen – Reservierungen einrichten (ca. 15 Minuten)

Die Automatisierung läuft kostenlos in **deinem Google-Konto** (dominik.gburski@gmail.com):

- Die Website schickt jede Reservierung an ein Google Apps Script.
- Das Script speichert sie in einer Google-Tabelle und prüft, ob zur Uhrzeit noch Plätze frei sind (Standard: 20 Gäste pro Startzeit).
- Es verschickt **zwei E-Mails**: die Bestätigung an den Gast und die Buchung an dich.
- **Testmodus (an):** Beide Mails gehen an dich. Die Gast-Mail ist gelb markiert mit „würde an … gehen“.
- Die **Buchungs-App** (Admin.html) läuft unter derselben Adresse und ist mit einem Passwort geschützt.

## Dateien

| Datei | Zweck |
|---|---|
| `Code.gs` | Logik: Buchung speichern, Plätze prüfen, E-Mails, Funktionen für die App |
| `Admin.html` | Buchungs-App: Tagesansicht, bestätigen, stornieren, bearbeiten, Telefonbuchungen eintragen |
| `appsscript.json` | Zeitzone Europe/Berlin, Web-App-Einstellungen |
| `../site/index.html` | Die Website zum Hochladen, bereits auf `mode: "appsscript"` umgestellt |

## 1. Tabelle und Script anlegen

1. Mit dem Google-Konto **dominik.gburski@gmail.com** auf <https://sheets.new> eine neue Tabelle anlegen und sie **„Mi Ramen – Reservierungen“** nennen.
2. Menü **Erweiterungen → Apps Script**.
3. Den Inhalt von `Code.gs` komplett in die Datei `Code.gs` im Editor einfügen (vorhandenen Code ersetzen).
4. Links auf **+ → HTML** klicken, die Datei genau **`Admin`** nennen und den Inhalt von `Admin.html` einfügen.
5. **Projekteinstellungen** (Zahnrad) → Häkchen bei **„Manifestdatei appsscript.json im Editor anzeigen“**. Dann `appsscript.json` öffnen und den Inhalt der gleichnamigen Datei einfügen.
6. In `Code.gs` oben **`ADMIN_PASSWORD`** auf ein eigenes Passwort ändern. Speichern (Strg/Cmd + S).

## 2. Einrichten und Test-Mail

1. Oben im Funktionsmenü **`setup`** wählen → **Ausführen**.
2. Google fragt nach Berechtigungen (Tabellen, E-Mail senden).
   - Erscheint „Google hat diese App nicht überprüft“: **Erweitert → „Zu … wechseln (unsicher)“ → Zulassen**.
   - Das ist normal, weil das Script dein eigenes ist.
3. Danach **`testReservation`** ausführen.
   - In der Tabelle erscheint eine Zeile.
   - In deinem Postfach kommen **zwei Mails** an: „[TEST – an Gast: gast@example.com] Ihre Reservierung ist bestätigt“ und „[TEST] Neue Reservierung …“.

## 3. Als Web-App veröffentlichen

1. **Bereitstellen → Neue Bereitstellung** → Zahnrad → **Web-App**.
2. Beschreibung: „Reservierungen“. **Ausführen als: Ich**. **Zugriff: Jeder**.
3. **Bereitstellen** und die **Web-App-URL** kopieren. Sie endet auf `/exec`.

## 4. Website verbinden

In `src/site-src.html` im Skriptbereich oben eintragen und danach `python3 build.py` ausführen (oder direkt in `site/index.html` ändern):

```js
const RESERVATION = {
  mode: "appsscript",
  appsScriptUrl: "https://script.google.com/macros/s/…/exec",
  …
```

Danach zeigt der Kalender ausgebuchte Uhrzeiten durchgestrichen an. Nach dem Absenden sehen Gäste „Tisch reserviert“ und bekommen die Bestätigung per Mail.

> Wichtig: Das funktioniert erst, wenn die Website auf eurem eigenen Webspace liegt. Die Vorschau auf claude.ai darf keine Daten an fremde Server senden. Dort sehen Gäste nach dem Absenden die Bitte, anzurufen.

## 5. Buchungs-App nutzen

- Die Web-App-URL im Browser öffnen und mit dem Passwort anmelden.
- Tipp fürs Handy: **Teilen → Zum Home-Bildschirm**.
- **Tag / 7 Tage / Alle kommenden**: Übersicht mit Gästezahl und freien Plätzen pro Uhrzeit.
- **Bestätigen** (bei Anfragen) und **Stornieren** schicken dem Gast automatisch eine E-Mail, falls er eine E-Mail-Adresse angegeben hat.
- **Erschienen / Nicht erschienen** markiert den Besuch, ohne E-Mail.
- **Bearbeiten**: Datum, Uhrzeit, Personen, Status, interne Notiz. Optional wird der Gast über die Änderung informiert.
- **+ Neue Reservierung**: Telefonbuchungen eintragen. Diese dürfen auch außerhalb der Online-Zeiten und über 8 Personen liegen.
- Alle Daten stehen zusätzlich in der Google-Tabelle. Die Spalten bitte nicht umsortieren.

## 6. Livebetrieb starten

1. In `Code.gs` **`TEST_MODE: false`** setzen.
2. Optional anpassen: `CAPACITY_PER_SLOT`, `MAX_PARTY`, `AUTO_CONFIRM`.
   - `AUTO_CONFIRM: false` bedeutet: Gäste bekommen erst „Anfrage erhalten“, und du bestätigst in der App.
3. **Wichtig nach jeder Code-Änderung:** **Bereitstellen → Bereitstellungen verwalten → Bearbeiten (Stift) → Version: Neue Version → Bereitstellen**. Die URL bleibt gleich.

## Gut zu wissen

- **Öffnungszeiten** stehen zweimal: in `Code.gs` (`HOURS`) und in der Website. Bei Änderungen bitte beide anpassen.
- **E-Mail-Limit:** Ein kostenloses Gmail-Konto darf per Script ca. **100 Empfänger pro Tag** anschreiben, Google Workspace ca. 1.500. Jede Online-Buchung braucht 2 Mails, also reicht das für etwa 50 Buchungen am Tag.
- **Absender** ist das Google-Konto, in dem das Script läuft. Mit einer eigenen Restaurant-Adresse (z. B. Google Workspace mit info@…) wirkt das professioneller. Dann auch `OWNER_EMAIL` ändern.
- **Datenschutz:** Für den Livebetrieb empfiehlt sich ein **Google-Workspace-Konto**, denn nur dafür bietet Google einen Auftragsverarbeitungsvertrag nach Art. 28 DSGVO an. Die Datenschutzerklärung der Website ist schon auf Google Apps Script umgestellt.
- **Kapazität** zählt Gäste, die **zur selben Uhrzeit beginnen**. Überschneidungen über die Aufenthaltsdauer werden nicht berechnet.
- **Spam:** Die Website hat ein unsichtbares Feld gegen Bots, und das Script prüft alle Eingaben.
- **Sicherheit:** Nach 10 falschen Passwort-Versuchen sperrt die App die Anmeldung für 10 Minuten.
