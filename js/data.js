/* =============================================
   DATA LAYER — Supabase + localStorage cache
   =============================================
   I dati vengono letti/scritti su Supabase.
   localStorage funge da cache di backup veloce.
   ============================================= */

const STORAGE_KEY_SPESE = "geo_spese";
const STORAGE_KEY_ENTRATE = "geo_entrate";
const STORAGE_KEY_CATEGORIE = "geo_categorie";
const STORAGE_KEY_RICORRENTI = "geo_ricorrenti";
const STORAGE_KEY_YEAR = "geo_current_year";
const STORAGE_KEY_VERSION = "geo_data_version";
const DATA_VERSION = 3;

const DATA_RIFERIMENTO = new Date(2026, 6, 26);

// =============================================
// SUPABASE CONFIG
// =============================================
const SUPABASE_URL = "https://pxbgbzizfrojbmvvtpzc.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB4Ymdieml6ZnJvamJtdnZ0cHpjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUzMjY4NDUsImV4cCI6MjEwMDkwMjg0NX0.sybF0NAU_p-UghS0ckLSYa0yEVjT97EzJYnZ_4H9gtw";

// =============================================
// SUPABASE REST HELPER
// =============================================

async function sb(method, table, options = {}) {
  let url = `${SUPABASE_URL}/rest/v1/${table}`;
  const headers = {
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    "Content-Type": "application/json",
    Prefer: "return=minimal"
  };

  if (options.params) {
    url += "?" + new URLSearchParams(options.params).toString();
  }

  const resp = await fetch(url, { method, headers, body: options.body ? JSON.stringify(options.body) : undefined });
  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(`Supabase ${method} ${table}: ${resp.status} ${text}`);
  }
  if (method === "GET") return resp.json();
  return resp;
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
// CARICAMENTO INIZIALE DA SUPABASE
// =============================================

async function caricaDaSupabase() {
  try {
    const [spese, entrate, categorie, ricorrenti] = await Promise.all([
      sb("GET", "spese", { params: { select: "*", order: "data.asc" } }),
      sb("GET", "entrate", { params: { select: "*", order: "data.asc" } }),
      sb("GET", "categorie", { params: { select: "*" } }),
      sb("GET", "ricorrenti", { params: { select: "*" } })
    ]);

    // --- Spese ---
    _speseCache = {};
    for (const s of spese) {
      const y = s.data.substring(0, 4);
      const m = parseInt(s.data.substring(5, 7)) - 1;
      if (!_speseCache[y]) _speseCache[y] = Array.from({ length: 12 }, () => []);
      // Converti ric_id -> ricId, rimuovi created_at
      _speseCache[y][m].push({
        id: s.id, data: s.data, descrizione: s.descrizione,
        importo: s.importo, stato: s.stato,
        ...(s.ric_id && { ricId: s.ric_id })
      });
    }

    // --- Entrate ---
    _entrateCache = {};
    for (const e of entrate) {
      const y = e.data.substring(0, 4);
      const m = parseInt(e.data.substring(5, 7)) - 1;
      if (!_entrateCache[y]) _entrateCache[y] = Array.from({ length: 12 }, () => []);
      // Converti ric_id -> ricId, rimuovi created_at
      _entrateCache[y][m].push({
        id: e.id, data: e.data, descrizione: e.descrizione,
        importo: e.importo,
        ...(e.ric_id && { ricId: e.ric_id })
      });
    }

    // --- Categorie ---
    _categorieCache = { entrate: [], uscite: [] };
    for (const c of categorie) {
      if (!_categorieCache[c.tipo]) _categorieCache[c.tipo] = [];
      _categorieCache[c.tipo].push({ id: c.id, descrizione: c.descrizione });
    }

    // --- Ricorrenti ---
    _ricorrentiCache = { entrate: [], uscite: [] };
    for (const r of ricorrenti) {
      if (!_ricorrentiCache[r.tipo]) _ricorrentiCache[r.tipo] = [];
      // Converti data_inizio -> dataInizio, data_fine -> dataFine
      _ricorrentiCache[r.tipo].push({
        id: r.id, descrizione: r.descrizione, importo: r.importo,
        dataInizio: r.data_inizio, dataFine: r.data_fine
      });
    }

    _cacheReady = true;

    // Sincronizza in localStorage come backup
    for (const [year, mesi] of Object.entries(_speseCache)) {
      localStorage.setItem(getSpeseKey(year), JSON.stringify(mesi));
    }
    for (const [year, mesi] of Object.entries(_entrateCache)) {
      localStorage.setItem(getEntrateKey(year), JSON.stringify(mesi));
    }
    if (_categorieCache) localStorage.setItem(STORAGE_KEY_CATEGORIE, JSON.stringify(_categorieCache));
    if (_ricorrentiCache) localStorage.setItem(STORAGE_KEY_RICORRENTI, JSON.stringify(_ricorrentiCache));

    console.log("✅ Dati caricati da Supabase");
    window.dispatchEvent(new CustomEvent("dataReady"));
    return true;
  } catch (e) {
    console.warn("📁 Supabase non disponibile — uso localStorage:", e.message);
    window.dispatchEvent(new CustomEvent("dataReady"));
    return false;
  }
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
        dataInizio: "2026-01",
        dataFine: "2026-12"
      },
      {
        id: generaId("ric-e"),
        descrizione: "Bonus",
        importo: 500,
        dataInizio: "2026-03",
        dataFine: "2026-12"
      }
    ],
    uscite: [
      {
        id: generaId("ric-u"),
        descrizione: "Affitto",
        importo: 800,
        dataInizio: "2026-01",
        dataFine: "2026-12"
      },
      {
        id: generaId("ric-u"),
        descrizione: "Internet",
        importo: 40,
        dataInizio: "2026-01",
        dataFine: "2026-12"
      },
      {
        id: generaId("ric-u"),
        descrizione: "Assicurazione",
        importo: 120,
        dataInizio: "2026-01",
        dataFine: "2026-12"
      }
    ]
  };
}

