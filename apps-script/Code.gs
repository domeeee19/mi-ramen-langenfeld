/**
 * Mi Ramen Langenfeld – Reservierungen
 * Google Apps Script: nimmt Reservierungen der Website an, speichert sie im Google Sheet,
 * verschickt Bestätigung (Gast) und Benachrichtigung (Restaurant) und liefert die Buchungs-App.
 *
 * Einrichtung: siehe ANLEITUNG.md
 */

/* ======================= EINSTELLUNGEN ======================= */
const CONFIG = {
  RESTAURANT: 'Mi Ramen Langenfeld',
  OWNER_EMAIL: 'dominik.gburski@gmail.com',   // bekommt jede neue Buchung
  TEST_MODE: true,                            // true = ALLE Mails (auch an Gäste) gehen an OWNER_EMAIL
  ADMIN_PASSWORD: 'hNqPc8bpQTnMqP3fhkaf',            // Passwort für die Buchungs-App – unbedingt ändern!
  PHONE: '02173 8931968',
  ADDRESS: 'Marktplatz 6, 40764 Langenfeld',
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

const COLUMNS = ['ID', 'Erstellt', 'Datum', 'Uhrzeit', 'Personen', 'Name', 'Telefon', 'E-Mail',
  'Anmerkungen', 'Sprache', 'Status', 'Quelle', 'Geändert', 'Interne Notiz'];
const KEYS = ['id', 'createdAt', 'date', 'time', 'party', 'name', 'phone', 'email',
  'notes', 'language', 'status', 'source', 'updatedAt', 'internalNote'];
const STATUSES = ['pending', 'confirmed', 'seated', 'noshow', 'cancelled'];
const ACTIVE = ['pending', 'confirmed', 'seated'];
const TZ = 'Europe/Berlin';

/* ======================= EINRICHTUNG ======================= */
/** Einmal im Editor ausführen: legt das Tabellenblatt an und merkt sich die Tabelle. */
function setup() {
  let ss = null;
  try { ss = SpreadsheetApp.getActiveSpreadsheet(); } catch (e) { ss = null; }
  if (!ss) ss = SpreadsheetApp.create('Mi Ramen – Reservierungen');
  PropertiesService.getScriptProperties().setProperty('SPREADSHEET_ID', ss.getId());
  let sh = ss.getSheetByName(CONFIG.SHEET_NAME);
  if (!sh) sh = ss.insertSheet(CONFIG.SHEET_NAME);
  sh.getRange(1, 1, 1000, COLUMNS.length).setNumberFormat('@');
  sh.getRange(1, 1, 1, COLUMNS.length).setValues([COLUMNS]).setFontWeight('bold');
  sh.setFrozenRows(1);
  Logger.log('Fertig. Tabelle: ' + ss.getUrl());
  return ss.getUrl();
}

/** Optional im Editor ausführen: schickt eine Testbuchung durch die komplette Logik. */
function testReservation() {
  const d = new Date(); d.setDate(d.getDate() + 7);
  while (!CONFIG.HOURS[d.getDay()]) d.setDate(d.getDate() + 1);
  const res = handleReservation_({
    date: Utilities.formatDate(d, TZ, 'yyyy-MM-dd'), time: CONFIG.HOURS[d.getDay()][0][0], party: 2,
    name: 'Test Gast', phone: '0170 1234567', email: 'gast@example.com', notes: 'Testbuchung', language: 'de', source: 'test'
  });
  Logger.log(JSON.stringify(res));
  return res;
}

/* ======================= WEB-ENDPUNKTE ======================= */
function doPost(e) {
  let data;
  try { data = JSON.parse((e && e.postData && e.postData.contents) || '{}'); }
  catch (err) { return json_({ ok: false, code: 'bad_request' }); }
  if (data.website) return json_({ ok: true, status: 'confirmed' });   // Honeypot: Bots füllen das versteckte Feld
  return json_(handleReservation_(data));
}

function doGet(e) {
  const p = (e && e.parameter) || {};
  if (p.action === 'availability') return json_(availability_(String(p.date || '')));
  if (p.action === 'ping') return json_({ ok: true });
  return HtmlService.createTemplateFromFile('Admin').evaluate()
    .setTitle('Mi Ramen · Reservierungen')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/* ======================= RESERVIERUNG ======================= */
function handleReservation_(data) {
  const b = cleanBooking_(data);
  const err = validatePublic_(b);
  if (err) return { ok: false, code: err };

  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    if (remaining_(b.date, b.time) < b.party) return { ok: false, code: 'full' };
    const now = stamp_();
    b.id = newId_();
    b.createdAt = now;
    b.updatedAt = now;
    b.status = CONFIG.AUTO_CONFIRM ? 'confirmed' : 'pending';
    b.source = b.source || 'website';
    appendBooking_(b);
  } finally {
    lock.releaseLock();
  }

  const mail = { customer: false, owner: false };
  try { sendCustomerMail_(b, b.status === 'confirmed' ? 'confirmed' : 'pending'); mail.customer = true; } catch (e) { console.error(e); }
  try { sendOwnerMail_(b); mail.owner = true; } catch (e) { console.error(e); }
  return { ok: true, id: b.id, status: b.status, mail: mail };
}

function cleanBooking_(d) {
  const s = (v, max) => String(v == null ? '' : v).replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max);
  return {
    date: s(d.date, 10),
    time: s(d.time, 5),
    party: parseInt(d.party, 10) || 0,
    name: s(d.name, 80),
    phone: s(d.phone, 30),
    email: s(d.email, 120).toLowerCase(),
    notes: String(d.notes == null ? '' : d.notes).trim().slice(0, 500),
    language: d.language === 'en' ? 'en' : 'de',
    source: s(d.source, 20),
    internalNote: String(d.internalNote == null ? '' : d.internalNote).trim().slice(0, 500)
  };
}

