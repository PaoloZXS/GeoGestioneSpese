/* =============================================
   DATA LAYER — Turso (SQLite edge) + cache in memoria
   ============================================= */

const DATA_RIFERIMENTO = new Date(2026, 6, 26);

// =============================================
// TURSO CONFIG (da process.env)
// =============================================
// TURSO_URL / TURSO_TOKEN vengono letti da process.env quando disponibile
// (es. serverless/Vercel). Nel browser si usano i valori di fallback.
// Nota sicurezza: il token RW è esposto nel client — in produzione valutare
// un proxy API lato server o un token con privilegi ridotti.

function normalizzaTursoUrl(url) {
  if (url && url.startsWith("libsql://")) {
    return "https://" + url.slice("libsql://".length);
  }
  return url;
}

const TURSO_URL = normalizzaTursoUrl(
  (typeof process !== "undefined" && process.env && process.env.TURSO_URL) ||
    "https://geogestionespese-paolozxs.aws-eu-west-1.turso.io"
);
const TURSO_TOKEN =
  (typeof process !== "undefined" && process.env && process.env.TURSO_TOKEN) ||
  "eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3ODc5MTQxMDYsImlkIjoiMDFhMDQ3ZmItOTMwMS03NmQ4LTgyNTctNWI5YTNiNzJmMTY5Iiwia2lkIjoidmQ2VmduNUs4d1pEY1hqcXNVLThRR0lWbnZXazExeW1mRlVkVmJNX3owdyIsInJpZCI6ImQxM2Y4NDlkLWY4NWMtNDVlNy1iZDQ1LTczMzg5YWIyOGVkNSJ9.IcfC4DvFZ34pVqIDZF_gmQfFx3HvcOXhj4x-36jsBfrU-pxk3a0jsDfkHHxDs6kYs2bp580wYbE1HzhqQXsKBw";

// =============================================
// TURSO REST HELPER (SQL over HTTP — /v2/pipeline)
// =============================================

// Converte un valore JS nel formato Hrana 2 per gli argomenti SQL
function tursoArg(v) {
  if (v === null || v === undefined) return { type: "null", value: null };
  if (typeof v === "number") {
    // Nota: per i decimali il server Turso vuole `float` con valore numerico
    // (f64), non `real` con stringa.
    return Number.isInteger(v)
      ? { type: "integer", value: String(v) }
      : { type: "float", value: v };
  }
  if (typeof v === "boolean") return { type: "integer", value: v ? "1" : "0" };
  return { type: "text", value: String(v) };
}

// Estrae il valore di una cella dalla risposta Turso
function tursoUnwrap(v) {
  if (v === null || v === undefined) return null;
  if (typeof v === "object" && v !== null && "type" in v) {
    if (v.type === "null" || v.value === null) return null;
    if (v.type === "integer" || v.type === "float") return Number(v.value);
    if (v.type === "blob") return v.base64 ?? v.value;
    return v.value;
  }
  return v;
}

/**
 * Esegue una pipeline Turso. `stmts` è un array di { sql, args }.
 * Le istruzioni girano in un'unica richiesta HTTP (batch).
 */
async function tursoPipeline(stmts) {
  const requests = stmts.map((s) => ({
    type: "execute",
    stmt: {
      sql: s.sql,
      args: (s.args || []).map(tursoArg),
      named_args: []
    }
  }));
  requests.push({ type: "close" });
  const resp = await fetch(`${TURSO_URL}/v2/pipeline`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${TURSO_TOKEN}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ requests })
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(`Turso (${resp.status}): ${text}`);
  }
  return resp.json();
}

/** Esegue una query SELECT e restituisce un array di oggetti. */
async function tursoFetchAll(sql, params = []) {
  const data = await tursoPipeline([{ sql, args: params }]);
  const res = data && data.results && data.results[0];
  if (!res) throw new Error("Turso: nessuna risposta");
  if (res.type === "error") {
    const err = (res.error && (res.error.message || res.error.code)) || "errore sconosciuto";
    throw new Error(`Turso: ${err}`);
  }
  if (res.type !== "ok") throw new Error("Turso: risposta non valida");
  const result = res.response && res.response.result;
  if (!result || !result.cols) return [];
  const cols = result.cols;
  return (result.rows || []).map((row) => {
    const obj = {};
    cols.forEach((c, i) => {
      obj[typeof c === "string" ? c : c.name] = tursoUnwrap(row[i]);
    });
    return obj;
  });
}

/** Esegue una singola istruzione (DDL/INSERT/UPDATE/DELETE). */
async function tursoExecute(sql, params = []) {
  await tursoPipeline([{ sql, args: params }]);
}

/** Esegue più istruzioni in un'unica richiesta HTTP (batch). */
async function tursoBatch(stmts) {
  await tursoPipeline(stmts);
}

// =============================================
// PRONTEZZA TABELLE (evita race al primo avvio)
// =============================================

let _tursoPronto = null;

// Restituisce una promise che si risolve quando le tabelle sono state create
// (le query che girano prima di initTurso fallirebbero con "no such table").
function quandoTursoPronto() {
  if (!_tursoPronto) _tursoPronto = initTurso();
  return _tursoPronto;
}

// =============================================
// CACHE IN-MEMORIA
// =============================================

let _cacheReady = false;
let _speseCache = {};
let _entrateCache = {};
let _categorieCache = null;
let _ricorrentiCache = null;

// =============================================
// CARICAMENTO INIZIALE DA TURSO
// =============================================

// =============================================
// CARICAMENTO DA data.json (fallback locale)
// =============================================

