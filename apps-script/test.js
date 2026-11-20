process.env.TZ = 'Europe/Berlin';
const fs = require('fs'), vm = require('vm'), assert = require('assert');
// Simulation von Google Sheets, Gmail und Apps Script mit der Vorlage. Aufruf: node apps-script/test.js
const path = require('path');
const cfgFile = path.join(__dirname, '..', 'vorlage', 'Config.gs');
const code = fs.readFileSync(cfgFile, 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, 'Code.gs'), 'utf8');

// ---- Mocks ----
const mails = [];
let grid = [];                       // 2D array, row 0 = header
function makeSheet(){
  return {
    getRange(r, c, nr = 1, nc = 1){
      return {
        setNumberFormat(){ return this; }, setFontWeight(){ return this; },
        setValues(v){ for (let i=0;i<v.length;i++){ grid[r-1+i] = grid[r-1+i] || []; for (let j=0;j<v[i].length;j++){ let x = v[i][j]; if (typeof x==='string' && x[0]==="'") x = x.slice(1); grid[r-1+i][c-1+j] = x; } } return this; },
        getValues(){ const out=[]; for (let i=0;i<nr;i++){ const row=[]; for (let j=0;j<nc;j++) row.push((grid[r-1+i]||[])[c-1+j] ?? ''); out.push(row);} return out; }
      };
    },
    getLastRow(){ return grid.length; },
    setFrozenRows(){}, deleteRow(r){ grid.splice(r-1,1); },
    getParent(){ return ss; }
  };
}
const sheet = makeSheet();
const ss = { getId:()=> 'SSID', getUrl:()=> 'https://docs.google.com/spreadsheets/d/SSID', getSheetByName:()=> sheet, insertSheet:()=> sheet };
const props = {}; const cache = {};
const pad = n => String(n).padStart(2,'0');
const ctx = {
  console, Math, Date, JSON, String, Number, Object, isNaN, parseInt,
  SpreadsheetApp: { getActiveSpreadsheet:()=> ss, openById:()=> ss, create:()=> ss },
  PropertiesService: { getScriptProperties:()=> ({ getProperty:k=>props[k]||null, setProperty:(k,v)=>{props[k]=v;} }) },
  CacheService: { getScriptCache:()=> ({ get:k=>cache[k]||null, put:(k,v)=>{cache[k]=v;} }) },
  LockService: { getScriptLock:()=> ({ waitLock(){}, releaseLock(){} }) },
  MailApp: { sendEmail:o=> mails.push(o) },
  Utilities: {
    formatDate(d, tz, f){ return f.replace("'T'","T").replace('yyyy',d.getFullYear()).replace('MM',pad(d.getMonth()+1)).replace('dd',pad(d.getDate())).replace('HH',pad(d.getHours())).replace('mm',pad(d.getMinutes())).replace('ss',pad(d.getSeconds())); },
    getUuid:()=> 'uuid-' + Math.random().toString(36).slice(2)
  },
  ContentService: { createTextOutput:s=>({ s, setMimeType(){ return this; } }), MimeType:{ JSON:'json' } },
  HtmlService: {
    createHtmlOutputFromFile: f => ({ getContent: () => '<p>' + f + '</p>' }),
    createHtmlOutput: html => ({ html, setTitle(t){ this.title=t; return this; }, addMetaTag(){ return this; }, setXFrameOptionsMode(m){ this.xfo=m; return this; } }),
    XFrameOptionsMode: { ALLOWALL:'ALLOWALL', DEFAULT:'DEFAULT' }
  },
  ScriptApp: { getService:()=> ({ getUrl:()=> 'https://script.google.com/macros/s/TEST/exec' }) },
  Logger: { log(){} }
};
vm.createContext(ctx);
vm.runInContext(code + '\n;this.__x={setup,doPost,doGet,apiLogin,apiList,apiUpdate,apiCreate,apiDelete,apiInfo,apiBook,apiSlots,CONFIG,testReservation};', ctx);
const G = ctx.__x;
const OWNER = G.CONFIG.OWNER_EMAIL;
G.CONFIG.TEST_MODE = true; G.CONFIG.AUTO_CONFIRM = true;