function validBasics_(b) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(b.date) || isNaN(parseDate_(b.date))) return 'invalid_date';
  if (!/^\d{2}:\d{2}$/.test(b.time)) return 'invalid_time';
  if (b.party < 1 || b.party > 50) return 'invalid_party';
  if (b.name.length < 2) return 'invalid_name';
  if (b.phone.replace(/\D/g, '').length < 6) return 'invalid_phone';
  if (b.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(b.email)) return 'invalid_email';
  return null;
}

function validatePublic_(b) {
  const basic = validBasics_(b);
  if (basic) return basic;
  if (!b.email) return 'invalid_email';
  if (b.party > CONFIG.MAX_PARTY) return 'party_too_large';
  if (slotsFor_(b.date).indexOf(b.time) === -1) return 'slot_unavailable';
  return null;
}

/** Buchbare Startzeiten eines Tages (berücksichtigt Öffnungszeiten, Vorlauf und Buchungszeitraum). */
function slotsFor_(dateStr) {
  const d = parseDate_(dateStr);
  if (isNaN(d)) return [];
  const today = Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd');
  const max = new Date(parseDate_(today).getTime() + CONFIG.BOOK_AHEAD_DAYS * 86400000);
  if (dateStr < today || d > max) return [];
  const hours = CONFIG.HOURS[d.getDay()];
  if (!hours) return [];
  const nowMin = toMin_(Utilities.formatDate(new Date(), TZ, 'HH:mm')) + CONFIG.MIN_LEAD_MINUTES;
  const out = [];
  hours.forEach(function (h) {
    for (let m = toMin_(h[0]); m <= toMin_(h[1]) - CONFIG.LAST_SEATING_BEFORE_CLOSE; m += CONFIG.SLOT_MINUTES) {
      if (dateStr !== today || m >= nowMin) out.push(fromMin_(m));
    }
  });
  return out;
}

function remaining_(date, time, excludeId) {
  const used = readBookings_()
    .filter(function (r) { return r.date === date && r.time === time && ACTIVE.indexOf(r.status) !== -1 && r.id !== excludeId; })
    .reduce(function (sum, r) { return sum + (Number(r.party) || 0); }, 0);
  return CONFIG.CAPACITY_PER_SLOT - used;
}

/** Öffentlich: freie Plätze pro Uhrzeit (keine personenbezogenen Daten). */
function availability_(date) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { ok: false, code: 'invalid_date' };
  const slots = slotsFor_(date);
  const rows = readBookings_().filter(function (r) { return r.date === date && ACTIVE.indexOf(r.status) !== -1; });
  const free = {};
  slots.forEach(function (t) {
    const used = rows.filter(function (r) { return r.time === t; }).reduce(function (s, r) { return s + (Number(r.party) || 0); }, 0);
    free[t] = Math.max(0, CONFIG.CAPACITY_PER_SLOT - used);
  });
  return { ok: true, date: date, maxParty: CONFIG.MAX_PARTY, free: free };
}