// Assegna "preventivata" alle voci senza stato (dati vecchi/legacy)
function normalizzaStato(mesi) {
  for (let m = 0; m < 12; m++) {
    const lista = mesi[m];
    if (!lista) continue;
    for (const v of lista) {
      if (!v.stato) v.stato = "preventivata";
    }
  }
}

function caricaDaJson(dati) {
  // --- Spese ---
  _speseCache = {};
  if (dati.spese) {
    for (const anno of Object.keys(dati.spese)) {
      const mesi = JSON.parse(dati.spese[anno]);
      normalizzaStato(mesi);
      _speseCache[anno] = mesi;
    }
  }
  // --- Entrate ---
  _entrateCache = {};
  if (dati.entrate) {
    for (const anno of Object.keys(dati.entrate)) {
      const mesi = JSON.parse(dati.entrate[anno]);
      normalizzaStato(mesi);
      _entrateCache[anno] = mesi;
    }
  }
  // --- Categorie ---
  _categorieCache = dati.categorie
    ? JSON.parse(dati.categorie)
    : getDefaultCategorie();
  // --- Ricorrenti ---
  _ricorrentiCache = dati.ricorrenti
    ? JSON.parse(dati.ricorrenti)
    : getDefaultRicorrenti();
}

// Costruisce le 4 cache partendo dalle righe del DB (Turso o Supabase legacy).
// Formato righe: spese/entrate (id, data, descrizione, importo, stato,
// origine, visto_da_desktop, ric_id), categorie (id, tipo, descrizione),
// ricorrenti (id, tipo, descrizione, importo, giorno, data_inizio, data_fine).
function costruisciCacheDaRighe(spese, entrate, categorie, ricorrenti) {
  // --- Spese ---
  _speseCache = {};
  for (const s of spese || []) {
    const y = String(s.data).substring(0, 4);
    const m = parseInt(String(s.data).substring(5, 7)) - 1;
    if (!_speseCache[y])
      _speseCache[y] = Array.from({ length: 12 }, () => []);
    // Converti ric_id -> ricId, ignora created_at
    _speseCache[y][m].push({
      id: s.id,
      data: s.data,
      descrizione: s.descrizione,
      importo: s.importo,
      stato: s.stato,
      origine: s.origine || "desktop",
      vistoDaDesktop: Boolean(s.visto_da_desktop) || false,
      ...(s.ric_id && { ricId: s.ric_id })
    });
  }

  // --- Entrate ---
  _entrateCache = {};
  for (const e of entrate || []) {
    const y = String(e.data).substring(0, 4);
    const m = parseInt(String(e.data).substring(5, 7)) - 1;
    if (!_entrateCache[y])
      _entrateCache[y] = Array.from({ length: 12 }, () => []);
    // Converti ric_id -> ricId, ignora created_at
    _entrateCache[y][m].push({
      id: e.id,
      data: e.data,
      descrizione: e.descrizione,
      importo: e.importo,
      stato: e.stato || "preventivata",
      origine: e.origine || "desktop",
      vistoDaDesktop: Boolean(e.visto_da_desktop) || false,
      ...(e.ric_id && { ricId: e.ric_id })
    });
  }

  // --- Auto-scadenza: spese ed entrate con data passata diventano "scaduta" ---
  const oggi = new Date();
  oggi.setHours(0, 0, 0, 0);
  for (const year of Object.keys(_speseCache)) {
    for (let m = 0; m < 12; m++) {
      const lista = _speseCache[year][m];
      if (!lista) continue;
      for (const s of lista) {
        if (s.stato === "preventivata") {
          const dataSpesa = new Date(s.data + "T00:00:00");
          if (dataSpesa < oggi) {
            s.stato = "scaduta";
          }
        }
      }
    }
  }
  for (const year of Object.keys(_entrateCache)) {
    for (let m = 0; m < 12; m++) {
      const lista = _entrateCache[year][m];
      if (!lista) continue;
      for (const e of lista) {
        if (e.stato === "preventivata") {
          const dataEntrata = new Date(e.data + "T00:00:00");
          if (dataEntrata < oggi) {
            e.stato = "scaduta";
          }
        }
      }
    }
  }

  // --- Categorie ---
  _categorieCache = { entrate: [], uscite: [] };
  for (const c of categorie || []) {
    if (!_categorieCache[c.tipo]) _categorieCache[c.tipo] = [];
    _categorieCache[c.tipo].push({ id: c.id, descrizione: c.descrizione });
  }

  // --- Ricorrenti ---
  _ricorrentiCache = { entrate: [], uscite: [] };
  for (const r of ricorrenti || []) {
    if (!_ricorrentiCache[r.tipo]) _ricorrentiCache[r.tipo] = [];
    // Converti data_inizio -> dataInizio, data_fine -> dataFine
    _ricorrentiCache[r.tipo].push({
      id: r.id,
      descrizione: r.descrizione,
      importo: r.importo,
      giorno: r.giorno || 1,
      dataInizio: r.data_inizio,
      dataFine: r.data_fine
    });
  }
}

// Legge i dati da Turso e popola le cache
async function caricaDaTurso() {
  const [spese, entrate, categorie, ricorrenti] = await Promise.all([
    tursoFetchAll("SELECT * FROM spese ORDER BY data ASC"),
    tursoFetchAll("SELECT * FROM entrate ORDER BY data ASC"),
    tursoFetchAll("SELECT * FROM categorie"),
    tursoFetchAll("SELECT * FROM ricorrenti")
  ]);
  costruisciCacheDaRighe(spese, entrate, categorie, ricorrenti);
  console.log("✅ Dati caricati da Turso");
  return true;
}

// =============================================
// CREAZIONE TABELLE TURSO (idempotente)
// =============================================

