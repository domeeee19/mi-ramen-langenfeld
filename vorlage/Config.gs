/** Vorlage: Einstellungen für einen neuen Kunden. Nur diese Datei pro Kunde anpassen (siehe NEUER-KUNDE.md). */

/* ======================= EINSTELLUNGEN ======================= */
const CONFIG = {
  RESTAURANT: 'Name des Restaurants',
  TAGLINE: '',                 // kleine Zeile über dem Titel der E-Mails, '' = keine
  COLOR: '#1F6FB2',                           // Markenfarbe für E-Mails, Buchungsseite und App
  OWNER_EMAIL: 'inhaber@beispiel.de',   // bekommt jede neue Buchung
  TEST_MODE: true,                            // true = ALLE Mails (auch an Gäste) gehen an OWNER_EMAIL
  ADMIN_PASSWORD: 'BITTE-AENDERN',            // Nur Notlösung: besser als Skripteigenschaft ADMIN_PASSWORD speichern (siehe NEUER-KUNDE.md)
  PHONE: '0123 456789',
  ADDRESS: 'Straße 1, 12345 Ort',
  WEBSITE: '',                                // z. B. 'https://www.mi-ramen-langenfeld.de'
  SHEET_NAME: 'Reservierungen',
  AUTO_CONFIRM: true,        // true = sofort bestätigen; false = "Anfrage erhalten", Bestätigung in der App
  CAPACITY_PER_SLOT: 20,     // max. Gäste, die zur selben Uhrzeit beginnen
  MAX_PARTY: 8,              // größere Gruppen bitte telefonisch
  SLOT_MINUTES: 30,
  LAST_SEATING_BEFORE_CLOSE: 60,
  MIN_LEAD_MINUTES: 60,      // frühestens 60 Min. im Voraus online buchbar
  BOOK_AHEAD_DAYS: 60,
  // 0 = Sonntag … 6 = Samstag, null = Ruhetag (gleich wie auf der Website)
  HOURS: {
    0: [['12:00', '22:00']],
    1: null,
    2: [['12:00', '15:30'], ['17:00', '22:00']],
    3: [['12:00', '15:30'], ['17:00', '22:00']],
    4: [['12:00', '15:30'], ['17:00', '22:00']],
    5: [['12:00', '15:30'], ['17:00', '22:00']],
    6: [['12:00', '22:00']]
  }
};