/* ======================= TABELLE ======================= */
function sheet_() {
  const id = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
  const ss = id ? SpreadsheetApp.openById(id) : SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw new Error('Keine Tabelle gefunden. Bitte zuerst setup() ausführen.');
  let sh = ss.getSheetByName(CONFIG.SHEET_NAME);
  if (!sh) { setup(); sh = ss.getSheetByName(CONFIG.SHEET_NAME); }
  return sh;
}

function safeCell_(v) {
  const s = String(v == null ? '' : v);
  return /^[=+\-@]/.test(s) ? "'" + s : s;
}

function appendBooking_(b) {
  const sh = sheet_();
  const row = sh.getLastRow() + 1;
  const range = sh.getRange(row, 1, 1, KEYS.length);
  range.setNumberFormat('@');
  range.setValues([KEYS.map(function (k) { return safeCell_(b[k]); })]);
}

function readBookings_() {
  const sh = sheet_();
  const last = sh.getLastRow();
  if (last < 2) return [];
  const values = sh.getRange(2, 1, last - 1, KEYS.length).getValues();
  return values.map(function (r, i) {
    const o = { _row: i + 2 };
    KEYS.forEach(function (k, j) { o[k] = normalizeCell_(k, r[j]); });
    o.party = Number(o.party) || 0;
    return o;
  }).filter(function (o) { return o.id; });
}

function normalizeCell_(key, v) {
  if (v instanceof Date) {
    if (key === 'date') return Utilities.formatDate(v, TZ, 'yyyy-MM-dd');
    if (key === 'time') return Utilities.formatDate(v, TZ, 'HH:mm');
    return Utilities.formatDate(v, TZ, "yyyy-MM-dd'T'HH:mm:ss");
  }
  const s = String(v == null ? '' : v);
  return s.charAt(0) === "'" ? s.slice(1) : s;
}

function writeBooking_(b) {
  const range = sheet_().getRange(b._row, 1, 1, KEYS.length);
  range.setNumberFormat('@');
  range.setValues([KEYS.map(function (k) { return safeCell_(b[k]); })]);
}

/* ======================= BUCHUNGS-APP (google.script.run) ======================= */
function apiLogin(password) {
  const cache = CacheService.getScriptCache();
  const fails = Number(cache.get('login_fails') || 0);
  if (fails >= 10) throw new Error('Zu viele Fehlversuche. Bitte in 10 Minuten erneut versuchen.');
  if (CONFIG.ADMIN_PASSWORD === 'BITTE-AENDERN') throw new Error('Bitte zuerst ADMIN_PASSWORD in Code.gs ändern.');
  if (String(password) !== CONFIG.ADMIN_PASSWORD) {
    cache.put('login_fails', String(fails + 1), 600);
    throw new Error('Falsches Passwort.');
  }
  const token = Utilities.getUuid();
  cache.put('session_' + token, '1', 21600);   // 6 Stunden
  return token;
}

function auth_(token) {
  if (!token || !CacheService.getScriptCache().get('session_' + token)) throw new Error('SESSION_EXPIRED');
}

function apiInfo(token) {
  auth_(token);
  return { testMode: CONFIG.TEST_MODE, ownerEmail: CONFIG.OWNER_EMAIL, capacity: CONFIG.CAPACITY_PER_SLOT,
    hours: CONFIG.HOURS, autoConfirm: CONFIG.AUTO_CONFIRM, sheetUrl: sheet_().getParent().getUrl() };
}

function apiList(token, from, to) {
  auth_(token);
  return readBookings_()
    .filter(function (b) { return (!from || b.date >= from) && (!to || b.date <= to); })
    .sort(function (a, b) { return (a.date + a.time).localeCompare(b.date + b.time); })
    .map(function (b) { delete b._row; return b; });
}