async function initTurso() {
  await tursoExecute(`CREATE TABLE IF NOT EXISTS categorie (
    id TEXT PRIMARY KEY,
    tipo TEXT NOT NULL,
    descrizione TEXT NOT NULL
  )`);
  await tursoExecute(`CREATE TABLE IF NOT EXISTS ricorrenti (
    id TEXT PRIMARY KEY,
    tipo TEXT NOT NULL,
    descrizione TEXT NOT NULL,
    importo REAL NOT NULL,
    giorno INTEGER DEFAULT 1,
    data_inizio TEXT NOT NULL,
    data_fine TEXT NOT NULL
  )`);
  await tursoExecute(`CREATE TABLE IF NOT EXISTS spese (
    id TEXT PRIMARY KEY,
    data TEXT NOT NULL,
    descrizione TEXT NOT NULL,
    importo REAL NOT NULL,
    stato TEXT NOT NULL DEFAULT 'preventivata',
    origine TEXT DEFAULT 'desktop',
    visto_da_desktop INTEGER DEFAULT 0,
    ric_id TEXT
  )`);
  await tursoExecute(`CREATE TABLE IF NOT EXISTS entrate (
    id TEXT PRIMARY KEY,
    data TEXT NOT NULL,
    descrizione TEXT NOT NULL,
    importo REAL NOT NULL,
    stato TEXT NOT NULL DEFAULT 'preventivata',
    origine TEXT DEFAULT 'desktop',
    visto_da_desktop INTEGER DEFAULT 0,
    ric_id TEXT
  )`);
  await tursoExecute(`CREATE TABLE IF NOT EXISTS snapshot_storico (
    id TEXT PRIMARY KEY,
    timestamp TEXT NOT NULL,
    operazione TEXT,
    spese TEXT NOT NULL,
    entrate TEXT NOT NULL,
    categorie TEXT NOT NULL,
    ricorrenti TEXT NOT NULL,
    dati TEXT,
    created_at TEXT
  )`);
}

// =============================================
// MIGRAZIONE AUTOMATICA SUPABASE → TURSO (una sola volta)
// =============================================

const MIGRAZIONE_FLAG = "geo_turso_migrated_v1";

// true se serve eseguire la migrazione (flag assente E DB senza dati strutturali)
async function migrazioneNecessaria() {
  try {
    if (localStorage.getItem(MIGRAZIONE_FLAG) === "1") return false;
  } catch (_) {}
  try {
    // Se esistono già dati strutturali (spese, categorie o ricorrenti) la
    // migrazione è già stata completata → non rifarla (importante anche se
    // l'utente svuota manualmente le spese per ripartire da zero).
    const check = await tursoFetchAll(
      "SELECT (SELECT COUNT(*) FROM spese) AS s, (SELECT COUNT(*) FROM categorie) AS c, (SELECT COUNT(*) FROM ricorrenti) AS r"
    );
    const row = check && check[0] ? check[0] : {};
    const s = Number(row.s) || 0;
    const c = Number(row.c) || 0;
    const r = Number(row.r) || 0;
    if (s > 0 || c > 0 || r > 0) {
      segnaMigrazioneFatta();
      return false;
    }
  } catch (_) {}
  return true;
}

function segnaMigrazioneFatta() {
  try {
    localStorage.setItem(MIGRAZIONE_FLAG, "1");
  } catch (_) {}
}

// =============================================
// CARICAMENTO DA SUPABASE (SOLO migrazione legacy)
// =============================================

const SUPABASE_URL_LEGACY = "https://pxbgbzizfrojbmvvtpzc.supabase.co";
const SUPABASE_ANON_KEY_LEGACY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB4Ymdieml6ZnJvamJtdnZ0cHpjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUzMjY4NDUsImV4cCI6MjEwMDkwMjg0NX0.sybF0NAU_p-UghS0ckLSYa0yEVjT97EzJYnZ_4H9gtw";

