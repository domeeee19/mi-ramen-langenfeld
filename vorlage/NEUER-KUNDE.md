# Buchungstool für einen neuen Kunden (ca. 30 Minuten)

Alle Kunden nutzen denselben Code. Pro Kunde ändert sich nur `Config.gs`.

| Datei | Woher | Pro Kunde ändern? |
|---|---|---|
| `Config.gs` | `vorlage/Config.gs` | **ja** |
| `Code.gs`, `Admin.html`, `Buchen.html`, `appsscript.json` | `apps-script/` | nein |

## 1. Vorbereiten (5 Min.)

Vom Kunden einholen: Name, Markenfarbe (Hex), E-Mail für neue Buchungen, Telefon, Adresse, Öffnungszeiten, Plätze pro Uhrzeit, maximale Gruppengröße, sofort bestätigen oder erst prüfen.

## 2. Im Google-Konto des Kunden (15 Min.)

1. Neue Google-Tabelle anlegen, z. B. „<Name> – Reservierungen“. **Erweiterungen → Apps Script**.
2. Dateien anlegen und einfügen: `Code`, `Config` (Skript) sowie `Admin`, `Buchen` (HTML). Manifest `appsscript.json` einblenden und einfügen, wie in `apps-script/ANLEITUNG.md` beschrieben.
3. In `Config.gs` die Angaben aus Schritt 1 eintragen. `TEST_MODE: true` lassen, `OWNER_EMAIL` vorerst auf deine eigene Adresse.
4. **Projekteinstellungen → Skripteigenschaften**: `ADMIN_PASSWORD` mit einem eigenen Passwort anlegen.
5. `setup` ausführen und Berechtigungen erlauben, dann `testReservation`: Es müssen zwei Mails ankommen.
6. **Bereitstellen → Neue Bereitstellung → Web-App**, Ausführen als „Ich“, Zugriff „Jeder“. URL notieren.

## 3. Einbinden (5 Min.)

Eine der beiden Varianten:

- **Kunde hat keine Website mit Formular:** Link „Tisch reservieren“ auf `<URL>?seite=buchen` setzen, z. B. im Google-Unternehmensprofil, auf Instagram, als QR-Code. Oder einbetten:
  ```html
  <iframe src="<URL>?seite=buchen" title="Tisch reservieren" style="width:100%;height:1100px;border:0"></iframe>
  ```
- **Website von uns (wie Mi Ramen):** Die URL in der Website bei `appsScriptUrl` eintragen.

## 4. Übergabe (5 Min.)

1. Eine Testbuchung über die Buchungsseite machen, in der Buchungs-App (`<URL>`) bestätigen und stornieren.
2. `OWNER_EMAIL` auf die Adresse des Kunden, `TEST_MODE: false`. **Bereitstellungen verwalten → Bearbeiten → Neue Version**.
3. Testzeile in der Tabelle löschen, dem Kunden App-Link und Passwort geben.
4. AVV unterschreiben lassen und die Datenschutzerklärung des Kunden um die Reservierung ergänzen.

## Updates für alle Kunden

Ändert sich `Code.gs`, `Admin.html` oder `Buchen.html`, die Datei in jedem Kundenprojekt ersetzen und eine neue Version bereitstellen. `Config.gs` bleibt unangetastet.

Vorher testen:

```bash
node apps-script/test.js
```