function apiCreate(token, data, notify) {
  auth_(token);
  const b = cleanBooking_(data);
  const err = validBasics_(b);
  if (err) throw new Error(errorText_(err));
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const now = stamp_();
    b.id = newId_();
    b.createdAt = now;
    b.updatedAt = now;
    b.status = STATUSES.indexOf(data.status) !== -1 ? data.status : 'confirmed';
    b.source = 'telefon/app';
    appendBooking_(b);
  } finally {
    lock.releaseLock();
  }
  if (notify && b.email) sendCustomerMail_(b, b.status === 'pending' ? 'pending' : 'confirmed');
  return b;
}

function apiUpdate(token, id, patch, notify) {
  auth_(token);
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  let b, kind = null;
  try {
    b = readBookings_().filter(function (r) { return r.id === id; })[0];
    if (!b) throw new Error('Reservierung nicht gefunden.');
    const before = { date: b.date, time: b.time, party: b.party, status: b.status };
    const c = cleanBooking_(Object.assign({}, b, patch));
    ['date', 'time', 'party', 'name', 'phone', 'email', 'notes', 'language', 'internalNote'].forEach(function (k) { b[k] = c[k]; });
    if (patch.status && STATUSES.indexOf(patch.status) !== -1) b.status = patch.status;
    const err = validBasics_(b);
    if (err) throw new Error(errorText_(err));
    b.updatedAt = stamp_();
    writeBooking_(b);
    if (b.status === 'cancelled' && before.status !== 'cancelled') kind = 'cancelled';
    else if (b.status === 'confirmed' && before.status === 'pending') kind = 'confirmed';
    else if (b.status !== 'cancelled' && (b.date !== before.date || b.time !== before.time || b.party !== before.party)) kind = 'changed';
  } finally {
    lock.releaseLock();
  }
  if (notify && kind && b.email) sendCustomerMail_(b, kind);
  delete b._row;
  return { booking: b, mailed: !!(notify && kind && b.email), kind: kind };
}

function apiDelete(token, id) {
  auth_(token);
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const b = readBookings_().filter(function (r) { return r.id === id; })[0];
    if (!b) throw new Error('Reservierung nicht gefunden.');
    sheet_().deleteRow(b._row);
  } finally {
    lock.releaseLock();
  }
  return true;
}

function errorText_(code) {
  return ({
    invalid_date: 'Bitte ein gültiges Datum angeben.', invalid_time: 'Bitte eine gültige Uhrzeit angeben (HH:MM).',
    invalid_party: 'Bitte eine gültige Personenzahl angeben.', invalid_name: 'Bitte einen Namen angeben.',
    invalid_phone: 'Bitte eine gültige Telefonnummer angeben.', invalid_email: 'Bitte eine gültige E-Mail-Adresse angeben.'
  })[code] || code;
}

/* ======================= E-MAILS ======================= */
const WD = { de: ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'],
  en: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] };