function generaSpeseDefault(meseIndex, year) {
  return [];
}

function generaEntrateDefault(meseIndex, year) {
  return [];
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

// Forza pulizia dati vecchi se versione cambiata
function checkDataVersion() {
  const saved = parseInt(localStorage.getItem(STORAGE_KEY_VERSION)) || 0;
  if (saved !== DATA_VERSION) {
    for (let y = 2020; y <= 2040; y++) {
      localStorage.removeItem(getSpeseKey(y));
      localStorage.removeItem(getEntrateKey(y));
    }
    localStorage.setItem(STORAGE_KEY_VERSION, DATA_VERSION);
  }
}

// =============================================
// GESTIONE SPESE
// =============================================

function getSpeseKey(year) {
  return STORAGE_KEY_SPESE + "_" + year;
}

function getSpese(year) {
  checkDataVersion();

  // Se cache caricata, usala
  if (_cacheReady && _speseCache[year]) {
    return _speseCache[year];
  }

  // Altrimenti localStorage
  const key = getSpeseKey(year);
  let data = localStorage.getItem(key);
  if (!data) {
    const mesi = Array.from({ length: 12 }, (_, i) => generaSpeseDefault(i, year));
    data = JSON.stringify(mesi);
    localStorage.setItem(key, data);
  }
  return JSON.parse(data);
}

function saveSpese(year, mesi) {
  localStorage.setItem(getSpeseKey(year), JSON.stringify(mesi));
  _speseCache[year] = mesi;
  syncSpeseSupabase(year, mesi);
}

function getSpeseMese(year, monthIdx) {
  const all = getSpese(year);
  return all[monthIdx] || [];
}

function addSpesa(year, monthIdx, spesa) {
  const all = getSpese(year);
  if (!all[monthIdx]) all[monthIdx] = [];
  all[monthIdx].push(spesa);
  saveSpese(year, all);
}

function updateSpesa(year, monthIdx, expenseId, updates) {
  const all = getSpese(year);
  if (!all[monthIdx]) return false;
  const idx = all[monthIdx].findIndex((s) => s.id === expenseId);
  if (idx === -1) return false;
  all[monthIdx][idx] = { ...all[monthIdx][idx], ...updates };
  saveSpese(year, all);
  return true;
}

function deleteSpesa(year, monthIdx, expenseId) {
  const all = getSpese(year);
  if (!all[monthIdx]) return false;
  const idx = all[monthIdx].findIndex((s) => s.id === expenseId);
  if (idx === -1) return false;
  all[monthIdx].splice(idx, 1);
  saveSpese(year, all);
  return true;
}

function moveSpesa(expenseId, fromYear, fromMonth, toYear, toMonth) {
  const fromAll = getSpese(fromYear);
  const toAll = toYear === fromYear ? fromAll : getSpese(toYear);

  if (!fromAll[fromMonth]) return false;
  const idx = fromAll[fromMonth].findIndex((s) => s.id === expenseId);
  if (idx === -1) return false;

  const expense = fromAll[fromMonth].splice(idx, 1)[0];
  saveSpese(fromYear, fromAll);

  // Aggiorna la data al mese di destinazione
  const day = 15;
  expense.data = `${toYear}-${String(toMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

  if (!toAll[toMonth]) toAll[toMonth] = [];
  toAll[toMonth].push(expense);

  if (toYear !== fromYear) {
    saveSpese(toYear, toAll);
  }
  return true;
}

// =============================================
// GESTIONE ENTRATE
// =============================================

function getEntrateKey(year) {
  return STORAGE_KEY_ENTRATE + "_" + year;
}

function getEntrate(year) {
  if (_cacheReady && _entrateCache[year]) {
    return _entrateCache[year];
  }

  const key = getEntrateKey(year);
  let data = localStorage.getItem(key);
  if (!data) {
    const mesi = Array.from({ length: 12 }, (_, i) => generaEntrateDefault(i, year));
    data = JSON.stringify(mesi);
    localStorage.setItem(key, data);
  }
  return JSON.parse(data);
}

function saveEntrate(year, mesi) {
  localStorage.setItem(getEntrateKey(year), JSON.stringify(mesi));
  _entrateCache[year] = mesi;
  syncEntrateSupabase(year, mesi);
}

function getEntrateMese(year, monthIdx) {
  const all = getEntrate(year);
  return all[monthIdx] || [];
}

function addEntrata(year, monthIdx, entrata) {
  const all = getEntrate(year);
  if (!all[monthIdx]) all[monthIdx] = [];
  all[monthIdx].push(entrata);
  saveEntrate(year, all);
}

function updateEntrata(year, monthIdx, entrataId, updates) {
  const all = getEntrate(year);
  if (!all[monthIdx]) return false;
  const idx = all[monthIdx].findIndex((e) => e.id === entrataId);
  if (idx === -1) return false;
  all[monthIdx][idx] = { ...all[monthIdx][idx], ...updates };
  saveEntrate(year, all);
  return true;
}

function deleteEntrata(year, monthIdx, entrataId) {
  const all = getEntrate(year);
  if (!all[monthIdx]) return false;
  const idx = all[monthIdx].findIndex((e) => e.id === entrataId);
  if (idx === -1) return false;
  all[monthIdx].splice(idx, 1);
  saveEntrate(year, all);
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

  let data = localStorage.getItem(STORAGE_KEY_CATEGORIE);
  if (!data) {
    data = JSON.stringify(getDefaultCategorie());
    localStorage.setItem(STORAGE_KEY_CATEGORIE, data);
  }
  return JSON.parse(data);
}

function saveCategorie(cat) {
  localStorage.setItem(STORAGE_KEY_CATEGORIE, JSON.stringify(cat));
  _categorieCache = cat;
  syncCategorieSupabase(cat);
}

function addCategoria(tipo, descrizione) {
  const cat = getCategorie();
  cat[tipo].push({
    id: generaId("cat-" + (tipo === "entrate" ? "e" : "u")),
    descrizione
  });
  saveCategorie(cat);
  return cat;
}

function updateCategoria(tipo, idx, descrizione) {
  const cat = getCategorie();
  if (cat[tipo][idx]) {
    cat[tipo][idx].descrizione = descrizione;
    saveCategorie(cat);
  }
  return cat;
}

function deleteCategoria(tipo, idx) {
  const cat = getCategorie();
  cat[tipo].splice(idx, 1);
  saveCategorie(cat);
  return cat;
}

// =============================================
// GESTIONE RICORRENTI (PROGRAMMAZIONE)
// =============================================

function getRicorrenti() {
  if (_cacheReady && _ricorrentiCache) {
    return _ricorrentiCache;
  }

  let data = localStorage.getItem(STORAGE_KEY_RICORRENTI);
  if (!data) {
    data = JSON.stringify(getDefaultRicorrenti());
    localStorage.setItem(STORAGE_KEY_RICORRENTI, data);
  }
  return JSON.parse(data);
}

function saveRicorrenti(ric) {
  localStorage.setItem(STORAGE_KEY_RICORRENTI, JSON.stringify(ric));
  _ricorrentiCache = ric;
  syncRicorrentiSupabase(ric);
}

function addRicorrente(tipo, ricorrente) {
  const ric = getRicorrenti();
  ric[tipo].push(ricorrente);
  saveRicorrenti(ric);
  return ric;
}

function updateRicorrente(tipo, idx, data) {
  const ric = getRicorrenti();
  if (ric[tipo][idx]) {
    ric[tipo][idx] = { ...ric[tipo][idx], ...data };
    saveRicorrenti(ric);
  }
  return ric;
}

function deleteRicorrente(tipo, idx) {
  const ric = getRicorrenti();
  ric[tipo].splice(idx, 1);
  saveRicorrenti(ric);
  return ric;
}

/**
 * Applica i ricorrenti al year corrente, creando spese/entrate per ogni mese
 * nel range di date, solo se non esiste già una voce con stessa descrizione e data.
 */
function applicaRicorrenti(year) {
  const ric = getRicorrenti();

  for (const tipo of ["entrate", "uscite"]) {
    for (const r of ric[tipo]) {
      const inizio = new Date(r.dataInizio + "-01T00:00:00");
      const fine = new Date(r.dataFine + "-01T00:00:00");
      const firstMonth = inizio.getFullYear() === year ? inizio.getMonth() : 0;
      const lastMonth = fine.getFullYear() === year ? fine.getMonth() : 11;

      for (let m = firstMonth; m <= lastMonth; m++) {
        const meseDate = new Date(year, m, 1);
        if (meseDate < inizio || meseDate > fine) continue;
        const dataStr = `${year}-${String(m + 1).padStart(2, "0")}-01`;

        if (tipo === "uscite") {
          const allSpese = getSpeseMese(year, m);
          const esistente = allSpese.find(
            (s) => s.descrizione === r.descrizione && s.data === dataStr
          );
          if (esistente) {
            // Aggiorna importo e ricId al valore corrente del ricorrente
            const updates = { ricId: r.id };
            if (esistente.importo !== r.importo) {
              updates.importo = r.importo;
            }
            updateSpesa(year, m, esistente.id, updates);
          } else {
            addSpesa(year, m, {
              id: generaId("spesa"),
              data: dataStr,
              descrizione: r.descrizione,
              importo: r.importo,
              stato: "preventivata",
              ricId: r.id
            });
          }
        } else {
          const allEntrate = getEntrate(year);
          const entrateMese = allEntrate[m] || [];
          const esistente = entrateMese.find(
            (e) => e.descrizione === r.descrizione && e.data === dataStr
          );
          if (esistente) {
            // Aggiorna importo e ricId al valore corrente del ricorrente
            esistente.ricId = r.id;
            if (esistente.importo !== r.importo) {
              esistente.importo = r.importo;
            }
            saveEntrate(year, allEntrate);
          } else {
            addEntrata(year, m, {
              id: generaId("entrata"),
              data: dataStr,
              descrizione: r.descrizione,
              importo: r.importo,
              ricId: r.id
            });
          }
        }
      }
    }
  }
}

// =============================================
// SYNC SUPABASE (ASINCRONO — FIRE & FORGET)
// =============================================

async function syncSpeseSupabase(year, mesi) {
  try {
    // Cancella TUTTE le spese dell'anno su Supabase
    await fetch(`${SUPABASE_URL}/rest/v1/spese?data=gte.${year}-01-01&data=lte.${year}-12-31`, {
      method: "DELETE",
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` }
    });
    // Reinserisce quelle correnti
    for (let m = 0; m < 12; m++) {
      for (const s of (mesi[m] || [])) {
        const body = {
          id: s.id, data: s.data, descrizione: s.descrizione,
          importo: s.importo, stato: s.stato || "preventivata"
        };
        if (s.ricId) body.ric_id = s.ricId;
        try { await sb("POST", "spese", { body }); } catch (_) {}
      }
    }
  } catch (e) {
    console.warn("Sync spese fallito:", e.message);
  }
}