// helpers
const nextOpen = (dow, offset=3) => { const d = new Date(); d.setDate(d.getDate()+offset); while (d.getDay()!==dow) d.setDate(d.getDate()+1); return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`; };
const post = obj => JSON.parse(G.doPost({ postData:{ contents: JSON.stringify(obj) } }).s);
const get = p => JSON.parse(G.doGet({ parameter:p }).s);
const tue = nextOpen(2), mon = nextOpen(1);
const base = { date:tue, time:'18:00', party:2, name:'Anna Kunde', phone:'0171 1234567', email:'anna@example.com', notes:'Fensterplatz', language:'de' };

G.setup();
assert.deepStrictEqual(grid[0].slice(0,3), ['ID','Erstellt','Datum']);

// 1) Normale Buchung -> 2 Mails, beide an Owner im Testmodus
let r = post(base);
assert.strictEqual(r.ok, true); assert.strictEqual(r.status, 'confirmed');
assert.strictEqual(mails.length, 2);
assert(mails.every(m => m.to === OWNER), 'all mails to owner in TEST_MODE');
const cust = mails[0], own = mails[1];
assert(cust.subject.startsWith('[TEST – an Gast: anna@example.com] Ihre Reservierung ist bestätigt'), cust.subject);
assert(cust.htmlBody.includes(G.CONFIG.RESTAURANT) && cust.htmlBody.includes(G.CONFIG.COLOR) && !/Mi Ramen/.test(cust.htmlBody + cust.body), 'Branding aus Config');
assert(cust.htmlBody.includes('Anna Kunde') && cust.htmlBody.includes('18:00 Uhr') && cust.htmlBody.includes(r.id));
assert(own.subject.includes('Neue Reservierung') && own.subject.includes('2 P.') && own.replyTo === 'anna@example.com');
assert(own.htmlBody.includes('Buchungs-App öffnen'));
console.log('OK  Buchung + 2 Mails (Test):', cust.subject, '|', own.subject);
assert.strictEqual(grid[1][2], tue); assert.strictEqual(grid[1][3], '18:00'); assert.strictEqual(grid[1][10], 'confirmed');

// 2) Englisch
mails.length = 0;
r = post({ ...base, name:'John Guest', email:'john@example.com', language:'en', time:'19:00' });
assert(mails[0].subject.includes('Your reservation is confirmed'), mails[0].subject);
console.log('OK  Englische Bestätigung:', mails[0].subject);

// 3) Validierung
assert.strictEqual(post({ ...base, date:mon }).code, 'slot_unavailable');            // Ruhetag
assert.strictEqual(post({ ...base, time:'16:00' }).code, 'slot_unavailable');        // Pause
assert.strictEqual(post({ ...base, time:'21:30' }).code, 'slot_unavailable');        // nach letzter Platzierung
assert.strictEqual(post({ ...base, party:9 }).code, 'party_too_large');
assert.strictEqual(post({ ...base, email:'kaputt' }).code, 'invalid_email');
assert.strictEqual(post({ ...base, date:'2020-01-01' }).code, 'slot_unavailable');
assert.strictEqual(post({ ...base, name:'=HYPERLINK("x")', }).ok, true);
assert.strictEqual(grid[grid.length-1][5], '=HYPERLINK("x")');  // als Text gespeichert (Apostroph-Präfix wurde gesetzt)
const before = grid.length; assert.strictEqual(post({ ...base, website:'spam' }).ok, true); assert.strictEqual(grid.length, before);
console.log('OK  Validierung, Ruhetag, Pausen, Honeypot, Formel-Schutz');

// 4) Kapazität (20 pro Uhrzeit)
for (let i=0;i<2;i++) assert.strictEqual(post({ ...base, time:'12:30', party:8 }).ok, true);
assert.strictEqual(post({ ...base, time:'12:30', party:5 }).code, 'full');
assert.strictEqual(post({ ...base, time:'12:30', party:4 }).ok, true);
const av = get({ action:'availability', date:tue });
assert.strictEqual(av.free['12:30'], 0); assert.strictEqual(av.free['18:00'], 20 - 2 - 2);
assert(!JSON.stringify(av).includes('Anna'), 'no personal data in availability');
console.log('OK  Kapazität + Verfügbarkeit:', JSON.stringify(av.free).slice(0,80) + '…');

// 5) Admin
assert.throws(() => G.apiLogin('x'), /ADMIN_PASSWORD/);
props.ADMIN_PASSWORD = 'geheim123';
assert.throws(() => G.apiLogin('falsch'), /Falsches Passwort/);
assert.throws(() => G.apiList('nope', '', ''), /SESSION_EXPIRED/);
const tk = G.apiLogin('geheim123');
let list = G.apiList(tk, tue, tue);
assert(list.length >= 6);
const anna = list.find(b => b.name === 'Anna Kunde');
mails.length = 0;
let u = G.apiUpdate(tk, anna.id, { status:'cancelled' }, true);
assert.strictEqual(u.kind, 'cancelled'); assert.strictEqual(mails.length, 1);
assert(mails[0].subject.includes('storniert') && mails[0].to === OWNER);
mails.length = 0;
u = G.apiUpdate(tk, list.find(b=>b.name==='John Guest').id, { time:'19:30', party:3 }, true);
assert.strictEqual(u.kind, 'changed'); assert(mails[0].subject.includes('has been changed'));
const created = G.apiCreate(tk, { date:tue, time:'20:00', party:12, name:'Telefon Gast', phone:'02173 1111', email:'', status:'confirmed' }, true);
assert(created.id.startsWith('MR-'));
G.apiDelete(tk, created.id);
assert(!G.apiList(tk, tue, tue).some(b => b.id === created.id));
console.log('OK  Admin: Login, Liste, Storno-Mail, Änderungs-Mail, Anlegen, Löschen');

// 6) Live-Modus: Mail an Gast
G.CONFIG.TEST_MODE = false; mails.length = 0;
post({ ...base, time:'17:00', email:'echt@example.com' });
assert.strictEqual(mails[0].to, 'echt@example.com'); assert.strictEqual(mails[1].to, OWNER);
assert(!mails[0].subject.includes('TEST'));
console.log('OK  Livemodus: Bestätigung an Gast, Buchung an Restaurant');

// 7) Pending-Workflow
G.CONFIG.AUTO_CONFIRM = false; mails.length = 0;
r = post({ ...base, time:'17:30' });
assert.strictEqual(r.status, 'pending'); assert(mails[0].subject.includes('Reservierungsanfrage erhalten'));
mails.length = 0;
u = G.apiUpdate(tk, r.id, { status:'confirmed' }, true);
assert.strictEqual(u.kind, 'confirmed'); assert(mails[0].subject.includes('bestätigt'));
console.log('OK  Anfrage -> Bestätigung in der App');

// 8) Buchungsseite und Vorlage
G.CONFIG.AUTO_CONFIRM = true; mails.length = 0;
const page = G.doGet({ parameter:{ seite:'buchen' } });
assert(page.html.includes('window.CFG=') && page.html.includes('<p>Buchen</p>') && page.xfo === 'ALLOWALL');
assert(!page.html.includes('OWNER') && !page.html.includes(OWNER), 'keine privaten Daten in der Buchungsseite');
const admin = G.doGet({ parameter:{} });
assert(admin.html.includes('<p>Admin</p>') && admin.xfo === 'DEFAULT' && admin.title.includes(G.CONFIG.RESTAURANT));
assert.strictEqual(G.apiSlots(tue).ok, true);
r = G.apiBook({ ...base, time:'20:30', email:'seite@example.com' });
assert.strictEqual(r.ok, true); assert.strictEqual(grid[grid.length-1][11], 'buchungsseite');
const rows = grid.length; assert.strictEqual(G.apiBook({ ...base, website:'bot' }).ok, true); assert.strictEqual(grid.length, rows);
assert.strictEqual(G.apiBook({ ...base, date:mon }).code, 'slot_unavailable');
console.log('OK  Buchungsseite: Einstellungen, Buchen, Honeypot, Ruhetag; Admin-Titel aus Config');
console.log('\nAlle Tests bestanden.');
