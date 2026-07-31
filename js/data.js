/* =============================================
   DATA LAYER — Solo Supabase + cache in memoria
   ============================================= */

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

// =============================================
// CARICAMENTO DA data.json (fallback locale)
// =============================================

function caricaDaJson(dati) {
  // --- Spese ---
  _speseCache = {};
  if (dati.spese) {
    for (const anno of Object.keys(dati.spese)) {
      _speseCache[anno] = JSON.parse(dati.spese[anno]);
    }
  }
  // --- Entrate ---
  _entrateCache = {};
  if (dati.entrate) {
    for (const anno of Object.keys(dati.entrate)) {
      _entrateCache[anno] = JSON.parse(dati.entrate[anno]);
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
      if (!_speseCache[y])
        _speseCache[y] = Array.from({ length: 12 }, () => []);
      // Converti ric_id -> ricId, rimuovi created_at
      _speseCache[y][m].push({
        id: s.id,
        data: s.data,
        descrizione: s.descrizione,
        importo: s.importo,
        stato: s.stato,
        ...(s.ric_id && { ricId: s.ric_id })
      });
    }

    // --- Entrate ---
    _entrateCache = {};
    for (const e of entrate) {
      const y = e.data.substring(0, 4);
      const m = parseInt(e.data.substring(5, 7)) - 1;
      if (!_entrateCache[y])
        _entrateCache[y] = Array.from({ length: 12 }, () => []);
      // Converti ric_id -> ricId, rimuovi created_at
      _entrateCache[y][m].push({
        id: e.id,
        data: e.data,
        descrizione: e.descrizione,
        importo: e.importo,
        ...(e.ric_id && { ricId: e.ric_id })
      });
    }

    // --- Auto-scadenza: spese con data passata diventano "scaduta" ---
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
        id: r.id,
        descrizione: r.descrizione,
        importo: r.importo,
        giorno: r.giorno || 1,
        dataInizio: r.data_inizio,
        dataFine: r.data_fine
      });
    }

    _cacheReady = true;
    console.log("✅ Dati caricati da Supabase");
    window.dispatchEvent(new CustomEvent("dataReady"));
    return true;
  } catch (e) {
    console.warn("❌ Supabase non disponibile:", e.message);
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
  await syncSpeseSupabase(year, mesi);
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
  await syncEntrateSupabase(year, mesi);
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
  // Fallback finché Supabase non carica
  return getDefaultCategorie();
}

async function saveCategorie(cat) {
  _categorieCache = cat;
  await syncCategorieSupabase(cat);
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
  return getDefaultRicorrenti();
}

async function saveRicorrenti(ric) {
  _ricorrentiCache = ric;
  await syncRicorrentiSupabase(ric);
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
 * Applica i ricorrenti all'anno corrente, creando/aggiornando spese/entrate.
 * Prima rimuove TUTTE le vecchie spese/entrate collegate a ricorrenti (ricId),
 * poi rigenera tutto da capo. Accumula le modifiche e le salva su Supabase
 * in un'unica chiamata per tipo, per evitare race condition e sync multipli.
 */
async function applicaRicorrenti(year) {
  const ric = getRicorrenti();

  // Lavora su copie mutabili delle strutture dati correnti
  const speseAggiornate = getSpese(year);
  const entrateAggiornate = getEntrate(year);

  // --- Rimuovi vecchie voci collegate a ricorrenti (solo se non eseguite) ---
  for (let m = 0; m < 12; m++) {
    if (speseAggiornate[m]) {
      speseAggiornate[m] = speseAggiornate[m].filter(
        (s) => !s.ricId || s.stato === "eseguita"
      );
    }
    if (entrateAggiornate[m]) {
      entrateAggiornate[m] = entrateAggiornate[m].filter((e) => !e.ricId);
    }
  }

  // --- Rigenera da capo ---
  for (const tipo of ["entrate", "uscite"]) {
    for (const r of ric[tipo]) {
      const giorno = r.giorno || 1;
      const inizio = new Date(r.dataInizio + "-01T00:00:00");
      const fine = new Date(r.dataFine + "-01T00:00:00");
      const firstMonth = inizio.getFullYear() === year ? inizio.getMonth() : 0;
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
            ricId: r.id
          });
        }
      }
    }
  }

  // Un unico salvataggio per tipo su Supabase
  await saveSpese(year, speseAggiornate);
  await saveEntrate(year, entrateAggiornate);
}

// =============================================
// SYNC SUPABASE
// =============================================

async function syncSpeseSupabase(year, mesi) {
  try {
    // Cancella TUTTE le spese dell'anno su Supabase
    await fetch(
      `${SUPABASE_URL}/rest/v1/spese?data=gte.${year}-01-01&data=lte.${year}-12-31`,
      {
        method: "DELETE",
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`
        }
      }
    );
    // Reinserisce quelle correnti
    for (let m = 0; m < 12; m++) {
      for (const s of mesi[m] || []) {
        const body = {
          id: s.id,
          data: s.data,
          descrizione: s.descrizione,
          importo: s.importo,
          stato: s.stato || "preventivata"
        };
        if (s.ricId) body.ric_id = s.ricId;
        try {
          await sb("POST", "spese", { body });
        } catch (_) {}
      }
    }
  } catch (e) {
    console.warn("Sync spese fallito:", e.message);
  }
}

async function syncEntrateSupabase(year, mesi) {
  try {
    // Cancella TUTTE le entrate dell'anno su Supabase
    await fetch(
      `${SUPABASE_URL}/rest/v1/entrate?data=gte.${year}-01-01&data=lte.${year}-12-31`,
      {
        method: "DELETE",
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`
        }
      }
    );
    // Reinserisce quelle correnti
    for (let m = 0; m < 12; m++) {
      for (const e of mesi[m] || []) {
        const body = {
          id: e.id,
          data: e.data,
          descrizione: e.descrizione,
          importo: e.importo
        };
        if (e.ricId) body.ric_id = e.ricId;
        try {
          await sb("POST", "entrate", { body });
        } catch (_) {}
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
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`
      }
    });
    // Reinserisce quelle correnti con campo tipo
    for (const c of cat.entrate || []) {
      await sb("POST", "categorie", {
        body: { id: c.id, tipo: "entrate", descrizione: c.descrizione }
      });
    }
    for (const c of cat.uscite || []) {
      await sb("POST", "categorie", {
        body: { id: c.id, tipo: "uscite", descrizione: c.descrizione }
      });
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
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`
      }
    });
    // Reinserisce quelli correnti
    for (const r of ric.entrate || []) {
      await sb("POST", "ricorrenti", {
        body: {
          id: r.id,
          tipo: "entrate",
          descrizione: r.descrizione,
          importo: r.importo,
          giorno: r.giorno || 1,
          data_inizio: r.dataInizio,
          data_fine: r.dataFine
        }
      });
    }
    for (const r of ric.uscite || []) {
      await sb("POST", "ricorrenti", {
        body: {
          id: r.id,
          tipo: "uscite",
          descrizione: r.descrizione,
          importo: r.importo,
          giorno: r.giorno || 1,
          data_inizio: r.dataInizio,
          data_fine: r.dataFine
        }
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