const MO = { de: ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'],
  en: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'] };

function longDate_(dateStr, lang) {
  const d = parseDate_(dateStr);
  return lang === 'en'
    ? WD.en[d.getDay()] + ', ' + d.getDate() + ' ' + MO.en[d.getMonth()] + ' ' + d.getFullYear()
    : WD.de[d.getDay()] + ', ' + d.getDate() + '. ' + MO.de[d.getMonth()] + ' ' + d.getFullYear();
}

const MAIL_TEXT = {
  de: {
    confirmed: { subject: 'Ihre Reservierung ist bestätigt', title: 'Wir freuen uns auf Sie!', intro: 'vielen Dank für Ihre Reservierung. Ihr Tisch ist für Sie reserviert:' },
    pending: { subject: 'Wir haben Ihre Reservierungsanfrage erhalten', title: 'Anfrage erhalten', intro: 'vielen Dank für Ihre Anfrage. Wir prüfen sie und bestätigen Ihnen den Tisch so schnell wie möglich:' },
    changed: { subject: 'Ihre Reservierung wurde geändert', title: 'Reservierung geändert', intro: 'Ihre Reservierung wurde angepasst. Das sind die neuen Angaben:' },
    cancelled: { subject: 'Ihre Reservierung wurde storniert', title: 'Reservierung storniert', intro: 'Ihre folgende Reservierung wurde storniert:' },
    hello: 'Hallo', date: 'Datum', time: 'Uhrzeit', party: 'Personen', name: 'Name', notes: 'Anmerkungen', ref: 'Buchungsnummer',
    change: 'Sie möchten etwas ändern oder absagen? Rufen Sie uns an unter', orReply: 'oder antworten Sie einfach auf diese E-Mail.',
    sign: 'Ihr Mi Ramen Team', clock: ' Uhr', cancelledMore: 'Wir hoffen, Sie bald wieder bei uns begrüßen zu dürfen.'
  },
  en: {
    confirmed: { subject: 'Your reservation is confirmed', title: 'We look forward to seeing you!', intro: 'thank you for your reservation. Your table is booked:' },
    pending: { subject: 'We have received your reservation request', title: 'Request received', intro: 'thank you for your request. We will check it and confirm your table as soon as possible:' },
    changed: { subject: 'Your reservation has been changed', title: 'Reservation changed', intro: 'Your reservation has been updated. Here are the new details:' },
    cancelled: { subject: 'Your reservation has been cancelled', title: 'Reservation cancelled', intro: 'The following reservation has been cancelled:' },
    hello: 'Hello', date: 'Date', time: 'Time', party: 'Guests', name: 'Name', notes: 'Notes', ref: 'Booking reference',
    change: 'Need to change or cancel? Call us on', orReply: 'or simply reply to this email.',
    sign: 'Your Mi Ramen team', clock: '', cancelledMore: 'We hope to welcome you again soon.'
  }
};

function esc_(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}

function mailShell_(title, inner) {
  return '<div style="background:#F4F1EB;padding:24px 12px;font-family:Arial,Helvetica,sans-serif;color:#2C2A23">' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:10px;overflow:hidden">' +
    '<tr><td style="background:#E3191F;height:6px;font-size:0;line-height:0">&nbsp;</td></tr>' +
    '<tr><td style="padding:24px 28px 8px"><div style="font-size:13px;letter-spacing:2px;text-transform:uppercase;color:#E3191F;font-weight:bold">Mi Ramen · Noodles &amp; Sushi</div>' +
    '<h1 style="margin:8px 0 0;font-size:22px;line-height:1.3;color:#2C2A23">' + esc_(title) + '</h1></td></tr>' +
    '<tr><td style="padding:8px 28px 24px;font-size:15px;line-height:1.6">' + inner + '</td></tr>' +
    '<tr><td style="padding:16px 28px;background:#1B1B1A;color:#D9D5CC;font-size:13px;line-height:1.6">' +
    esc_(CONFIG.RESTAURANT) + '<br>' + esc_(CONFIG.ADDRESS) + '<br>Tel. ' + esc_(CONFIG.PHONE) +
    (CONFIG.WEBSITE ? '<br><a href="' + esc_(CONFIG.WEBSITE) + '" style="color:#ffffff">' + esc_(CONFIG.WEBSITE) + '</a>' : '') +
    '</td></tr></table></div>';
}

function detailsTable_(b, L) {
  const rows = [[L.date, longDate_(b.date, b.language)], [L.time, b.time + L.clock], [L.party, String(b.party)], [L.name, b.name]];
  if (b.notes) rows.push([L.notes, b.notes]);
  rows.push([L.ref, b.id]);
  return '<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;margin:12px 0 16px;border-collapse:collapse">' +
    rows.map(function (r) {
      return '<tr><td style="padding:8px 0;border-bottom:1px solid #E2DDD2;color:#5F5B50;width:40%">' + esc_(r[0]) +
        '</td><td style="padding:8px 0;border-bottom:1px solid #E2DDD2;font-weight:bold">' + esc_(r[1]).replace(/\n/g, '<br>') + '</td></tr>';
    }).join('') + '</table>';
}

function recipient_(email) {
  return CONFIG.TEST_MODE ? CONFIG.OWNER_EMAIL : email;
}

function sendCustomerMail_(b, kind) {
  const L = MAIL_TEXT[b.language] || MAIL_TEXT.de;
  const K = L[kind];
  let inner = '<p>' + L.hello + ' ' + esc_(b.name) + ',</p><p>' + K.intro + '</p>' + detailsTable_(b, L);
  inner += kind === 'cancelled'
    ? '<p>' + L.cancelledMore + '</p>'
    : '<p>' + L.change + ' <strong>' + esc_(CONFIG.PHONE) + '</strong> ' + L.orReply + '</p>';
  inner += '<p>' + L.sign + '</p>';
  const testNote = CONFIG.TEST_MODE ? '[TEST – an Gast: ' + b.email + '] ' : '';
  MailApp.sendEmail({
    to: recipient_(b.email),
    subject: testNote + K.subject + ' – ' + CONFIG.RESTAURANT,
    htmlBody: (CONFIG.TEST_MODE ? testBanner_(b.email) : '') + mailShell_(K.title, inner),
    body: plain_(b, L, K),
    name: CONFIG.RESTAURANT,
    replyTo: CONFIG.OWNER_EMAIL
  });
}

function sendOwnerMail_(b) {
  const L = MAIL_TEXT.de;
  const url = adminUrl_();
  const statusText = b.status === 'pending' ? 'Bitte in der Buchungs-App bestätigen.' : 'Automatisch bestätigt.';
  const inner = '<p><strong>Neue Reservierung über die Website.</strong> ' + statusText + '</p>' +
    detailsTable_(Object.assign({}, b, { language: 'de' }), L) +
    '<p>Telefon: <strong>' + esc_(b.phone) + '</strong><br>E-Mail: <strong>' + esc_(b.email) + '</strong><br>' +
    'Sprache: ' + (b.language === 'en' ? 'Englisch' : 'Deutsch') + '</p>' +
    (url ? '<p><a href="' + esc_(url) + '" style="display:inline-block;background:#E3191F;color:#ffffff;text-decoration:none;padding:10px 18px;border-radius:999px;font-weight:bold">Buchungs-App öffnen</a></p>' : '');
  MailApp.sendEmail({
    to: CONFIG.OWNER_EMAIL,
    subject: (CONFIG.TEST_MODE ? '[TEST] ' : '') + 'Neue Reservierung: ' + longDate_(b.date, 'de') + ', ' + b.time + ' Uhr – ' + b.party + ' P. – ' + b.name,
    htmlBody: mailShell_('Neue Reservierung', inner),
    body: 'Neue Reservierung\n' + longDate_(b.date, 'de') + ', ' + b.time + ' Uhr\n' + b.party + ' Personen\n' + b.name +
      '\nTel. ' + b.phone + '\n' + b.email + (b.notes ? '\nAnmerkungen: ' + b.notes : '') + '\nNr. ' + b.id + (url ? '\n\nBuchungs-App: ' + url : ''),
    name: CONFIG.RESTAURANT + ' Website',
    replyTo: b.email
  });
}

function testBanner_(realEmail) {
  return '<div style="background:#FFF1B8;color:#3D3200;padding:10px 14px;font-family:Arial,sans-serif;font-size:13px;border-radius:6px;margin:0 auto 12px;max-width:560px">' +
    'TESTMODUS: Diese Mail würde im Livebetrieb an <strong>' + esc_(realEmail) + '</strong> gehen.</div>';
}

function plain_(b, L, K) {
  return L.hello + ' ' + b.name + ',\n\n' + K.intro + '\n\n' + L.date + ': ' + longDate_(b.date, b.language) + '\n' +
    L.time + ': ' + b.time + L.clock + '\n' + L.party + ': ' + b.party + '\n' + (b.notes ? L.notes + ': ' + b.notes + '\n' : '') +
    L.ref + ': ' + b.id + '\n\n' + L.change + ' ' + CONFIG.PHONE + ' ' + L.orReply + '\n\n' + L.sign + '\n' + CONFIG.RESTAURANT + ', ' + CONFIG.ADDRESS;
}

function adminUrl_() {
  try { return ScriptApp.getService().getUrl() || ''; } catch (e) { return ''; }
}

/* ======================= HILFSFUNKTIONEN ======================= */
function parseDate_(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return new Date(NaN);
  const d = new Date(+m[1], +m[2] - 1, +m[3]);
  return d.getMonth() === +m[2] - 1 ? d : new Date(NaN);
}
function toMin_(s) { const p = s.split(':'); return +p[0] * 60 + +p[1]; }
function fromMin_(m) { return ('0' + Math.floor(m / 60)).slice(-2) + ':' + ('0' + (m % 60)).slice(-2); }
function stamp_() { return Utilities.formatDate(new Date(), TZ, "yyyy-MM-dd'T'HH:mm:ss"); }
function newId_() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = 'MR-';
  for (let i = 0; i < 6; i++) s += chars.charAt(Math.floor(Math.random() * chars.length));
  return s;
}