// Helper REST verso Supabase — usato SOLO per la migrazione una tantum
async function sbLegacy(method, table, options = {}) {
  let url = `${SUPABASE_URL_LEGACY}/rest/v1/${table}`;
  const headers = {
    apikey: SUPABASE_ANON_KEY_LEGACY,
    Authorization: `Bearer ${SUPABASE_ANON_KEY_LEGACY}`,
    "Content-Type": "application/json",
    Prefer: "return=minimal"
  };

  if (options.params) {
    url += "?" + new URLSearchParams(options.params).toString();
  }

  const resp = await fetch(url, {
    method,
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(`Supabase ${method} ${table}: ${resp.status} ${text}`);
  }
  if (method === "GET") return resp.json();
  return resp;
}

// Migra: carica i dati (da Supabase come prima; se irraggiungibile da
// data.json), riempie le cache e scrive tutto su Turso
async function migraDaSupabase() {
  try {
    const [spese, entrate, categorie, ricorrenti] = await Promise.all([
      sbLegacy("GET", "spese", { params: { select: "*", order: "data.asc" } }),
      sbLegacy("GET", "entrate", { params: { select: "*", order: "data.asc" } }),
      sbLegacy("GET", "categorie", { params: { select: "*" } }),
      sbLegacy("GET", "ricorrenti", { params: { select: "*" } })
    ]);
    costruisciCacheDaRighe(spese, entrate, categorie, ricorrenti);
    console.log("✅ Dati caricati da Supabase (migrazione)");
  } catch (e) {
    // Supabase non raggiungibile (es. progetto free in pausa/evict) →
    // si usa data.json come origine per la migrazione
    console.warn("⚠️ Supabase non raggiungibile, uso data.json:", e.message);
    const resp = await fetch("/api/load");
    if (!resp.ok) throw new Error("data.json non disponibile per la migrazione");
    const dati = await resp.json();
    caricaDaJson(dati);
    console.log("✅ Dati caricati da data.json (migrazione)");
  }
  await salvaTuttoSuTurso();
  segnaMigrazioneFatta();
  console.log("✅ Migrazione Supabase → Turso completata");
  return true;
}

// =============================================
// CARICAMENTO INIZIALE (Turso + migrazione + fallback data.json)
// =============================================
// Nota: il nome è mantenuto per compatibilità con index.html; ora il
// caricamento avviene da Turso (con migrazione automatica da Supabase).

async function caricaDaSupabase() {
  try {
    await quandoTursoPronto();
    if (await migrazioneNecessaria()) {
      try {
        await migraDaSupabase();
        _cacheReady = true;
        window.dispatchEvent(new CustomEvent("dataReady"));
        return true;
      } catch (e) {
        console.warn("⚠️ Migrazione Supabase fallita:", e.message);
      }
    }
    const ok = await caricaDaTurso();
    _cacheReady = true;
    window.dispatchEvent(new CustomEvent("dataReady"));
    return ok;
  } catch (e) {
    console.warn("❌ Turso non disponibile:", e.message);
  }
  // Fallback: carica da data.json
  try {
    const resp = await fetch("/api/load");
    if (resp.ok) {
      const dati = await resp.json();
      caricaDaJson(dati);
      console.log("✅ Dati caricati da data.json (fallback)");
      _cacheReady = true;
      window.dispatchEvent(new CustomEvent("dataReady"));
      return true;
    }
  } catch (e2) {
    console.warn("Fallback data.json fallito:", e2.message);
  }
  // Fallback estremo: dati vuoti
  _speseCache = {};
  _entrateCache = {};
  _categorieCache = getDefaultCategorie();
  _ricorrentiCache = getDefaultRicorrenti();
  _cacheReady = true;
  window.dispatchEvent(new CustomEvent("dataReady"));
  return false;
}

// =============================================
// DATI DI DEFAULT (usati al primo avvio)
// =============================================

function getDefaultCategorie() {
  return {
    entrate: [
      { id: generaId("cat-e"), descrizione: "Stipendio" },
      { id: generaId("cat-e"), descrizione: "Bonus" },
      { id: generaId("cat-e"), descrizione: "Rimborso" },
      { id: generaId("cat-e"), descrizione: "Regalo" },
      { id: generaId("cat-e"), descrizione: "Affitto ricevuto" }
    ],
    uscite: [
      { id: generaId("cat-u"), descrizione: "Affitto" },
      { id: generaId("cat-u"), descrizione: "Supermercato" },
      { id: generaId("cat-u"), descrizione: "Bolletta luce" },
      { id: generaId("cat-u"), descrizione: "Internet" },
      { id: generaId("cat-u"), descrizione: "Trasporti" },
      { id: generaId("cat-u"), descrizione: "Ristorante" },
      { id: generaId("cat-u"), descrizione: "Palestra" },
      { id: generaId("cat-u"), descrizione: "Assicurazione" },
      { id: generaId("cat-u"), descrizione: "Cellulare" },
      { id: generaId("cat-u"), descrizione: "Vestiti" }
    ]
  };
}

function getDefaultRicorrenti() {
  return {
    entrate: [
      {
        id: generaId("ric-e"),
        descrizione: "Stipendio",
        importo: 2500,
        giorno: 1,
        dataInizio: "2026-01",
        dataFine: "2026-12"
      },
      {
        id: generaId("ric-e"),
        descrizione: "Bonus",
        importo: 500,
        giorno: 1,
        dataInizio: "2026-03",
        dataFine: "2026-12"
      }
    ],
    uscite: [
      {
        id: generaId("ric-u"),
        descrizione: "Affitto",
        importo: 800,
        giorno: 1,
        dataInizio: "2026-01",
        dataFine: "2026-12"
      },
      {
        id: generaId("ric-u"),
        descrizione: "Internet",
        importo: 40,
        giorno: 1,
        dataInizio: "2026-01",
        dataFine: "2026-12"
      },
      {
        id: generaId("ric-u"),
        descrizione: "Assicurazione",
        importo: 120,
        giorno: 1,
        dataInizio: "2026-01",
        dataFine: "2026-12"
      }
    ]
  };
}

// =============================================
// GESTIONE ANNO CORRENTE
// =============================================

let _currentYear = 2026;

function getCurrentYear() {
  return _currentYear;
}

function setCurrentYear(year) {
  _currentYear = year;
}

// =============================================
// GESTIONE SPESE
// =============================================

function getSpese(year) {
  if (_speseCache[year]) return _speseCache[year];
  // Cache non ancora pronta — restituisci array vuoti
  return Array.from({ length: 12 }, () => []);
}

async function saveSpese(year, mesi) {
  _speseCache[year] = mesi;
  await salvaSnapshot("spese");
  await syncSpeseTurso(year, mesi);
}

function getSpeseMese(year, monthIdx) {
  const all = getSpese(year);
  return all[monthIdx] || [];
}

async function addSpesa(year, monthIdx, spesa) {
  const all = getSpese(year);
  if (!all[monthIdx]) all[monthIdx] = [];
  all[monthIdx].push(spesa);
  await saveSpese(year, all);
}

async function updateSpesa(year, monthIdx, expenseId, updates) {
  const all = getSpese(year);
  if (!all[monthIdx]) return false;
  const idx = all[monthIdx].findIndex((s) => s.id === expenseId);
  if (idx === -1) return false;
  all[monthIdx][idx] = { ...all[monthIdx][idx], ...updates };
  await saveSpese(year, all);
  return true;
}

async function deleteSpesa(year, monthIdx, expenseId) {
  const all = getSpese(year);
  if (!all[monthIdx]) return false;
  const idx = all[monthIdx].findIndex((s) => s.id === expenseId);
  if (idx === -1) return false;
  all[monthIdx].splice(idx, 1);
  await saveSpese(year, all);
  return true;
}

async function moveSpesa(expenseId, fromYear, fromMonth, toYear, toMonth) {
  const fromAll = getSpese(fromYear);
  const toAll = toYear === fromYear ? fromAll : getSpese(toYear);

  if (!fromAll[fromMonth]) return false;
  const idx = fromAll[fromMonth].findIndex((s) => s.id === expenseId);
  if (idx === -1) return false;

  const expense = fromAll[fromMonth].splice(idx, 1)[0];
  await saveSpese(fromYear, fromAll);

  // Aggiorna la data al mese di destinazione
  const day = 15;
  expense.data = `${toYear}-${String(toMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

  if (!toAll[toMonth]) toAll[toMonth] = [];
  toAll[toMonth].push(expense);

  if (toYear !== fromYear) {
    await saveSpese(toYear, toAll);
  }
  return true;
}

// =============================================
// GESTIONE ENTRATE
// =============================================

function getEntrate(year) {
  if (_entrateCache[year]) return _entrateCache[year];
  return Array.from({ length: 12 }, () => []);
}

async function saveEntrate(year, mesi) {
  _entrateCache[year] = mesi;
  await salvaSnapshot("entrate");
  await syncEntrateTurso(year, mesi);
}

function getEntrateMese(year, monthIdx) {
  const all = getEntrate(year);
  return all[monthIdx] || [];
}

async function addEntrata(year, monthIdx, entrata) {
  const all = getEntrate(year);
  if (!all[monthIdx]) all[monthIdx] = [];
  all[monthIdx].push(entrata);
  await saveEntrate(year, all);
}

async function updateEntrata(year, monthIdx, entrataId, updates) {
  const all = getEntrate(year);
  if (!all[monthIdx]) return false;
  const idx = all[monthIdx].findIndex((e) => e.id === entrataId);
  if (idx === -1) return false;
  all[monthIdx][idx] = { ...all[monthIdx][idx], ...updates };
  await saveEntrate(year, all);
  return true;
}

async function deleteEntrata(year, monthIdx, entrataId) {
  const all = getEntrate(year);
  if (!all[monthIdx]) return false;
  const idx = all[monthIdx].findIndex((e) => e.id === entrataId);
  if (idx === -1) return false;
  all[monthIdx].splice(idx, 1);
  await saveEntrate(year, all);
  return true;
}

async function moveEntrata(entrataId, fromYear, fromMonth, toYear, toMonth) {
  const fromAll = getEntrate(fromYear);
  const toAll = toYear === fromYear ? fromAll : getEntrate(toYear);

  if (!fromAll[fromMonth]) return false;
  const idx = fromAll[fromMonth].findIndex((e) => e.id === entrataId);
  if (idx === -1) return false;

  const entrata = fromAll[fromMonth].splice(idx, 1)[0];
  await saveEntrate(fromYear, fromAll);

  // Aggiorna la data al mese di destinazione
  const day = 15;
  entrata.data = `${toYear}-${String(toMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

  if (!toAll[toMonth]) toAll[toMonth] = [];
  toAll[toMonth].push(entrata);

  if (toYear !== fromYear) {
    await saveEntrate(toYear, toAll);
  }
  return true;
}

// =============================================
// GESTIONE CATEGORIE
// =============================================

function popolaSelectCategorie(selectId, tipo) {
  const select = document.getElementById(selectId);
  if (!select) return;
  const cat = getCategorie();
  const items = cat[tipo] || [];
  select.innerHTML = '<option value="">Seleziona una categoria...</option>';
  items.sort((a, b) => a.descrizione.localeCompare(b.descrizione, "it"));
  items.forEach((c) => {
    const opt = document.createElement("option");
    opt.value = c.descrizione;
    opt.textContent = c.descrizione;
    select.appendChild(opt);
  });
}

function getCategorie() {
  if (_cacheReady && _categorieCache) {
    return _categorieCache;
  }
  // Fallback finché Turso non carica
  return getDefaultCategorie();
}

async function saveCategorie(cat) {
  _categorieCache = cat;
  await salvaSnapshot("categorie");
  await syncCategorieTurso(cat);
}

async function addCategoria(tipo, descrizione) {
  const cat = getCategorie();
  cat[tipo].push({
    id: generaId("cat-" + (tipo === "entrate" ? "e" : "u")),
    descrizione
  });
  await saveCategorie(cat);
  return cat;
}

async function updateCategoria(tipo, idx, descrizione) {
  const cat = getCategorie();
  if (cat[tipo][idx]) {
    cat[tipo][idx].descrizione = descrizione;
    await saveCategorie(cat);
  }
  return cat;
}

async function deleteCategoria(tipo, idx) {
  const cat = getCategorie();
  cat[tipo].splice(idx, 1);
  await saveCategorie(cat);
  return cat;
}

// =============================================
// GESTIONE RICORRENTI (PROGRAMMAZIONE)
// =============================================

function getRicorrenti() {
  if (_cacheReady && _ricorrentiCache) {
    return _ricorrentiCache;
  }
  // Fallback finché Turso non carica
  return getDefaultRicorrenti();
}

async function saveRicorrenti(ric) {
  _ricorrentiCache = ric;
  await salvaSnapshot("ricorrenti");
  await syncRicorrentiTurso(ric);
}

async function addRicorrente(tipo, ricorrente) {
  const ric = getRicorrenti();
  ric[tipo].push(ricorrente);
  await saveRicorrenti(ric);
  return ric;
}

async function updateRicorrente(tipo, idx, data) {
  const ric = getRicorrenti();
  if (ric[tipo][idx]) {
    ric[tipo][idx] = { ...ric[tipo][idx], ...data };
    await saveRicorrenti(ric);
  }
  return ric;
}

async function deleteRicorrente(tipo, idx) {
  const ric = getRicorrenti();
  ric[tipo].splice(idx, 1);
  await saveRicorrenti(ric);
  return ric;
}

/**
 * Calcola il giorno valido per un mese: se il giorno richiesto supera
 * il numero massimo di giorni del mese, scala all'indietro all'ultimo
 * giorno valido (es. 31 → 30 per aprile, 31 → 28/29 per febbraio).
 */
function calcolaDataFineMese(year, month, giorno) {
  const lastDay = new Date(year, month + 1, 0).getDate();
  const day = Math.min(giorno, lastDay);
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/**
 * Applica i ricorrenti a tutti gli anni coperti (tra dataInizio e dataFine),
 * creando/aggiornando spese/entrate. Prima rimuove TUTTE le vecchie
 * spese/entrate collegate a ricorrenti (ricId), poi rigenera tutto da capo.
 * Accumula le modifiche e le salva su Turso in un'unica chiamata per tipo,
 * per evitare race condition e sync multipli.
 */
async function applicaRicorrenti(anno) {
  const ric = getRicorrenti();

  // Range di anni coperto dai ricorrenti (tra dataInizio e dataFine),
  // partendo dall'anno passato per sicurezza
  let minYear = anno;
  let maxYear = anno;
  for (const tipo of ["entrate", "uscite"]) {
    for (const r of ric[tipo]) {
      const inizio = new Date(r.dataInizio + "-01T00:00:00");
      const fine = new Date(r.dataFine + "-01T00:00:00");
      minYear = Math.min(minYear, inizio.getFullYear());
      maxYear = Math.max(maxYear, fine.getFullYear());
    }
  }

  // Per ogni anno nel range: rimuovi vecchie voci ricorrenti e rigenera
  for (let year = minYear; year <= maxYear; year++) {
    const speseAggiornate = getSpese(year);
    const entrateAggiornate = getEntrate(year);

    // Mese di partenza: sempre dal primo mese dell'anno
    const meseMin = 0;

    // --- Rimuovi vecchie voci collegate a ricorrenti (solo se non eseguite) ---
    for (let m = meseMin; m < 12; m++) {
      if (speseAggiornate[m]) {
        speseAggiornate[m] = speseAggiornate[m].filter(
          (s) => !s.ricId || s.stato === "eseguita"
        );
      }
      if (entrateAggiornate[m]) {
        entrateAggiornate[m] = entrateAggiornate[m].filter(
          (e) => !e.ricId || e.stato === "eseguita"
        );
      }
    }

    // --- Rigenera da capo per questo anno ---
    for (const tipo of ["entrate", "uscite"]) {
      for (const r of ric[tipo]) {
        const giorno = r.giorno || 1;
        const inizio = new Date(r.dataInizio + "-01T00:00:00");
        const fine = new Date(r.dataFine + "-01T00:00:00");
        const firstMonth = Math.max(
          inizio.getFullYear() === year ? inizio.getMonth() : 0,
          meseMin
        );
        const lastMonth = fine.getFullYear() === year ? fine.getMonth() : 11;

        for (let m = firstMonth; m <= lastMonth; m++) {
          const meseDate = new Date(year, m, 1);
          if (meseDate < inizio || meseDate > fine) continue;
          const dataStr = calcolaDataFineMese(year, m, giorno);

          if (tipo === "uscite") {
            if (!speseAggiornate[m]) speseAggiornate[m] = [];
            speseAggiornate[m].push({
              id: generaId("spesa"),
              data: dataStr,
              descrizione: r.descrizione,
              importo: r.importo,
              stato: "preventivata",
              ricId: r.id
            });
          } else {
            if (!entrateAggiornate[m]) entrateAggiornate[m] = [];
            entrateAggiornate[m].push({
              id: generaId("entrata"),
              data: dataStr,
              descrizione: r.descrizione,
              importo: r.importo,
              stato: "preventivata",
              ricId: r.id
            });
          }
        }
      }
    }

    // Salvataggio per anno su Turso
    await saveSpese(year, speseAggiornate);
    await saveEntrate(year, entrateAggiornate);
  }
}

// =============================================
// SYNC TURSO (DELETE + INSERT con SQL)
// =============================================

const INSERT_SPESE_SQL = `INSERT INTO spese
  (id, data, descrizione, importo, stato, origine, visto_da_desktop, ric_id)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;

const INSERT_ENTRATE_SQL = `INSERT INTO entrate
  (id, data, descrizione, importo, stato, origine, visto_da_desktop, ric_id)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;

async function syncSpeseTurso(year, mesi) {
  try {
    const stmts = [
      {
        sql: "DELETE FROM spese WHERE data >= ? AND data <= ?",
        args: [`${year}-01-01`, `${year}-12-31`]
      }
    ];
    // Reinserisce quelle correnti
    for (let m = 0; m < 12; m++) {
      for (const s of mesi[m] || []) {
        stmts.push({
          sql: INSERT_SPESE_SQL,
          args: [
            s.id,
            s.data,
            s.descrizione,
            s.importo,
            s.stato || "preventivata",
            s.origine || "desktop",
            s.vistoDaDesktop ? 1 : 0,
            s.ricId || null
          ]
        });
      }
    }
    await tursoBatch(stmts);
  } catch (e) {
    console.warn("Sync spese fallito:", e.message);
  }
}

async function syncEntrateTurso(year, mesi) {
  try {
    const stmts = [
      {
        sql: "DELETE FROM entrate WHERE data >= ? AND data <= ?",
        args: [`${year}-01-01`, `${year}-12-31`]
      }
    ];
    // Reinserisce quelle correnti
    for (let m = 0; m < 12; m++) {
      for (const e of mesi[m] || []) {
        stmts.push({
          sql: INSERT_ENTRATE_SQL,
          args: [
            e.id,
            e.data,
            e.descrizione,
            e.importo,
            e.stato || "preventivata",
            e.origine || "desktop",
            e.vistoDaDesktop ? 1 : 0,
            e.ricId || null
          ]
        });
      }
    }
    await tursoBatch(stmts);
  } catch (e) {
    console.warn("Sync entrate fallito:", e.message);
  }
}

async function syncCategorieTurso(cat) {
  try {
    const stmts = [{ sql: "DELETE FROM categorie" }];
    // Reinserisce quelle correnti con campo tipo
    for (const c of cat.entrate || []) {
      stmts.push({
        sql: "INSERT INTO categorie (id, tipo, descrizione) VALUES (?, ?, ?)",
        args: [c.id, "entrate", c.descrizione]
      });
    }
    for (const c of cat.uscite || []) {
      stmts.push({
        sql: "INSERT INTO categorie (id, tipo, descrizione) VALUES (?, ?, ?)",
        args: [c.id, "uscite", c.descrizione]
      });
    }
    await tursoBatch(stmts);
  } catch (e) {
    console.warn("Sync categorie fallito:", e.message);
  }
}

async function syncRicorrentiTurso(ric) {
  try {
    const stmts = [{ sql: "DELETE FROM ricorrenti" }];
    // Reinserisce quelli correnti
    for (const r of ric.entrate || []) {
      stmts.push({
        sql: "INSERT INTO ricorrenti (id, tipo, descrizione, importo, giorno, data_inizio, data_fine) VALUES (?, ?, ?, ?, ?, ?, ?)",
        args: [
          r.id,
          "entrate",
          r.descrizione,
          r.importo,
          r.giorno || 1,
          r.dataInizio,
          r.dataFine
        ]
      });
    }
    for (const r of ric.uscite || []) {
      stmts.push({
        sql: "INSERT INTO ricorrenti (id, tipo, descrizione, importo, giorno, data_inizio, data_fine) VALUES (?, ?, ?, ?, ?, ?, ?)",
        args: [
          r.id,
          "uscite",
          r.descrizione,
          r.importo,
          r.giorno || 1,
          r.dataInizio,
          r.dataFine
        ]
      });
    }
    await tursoBatch(stmts);
  } catch (e) {
    console.warn("Sync ricorrenti fallito:", e.message);
  }
}

// =============================================
// SCRITTURA COMPLETA SU TURSO
// =============================================

/**
 * Scrive TUTTE le cache su Turso (DELETE + INSERT completo).
 * Usato dalla migrazione una tantum e da ripristinaSnapshot.
 */
async function salvaTuttoSuTurso() {
  await tursoExecute("DELETE FROM spese");
  await tursoExecute("DELETE FROM entrate");
  await tursoExecute("DELETE FROM categorie");
  await tursoExecute("DELETE FROM ricorrenti");

  for (const anno of Object.keys(_speseCache)) {
    await syncSpeseTurso(anno, _speseCache[anno]);
  }
  for (const anno of Object.keys(_entrateCache)) {
    await syncEntrateTurso(anno, _entrateCache[anno]);
  }
  await syncCategorieTurso(_categorieCache);
  await syncRicorrentiTurso(_ricorrentiCache);
}

/**
 * Elimina da Turso le voci con gli id indicati (spese ed entrate).
 * Usato dalla pagina Impostazioni per la cancellazione mirata.
 */
async function tursoDeleteByIds(idsSpese, idsEntrate) {
  if (idsSpese && idsSpese.size > 0) {
    const ids = [...idsSpese];
    await tursoExecute(
      `DELETE FROM spese WHERE id IN (${ids.map(() => "?").join(",")})`,
      ids
    );
  }
  if (idsEntrate && idsEntrate.size > 0) {
    const ids = [...idsEntrate];
    await tursoExecute(
      `DELETE FROM entrate WHERE id IN (${ids.map(() => "?").join(",")})`,
      ids
    );
  }
}

// =============================================
// SNAPSHOT STORICO (backup automatici)
// =============================================

// Numero massimo di snapshot da mantenere (i più recenti)
const MAX_SNAPSHOTS = 10;

/**
 * Salva uno snapshot completo dei dati correnti (spese, entrate, categorie,
 * ricorrenti) nella tabella snapshot_storico, poi elimina quelli oltre i
 * MAX_SNAPSHOTS più recenti (per data di creazione).
 */
async function salvaSnapshot(op) {
  console.log("Snapshot salvato:", op || "modifica");
  try {
    const timestamp = new Date().toISOString();
    const spese = JSON.stringify(_speseCache);
    const entrate = JSON.stringify(_entrateCache);
    const categorie = JSON.stringify(_categorieCache);
    const ricorrenti = JSON.stringify(_ricorrentiCache);
    const dati = JSON.stringify({
      spese: _speseCache,
      entrate: _entrateCache,
      categorie: _categorieCache,
      ricorrenti: _ricorrentiCache
    });

    await tursoExecute(
      `INSERT INTO snapshot_storico
        (id, timestamp, operazione, spese, entrate, categorie, ricorrenti, dati, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        generaId("snap"),
        timestamp,
        op || "modifica",
        spese,
        entrate,
        categorie,
        ricorrenti,
        dati,
        timestamp
      ]
    );

    // Mantiene solo i MAX_SNAPSHOTS più recenti
    try {
      const tutti = await tursoFetchAll(
        "SELECT id FROM snapshot_storico ORDER BY timestamp DESC"
      );
      const daEliminare = (tutti || []).slice(MAX_SNAPSHOTS);
      for (const s of daEliminare) {
        await tursoExecute("DELETE FROM snapshot_storico WHERE id = ?", [
          s.id
        ]);
      }
    } catch (_) {}
  } catch (e) {
    console.warn("salvaSnapshot fallito:", e.message);
  }
}

/**
 * Recupera la lista degli snapshot più recenti (max MAX_SNAPSHOTS), ordinati per data.
 */
async function getSnapshotList() {
  try {
    return await tursoFetchAll(
      "SELECT * FROM snapshot_storico ORDER BY timestamp DESC LIMIT ?",
      [MAX_SNAPSHOTS]
    );
  } catch (e) {
    console.warn("getSnapshotList fallito:", e.message);
    return [];
  }
}

/**
 * Ripristina uno snapshot: sovrascrive le 4 cache in memoria e riscrive
 * tutto su Turso tramite le sync.
 */
async function ripristinaSnapshot(id) {
  try {
    const rows = await tursoFetchAll(
      "SELECT * FROM snapshot_storico WHERE id = ?",
      [id]
    );
    if (!rows || rows.length === 0) return false;

    const snap = rows[0];
    _speseCache = JSON.parse(snap.spese);
    _entrateCache = JSON.parse(snap.entrate);
    _categorieCache = JSON.parse(snap.categorie);
    _ricorrentiCache = JSON.parse(snap.ricorrenti);
    _cacheReady = true;

    // Riscrive tutto su Turso
    await salvaTuttoSuTurso();

    window.dispatchEvent(new CustomEvent("dataReady"));
    return true;
  } catch (e) {
    console.warn("ripristinaSnapshot fallito:", e.message);
    return false;
  }
}

// =============================================
// VOCI MOBILE (inserite dall'app Android)
// =============================================

/**
 * Recupera le voci inserite dal cellulare (origine='mobile') non ancora
 * mostrate al desktop (visto_da_desktop=false). Ritorna una lista ordinata.
 */
async function getVociMobileNonViste() {
  try {
    await quandoTursoPronto();
    const [spese, entrate] = await Promise.all([
      tursoFetchAll(
        `SELECT id, data, descrizione, importo, ric_id
         FROM spese WHERE origine = 'mobile' AND visto_da_desktop = 0
         ORDER BY data ASC`
      ),
      tursoFetchAll(
        `SELECT id, data, descrizione, importo, ric_id
         FROM entrate WHERE origine = 'mobile' AND visto_da_desktop = 0
         ORDER BY data ASC`
      )
    ]);
    const voci = [];
    for (const s of spese) {
      voci.push({
        id: s.id,
        tipo: "uscita",
        data: s.data,
        descrizione: s.descrizione,
        importo: s.importo,
        ric_id: s.ric_id || null
      });
    }
    for (const e of entrate) {
      voci.push({
        id: e.id,
        tipo: "entrata",
        data: e.data,
        descrizione: e.descrizione,
        importo: e.importo,
        ric_id: e.ric_id || null
      });
    }
    voci.sort((a, b) => String(a.data).localeCompare(String(b.data)));
    return voci;
  } catch (e) {
    console.warn("Errore getVociMobileNonViste:", e.message);
    return [];
  }
}

/**
 * Segna come viste dal desktop le voci mobile indicate
 * (imposta visto_da_desktop = 1). Da chiamare dopo la chiusura del modale.
 */
async function segnaVociMobileComeViste(ids) {
  if (!ids || ids.length === 0) return;
  await quandoTursoPronto();
  const idList = [...new Set(ids)];
  const placeholders = idList.map(() => "?").join(",");
  try {
    await tursoExecute(
      `UPDATE spese SET visto_da_desktop = 1
       WHERE origine = 'mobile' AND visto_da_desktop = 0 AND id IN (${placeholders})`,
      idList
    );
    await tursoExecute(
      `UPDATE entrate SET visto_da_desktop = 1
       WHERE origine = 'mobile' AND visto_da_desktop = 0 AND id IN (${placeholders})`,
      idList
    );
    // Aggiorna anche la cache in memoria: se dopo un salvataggio dell'anno le
    // voci vengono risincronizzate (DELETE+INSERT), non devono tornare "non
    // viste" (altrimenti il modale "Nuove voci dal cellulare" ricompare).
    const visti = new Set(idList);
    for (const year of Object.keys(_speseCache)) {
      for (let m = 0; m < 12; m++) {
        for (const s of _speseCache[year][m] || []) {
          if (visti.has(s.id)) s.vistoDaDesktop = true;
        }
      }
    }
    for (const year of Object.keys(_entrateCache)) {
      for (let m = 0; m < 12; m++) {
        for (const e of _entrateCache[year][m] || []) {
          if (visti.has(e.id)) e.vistoDaDesktop = true;
        }
      }
    }
  } catch (e) {
    console.warn("Errore segnaVociMobileComeViste:", e.message);
  }
}

// =============================================
// INIT — Carica da Turso all'avvio
// =============================================

caricaDaSupabase();

// Rimuovi chiavi localStorage obsolete (dati vecchi, non più usati)
try {
  for (let y = 2020; y <= 2040; y++) {
    localStorage.removeItem("geo_spese_" + y);
    localStorage.removeItem("geo_entrate_" + y);
  }
  localStorage.removeItem("geo_categorie");
  localStorage.removeItem("geo_ricorrenti");
  localStorage.removeItem("geo_data_version");
} catch (_) {}