async function syncEntrateSupabase(year, mesi) {
  try {
    // Cancella TUTTE le entrate dell'anno su Supabase
    await fetch(`${SUPABASE_URL}/rest/v1/entrate?data=gte.${year}-01-01&data=lte.${year}-12-31`, {
      method: "DELETE",
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` }
    });
    // Reinserisce quelle correnti
    for (let m = 0; m < 12; m++) {
      for (const e of (mesi[m] || [])) {
        const body = {
          id: e.id, data: e.data, descrizione: e.descrizione, importo: e.importo
        };
        if (e.ricId) body.ric_id = e.ricId;
        try { await sb("POST", "entrate", { body }); } catch (_) {}
      }
    }
  } catch (e) {
    console.warn("Sync entrate fallito:", e.message);
  }
}

async function syncCategorieSupabase(cat) {
  try {
    // Cancella TUTTE le categorie su Supabase (id non nullo)
    await fetch(`${SUPABASE_URL}/rest/v1/categorie?id=not.is.null`, {
      method: "DELETE",
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` }
    });
    // Reinserisce quelle correnti con campo tipo
    for (const c of (cat.entrate || [])) {
      await sb("POST", "categorie", { body: { id: c.id, tipo: "entrate", descrizione: c.descrizione } });
    }
    for (const c of (cat.uscite || [])) {
      await sb("POST", "categorie", { body: { id: c.id, tipo: "uscite", descrizione: c.descrizione } });
    }
  } catch (e) {
    console.warn("Sync categorie fallito:", e.message);
  }
}

async function syncRicorrentiSupabase(ric) {
  try {
    // Cancella TUTTI i ricorrenti su Supabase
    await fetch(`${SUPABASE_URL}/rest/v1/ricorrenti?id=not.is.null`, {
      method: "DELETE",
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` }
    });
    // Reinserisce quelli correnti
    for (const r of (ric.entrate || [])) {
      await sb("POST", "ricorrenti", {
        body: { id: r.id, tipo: "entrate", descrizione: r.descrizione, importo: r.importo, data_inizio: r.dataInizio, data_fine: r.dataFine }
      });
    }
    for (const r of (ric.uscite || [])) {
      await sb("POST", "ricorrenti", {
        body: { id: r.id, tipo: "uscite", descrizione: r.descrizione, importo: r.importo, data_inizio: r.dataInizio, data_fine: r.dataFine }
      });
    }
  } catch (e) {
    console.warn("Sync ricorrenti fallito:", e.message);
  }
}

// =============================================
// INIT — Carica da Supabase all'avvio
// =============================================

caricaDaSupabase();
