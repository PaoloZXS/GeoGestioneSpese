/* =============================================
   IMPOSTAZIONI — Gestione dati
   Cancellazione mirata di entrate/uscite del planning
   (le descrizioni / ricorrenti NON vengono toccate)
   Layout: gruppi per descrizione (sinistra) + dettaglio (destra)
   Password richiesta solo al momento dell'eliminazione
   ============================================= */

(function () {
  "use strict";

  // Stessa password del login (login.js)
  const PASSWORD = "3621";

  // Elementi DOM del tab Cancellazione (creati dinamicamente all'apertura)
  let tabCancellazione = null;
  let contenitoreLista = null;
  let elencoGruppi = null;
  let dettaglioHeader = null;
  let elencoMovimenti = null;
  let btnSelezionaTutto = null;
  let btnNessuno = null;
  let btnConferma = null;
  let btnAnnulla = null;
  let btnEliminaCategorie = null;
  let btnEliminaTutte = null;

  // Elementi DOM del blocco "Elimina per intervallo di date"
  let cardRangeDate = null;
  let rangeDa = null;
  let rangeA = null;
  let btnEliminaRange = null;
  let toolbarAzioni = null;

  // Elementi DOM del tab Storico (creati dinamicamente all'apertura)
  let tabStorico = null;
  let elencoSnapshot = null;

  // Modale password (usato al momento di eliminare)
  const pwModal = document.getElementById("pwModal");
  const pwTitle = document.getElementById("pwTitle");
  const pwMsg = document.getElementById("pwMsg");
  const pwInput = document.getElementById("pwInput");
  const pwOk = document.getElementById("pwOk");
  const pwAnnulla = document.getElementById("pwAnnulla");

  // Spinner di caricamento (stesso pattern di programmazione.js)
  const spinnerOverlay = document.getElementById("spinnerOverlay");
  const spinnerMsg = document.getElementById("spinnerMsg");

  function showSpinner(msg) {
    if (spinnerMsg) spinnerMsg.textContent = msg;
    if (spinnerOverlay) spinnerOverlay.classList.add("active");
  }
  function hideSpinner() {
    if (spinnerOverlay) spinnerOverlay.classList.remove("active");
  }

  let gruppi = []; // [{ descrizione, voci: [...] }]
  let gruppoAttivo = -1; // indice del gruppo selezionato
  let selezione = new Set(); // id delle voci spuntate
  let categorieSelezionate = new Set(); // indici delle categorie spuntate
  let cancellazioneSbloccata = false; // password tab Cancellazione inserita

  // =============================================
  // HELPERS
  // =============================================

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  // =============================================
  // RACCOLTA MOVIMENTI DALLA CACHE
  // =============================================

  function raccogliMovimenti() {
    const lista = [];
    const anni = new Set([
      ...Object.keys(_speseCache),
      ...Object.keys(_entrateCache)
    ]);

    for (const anno of anni) {
      const spese = getSpese(anno);
      const entrate = getEntrate(anno);
      for (let m = 0; m < 12; m++) {
        (spese[m] || []).forEach((s) =>
          lista.push({
            id: s.id,
            tipo: "uscita",
            anno,
            mese: m,
            data: s.data,
            descrizione: s.descrizione,
            importo: s.importo,
            stato: s.stato
          })
        );
        (entrate[m] || []).forEach((e) =>
          lista.push({
            id: e.id,
            tipo: "entrata",
            anno,
            mese: m,
            data: e.data,
            descrizione: e.descrizione,
            importo: e.importo
          })
        );
      }
    }

    lista.sort((a, b) => {
      if (a.data !== b.data) return a.data.localeCompare(b.data);
      return a.descrizione.localeCompare(b.descrizione, "it");
    });
    return lista;
  }

  function costruisciGruppi(movimenti) {
    const mappa = new Map();
    for (const mv of movimenti) {
      const key = mv.descrizione;
      if (!mappa.has(key)) mappa.set(key, []);
      mappa.get(key).push(mv);
    }
    const gruppi = [...mappa.entries()].map(([descrizione, voci]) => ({
      descrizione,
      voci
    }));
    gruppi.sort((a, b) => a.descrizione.localeCompare(b.descrizione, "it"));
    return gruppi;
  }

  // =============================================
  // RENDER GRUPPI (blocco sinistra)
  // =============================================

  function renderGruppi() {
    elencoGruppi.innerHTML = "";

    if (gruppi.length === 0) {
      elencoGruppi.innerHTML =
        '<div class="mv-empty">Nessuna entrata o uscita trovata nel planning.</div>';
      aggiornaBtnCategorie();
      return;
    }

    gruppi.forEach((g, idx) => {
      const row = document.createElement("div");
      row.className = "gruppo-row" + (idx === gruppoAttivo ? " attiva" : "");
      const isCatSel = categorieSelezionate.has(idx);
      row.innerHTML = `
        <input type="checkbox" class="mv-check" ${isCatSel ? "checked" : ""} />
        <span class="gruppo-nome">${escapeHtml(g.descrizione)}</span>
        <span class="gruppo-count">${g.voci.length} voci</span>
      `;
      const check = row.querySelector(".mv-check");
      check.addEventListener("change", () => {
        if (check.checked) {
          categorieSelezionate.add(idx);
          gruppoAttivo = idx; // sincronizza la lista a destra con questa categoria
        } else {
          categorieSelezionate.delete(idx);
          if (gruppoAttivo === idx) {
            // Se deseleziono la categoria attiva, mostro l'ultima rimasta selezionata
            const rimaste = [...categorieSelezionate];
            gruppoAttivo =
              rimaste.length > 0 ? rimaste[rimaste.length - 1] : -1;
          }
        }
        renderGruppi();
        renderDettaglio();
        aggiornaBtnCategorie();
      });
      row.addEventListener("click", (e) => {
        // Il click sul checkbox è già gestito sopra
        if (e.target === check) return;
        gruppoAttivo = idx;
        renderGruppi();
        renderDettaglio();
      });
      elencoGruppi.appendChild(row);
    });
    aggiornaBtnCategorie();
  }

  // =============================================
  // RENDER DETTAGLIO (blocco destra)
  // =============================================

  function renderDettaglio() {
    // Liste per categoria: una lista per ogni categoria selezionata (o attiva)
    let gruppiDaMostrare = [];
    if (categorieSelezionate.size > 0) {
      gruppiDaMostrare = [...categorieSelezionate]
        .map((idx) => gruppi[idx])
        .filter(Boolean)
        .sort((a, b) => a.descrizione.localeCompare(b.descrizione, "it"));
    } else if (gruppoAttivo >= 0 && gruppi[gruppoAttivo]) {
      gruppiDaMostrare = [gruppi[gruppoAttivo]];
    }

    if (gruppiDaMostrare.length === 0) {
      dettaglioHeader.innerHTML =
        '<i class="fas fa-list-ul"></i> <span>Dettaglio voci</span>';
      elencoMovimenti.innerHTML =
        '<div class="mv-empty">Clicca su una voce a sinistra per vedere le singole voci.</div>';
      aggiornaRiepilogo();
      return;
    }

    dettaglioHeader.innerHTML =
      '<i class="fas fa-list-ul"></i> <span>Dettaglio voci</span>';

    elencoMovimenti.innerHTML = "";
    gruppiDaMostrare.forEach((g) => {
      // Una lista (sottolista) per categoria, con intestazione
      const sub = document.createElement("div");
      sub.className = "mv-sublist";
      sub.innerHTML =
        '<div class="mv-sublist-header"><span>' +
        escapeHtml(g.descrizione) +
        '</span><span class="mv-sublist-count">' +
        g.voci.length +
        " voci</span></div>";

      // Voci della categoria, ordinate per data crescente
      const voci = [...g.voci].sort((a, b) => a.data.localeCompare(b.data));
      voci.forEach((mv) => {
        const isSel = selezione.has(mv.id);
        const row = document.createElement("label");
        row.className = "mv-row" + (isSel ? " selezionata" : "");

        row.innerHTML = `
          <input type="checkbox" class="mv-check" ${isSel ? "checked" : ""} />
          <span class="mv-data">${formatDataCompleta(mv.data)}</span>
          <span class="mv-desc">${escapeHtml(mv.descrizione)}</span>
          <span class="mv-importo ${mv.tipo}">${formatEuro(mv.importo)}</span>
        `;

        const check = row.querySelector(".mv-check");
        check.addEventListener("change", () => {
          if (check.checked) selezione.add(mv.id);
          else selezione.delete(mv.id);
          row.classList.toggle("selezionata", check.checked);
          aggiornaRiepilogo();
        });

        sub.appendChild(row);
      });

      elencoMovimenti.appendChild(sub);
    });

    aggiornaRiepilogo();
  }

  function aggiornaRiepilogo() {
    const sel = selezione.size;
    btnConferma.textContent = `Elimina selezionat${sel === 1 ? "a" : "e"} (${sel})`;
    btnConferma.disabled = sel === 0;
  }

  function aggiornaBtnCategorie() {
    if (btnEliminaCategorie) {
      btnEliminaCategorie.disabled = categorieSelezionate.size === 0;
    }
    if (btnEliminaTutte) {
      const vuoto = gruppi.length === 0;
      btnEliminaTutte.disabled = vuoto;
      // Visibile solo se ci sono categorie
      btnEliminaTutte.style.display = vuoto ? "none" : "";
    }
  }

  // =============================================
  // CANCELLAZIONE (solo voci spuntate)
  // =============================================

  // idsOverride: Set di id opzionale (es. intervallo di date).
  // Se assente usa la selezione globale (checkbox).
  async function cancellaSelezionati(idsOverride) {
    const target = idsOverride || selezione;
    const idsSpese = new Set();
    const idsEntrate = new Set();

    // Rimuove dalla cache e raccoglie gli id selezionati (per tabella)
    for (const anno of Object.keys(_speseCache)) {
      const all = _speseCache[anno];
      for (let m = 0; m < 12; m++) {
        if (!all[m]) continue;
        all[m].forEach((s) => {
          if (target.has(s.id)) idsSpese.add(s.id);
        });
        all[m] = all[m].filter((s) => !target.has(s.id));
      }
    }
    for (const anno of Object.keys(_entrateCache)) {
      const all = _entrateCache[anno];
      for (let m = 0; m < 12; m++) {
        if (!all[m]) continue;
        all[m].forEach((e) => {
          if (target.has(e.id)) idsEntrate.add(e.id);
        });
        all[m] = all[m].filter((e) => !target.has(e.id));
      }
    }

    // DELETE mirato su Supabase: SOLO gli id selezionati
    // (niente "cancella tutto l'anno e reinserisci": rischia di togliere più dati)
    const headers = {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`
    };
    if (idsSpese.size > 0) {
      await fetch(
        `${SUPABASE_URL}/rest/v1/spese?id=in.(${[...idsSpese].join(",")})`,
        { method: "DELETE", headers }
      );
    }
    if (idsEntrate.size > 0) {
      await fetch(
        `${SUPABASE_URL}/rest/v1/entrate?id=in.(${[...idsEntrate].join(",")})`,
        { method: "DELETE", headers }
      );
    }
  }

  // =============================================
  // MODALE PASSWORD (chiamato solo al momento di eliminare)
  // =============================================

  function chiediPassword(msg) {
    return new Promise((resolve) => {
      pwTitle.textContent = "Conferma eliminazione";
      pwOk.innerHTML = '<i class="fas fa-trash"></i> Elimina';
      pwMsg.textContent = msg;
      pwInput.value = "";
      pwModal.classList.add("active");
      pwInput.focus();

      function chiudi(valore) {
        pwModal.classList.remove("active");
        pwOk.removeEventListener("click", okHandler);
        pwAnnulla.removeEventListener("click", annullaHandler);
        pwInput.removeEventListener("keydown", keyHandler);
        resolve(valore);
      }
      function okHandler() {
        chiudi(pwInput.value);
      }
      function annullaHandler() {
        chiudi(null);
      }
      function keyHandler(e) {
        if (e.key === "Enter") okHandler();
        if (e.key === "Escape") annullaHandler();
      }

      pwOk.addEventListener("click", okHandler);
      pwAnnulla.addEventListener("click", annullaHandler);
      pwInput.addEventListener("keydown", keyHandler);
    });
  }

  // =============================================
  // EVENTI
  // =============================================

  // Popola la lista automaticamente quando i dati sono pronti
  function popolaLista() {
    const lista = raccogliMovimenti();
    gruppi = costruisciGruppi(lista);
    gruppoAttivo = -1;
    selezione = new Set();
    categorieSelezionate = new Set();
    renderGruppi();
    renderDettaglio();
    contenitoreLista.hidden = false;
  }

  async function eliminaSelezionate() {
    if (selezione.size === 0) return;
    const n = selezione.size;

    const ok = await showConfirm(
      `Eliminare ${n} ${n === 1 ? "voce" : "voci"} dal planning?\nLe descrizioni (ricorrenti) restano invariate.`
    );
    if (!ok) return;

    await cancellaSelezionati();
    await showAlert(
      `${n} ${n === 1 ? "voce eliminata" : "voci eliminate"} dal planning.`
    );

    // Notifica le altre pagine (es. Ricorrenti) che i dati sono cambiati
    window.dispatchEvent(new CustomEvent("dataReady"));

    // Ricarica la lista con i dati rimasti
    popolaLista();
  }

  async function eliminaCategorieSelezionate() {
    if (categorieSelezionate.size === 0) return;
    const n = categorieSelezionate.size;

    const ok = await showConfirm(
      `Eliminare ${n} ${n === 1 ? "categoria" : "categorie"} e tutte le relative voci?`
    );
    if (!ok) return;

    // Raccoglie tutte le voci delle categorie selezionate
    const ids = new Set();
    categorieSelezionate.forEach((idx) => {
      const g = gruppi[idx];
      if (g) g.voci.forEach((v) => ids.add(v.id));
    });
    selezione = ids;
    await cancellaSelezionati();

    categorieSelezionate.clear();
    await showAlert(
      `${n} ${n === 1 ? "categoria eliminata" : "categorie eliminate"} dal planning.`
    );
    window.dispatchEvent(new CustomEvent("dataReady"));
    popolaLista();
  }

  async function eliminaTutteCategorie() {
    if (gruppi.length === 0) return;

    const ok = await showConfirm(
      "Eliminare TUTTE le categorie e tutte le voci correlate?"
    );
    if (!ok) return;

    // Raccoglie TUTTI gli ID di tutte le voci di tutte le categorie
    const ids = new Set();
    gruppi.forEach((g) => {
      if (g) g.voci.forEach((v) => ids.add(v.id));
    });
    selezione = ids;
    await cancellaSelezionati();

    // Resetta selezioni
    categorieSelezionate = new Set();
    selezione = new Set();

    await showAlert(
      "Tutte le categorie e le voci correlate sono state eliminate dal planning."
    );

    window.dispatchEvent(new CustomEvent("dataReady"));
    popolaLista();
  }

  // =============================================
  // ELIMINAZIONE PER INTERVALLO DI DATE
  // =============================================

  // Maschera: l'utente digita solo numeri, formattati come MM/AAAA
  function initMaskMeseAnno(input) {
    input.addEventListener("input", function () {
      let v = this.value.replace(/\D/g, "").slice(0, 6);
      if (v.length > 2) v = v.slice(0, 2) + "/" + v.slice(2);
      this.value = v;
    });
  }

  // Converte "MM/AAAA" in "YYYY-MM" (vuoto se non valido)
  function parseMeseAnno(str) {
    if (!str) return "";
    const m = String(str)
      .trim()
      .match(/^(\d{2})\/(\d{4})$/);
    if (!m) return "";
    const mm = Number(m[1]);
    if (mm < 1 || mm > 12) return "";
    return `${m[2]}-${m[1]}`;
  }

  function aggiornaBtnRange() {
    if (!btnEliminaRange) return;
    const da = parseMeseAnno(rangeDa.value);
    const a = parseMeseAnno(rangeA.value);
    btnEliminaRange.disabled = !(da && a && da <= a);
  }

  // da/a sono in formato "YYYY-MM"
  function raccogliIdsPerRange(da, a) {
    const movimenti = raccogliMovimenti();
    const ids = new Set();

    // Estremi: primo giorno del mese iniziale, ultimo giorno del mese finale
    const from = da + "-01";
    const [yA, mA] = a.split("-").map(Number);
    const ultimoGiorno = new Date(yA, mA, 0).getDate(); // mA 1-based → ultimo giorno
    const to = a + "-" + String(ultimoGiorno).padStart(2, "0");

    movimenti.forEach((mv) => {
      if (!mv.data) return;
      if (mv.data < from || mv.data > to) return;
      // Elimina SEMPRE tutte le voci: entrate e uscite
      ids.add(mv.id);
    });
    return ids;
  }

  function formatMeseAnno(ym) {
    if (!ym) return "";
    const [y, m] = ym.split("-");
    return `${m}/${y}`;
  }

  // =============================================
  // PICKER MESE/ANNO (si apre da campo o icona calendario)
  // =============================================

  let pickerApertoInput = null;

  function chiudiPickerMeseAnno() {
    const old = document.querySelector(".month-year-picker");
    if (old) old.remove();
    pickerApertoInput = null;
  }

  function apriPickerMeseAnno(input) {
    if (pickerApertoInput === input) return; // già aperto
    chiudiPickerMeseAnno();
    pickerApertoInput = input;

    const wrap = input.closest(".range-input-wrap");
    if (!wrap) return;

    const nomi = [
      "Gennaio",
      "Febbraio",
      "Marzo",
      "Aprile",
      "Maggio",
      "Giugno",
      "Luglio",
      "Agosto",
      "Settembre",
      "Ottobre",
      "Novembre",
      "Dicembre"
    ];
    const corrente = parseMeseAnno(input.value);
    let anno = corrente
      ? Number(corrente.slice(0, 4))
      : new Date().getFullYear();
    let meseSelezionato = corrente ? Number(corrente.slice(5, 7)) : 0;

    const picker = document.createElement("div");
    picker.className = "month-year-picker";

    function render() {
      picker.innerHTML = `
        <div class="picker-head">
          <button type="button" class="picker-nav" data-dir="-1" tabindex="-1"><i class="fas fa-chevron-left"></i></button>
          <span class="picker-year">${anno}</span>
          <button type="button" class="picker-nav" data-dir="1" tabindex="-1"><i class="fas fa-chevron-right"></i></button>
        </div>
        <div class="picker-months">
          ${nomi
            .map((n, i) => {
              const v = String(i + 1).padStart(2, "0");
              const sel = i + 1 === meseSelezionato ? " selected" : "";
              return `<button type="button" class="picker-month${sel}" data-mese="${v}" tabindex="-1">${n}</button>`;
            })
            .join("")}
        </div>
      `;

      picker.querySelectorAll(".picker-nav").forEach((b) => {
        b.addEventListener("click", function (e) {
          e.stopPropagation();
          anno += Number(b.dataset.dir);
          render();
        });
      });
      picker.querySelectorAll(".picker-month").forEach((b) => {
        b.addEventListener("click", function (e) {
          e.stopPropagation();
          const mese = b.dataset.mese;
          input.value = `${mese}/${anno}`;
          input.dispatchEvent(new Event("input"));
          chiudiPickerMeseAnno();
        });
      });
    }

    render();
    wrap.appendChild(picker);
  }

  async function eliminaRange() {
    const da = parseMeseAnno(rangeDa.value);
    const a = parseMeseAnno(rangeA.value);
    if (!da || !a || da > a) return;

    const ids = raccogliIdsPerRange(da, a);
    if (ids.size === 0) {
      await showAlert("Nessuna voce trovata nell'intervallo selezionato.");
      return;
    }

    const ok = await showConfirm(
      `Eliminare ${ids.size} ${ids.size === 1 ? "voce" : "voci"} comprese tra ${formatMeseAnno(da)} e ${formatMeseAnno(a)}?`
    );
    if (!ok) return;

    showSpinner("Attendere prego...");
    try {
      await cancellaSelezionati(ids);
    } finally {
      hideSpinner();
    }

    await showAlert(
      `${ids.size} ${ids.size === 1 ? "voce eliminata" : "voci eliminate"} dall'intervallo selezionato.`
    );

    window.dispatchEvent(new CustomEvent("dataReady"));

    // Resetta i campi e ricarica la lista
    rangeDa.value = "";
    rangeA.value = "";
    aggiornaBtnRange();
    popolaLista();
  }

  // =============================================
  // TAB CANCELLAZIONE — costruzione dinamica + accesso protetto
  // =============================================

  function costruisciTabCancellazione() {
    tabCancellazione = document.getElementById("tab-cancellazione");
    tabCancellazione.innerHTML = `
      <div class="cancellazione-main">
        <div class="impostazioni-card" id="cardRangeDate" hidden>
          <h3><i class="fas fa-calendar-range"></i> Elimina per intervallo di date</h3>
          <div class="card-desc">
            Elimina tutte le voci del planning (entrate e uscite) comprese tra due date.
          </div>
          <div class="range-fields">
            <div class="field-group">
              <label>Mese/Anno inizio</label>
              <div class="range-input-wrap">
                <input type="text" id="rangeDa" placeholder="MM/AAAA" maxlength="7" inputmode="numeric" autocomplete="off" />
                <i class="fas fa-calendar-alt range-icon"></i>
              </div>
            </div>
            <div class="field-group">
              <label>Mese/Anno fine</label>
              <div class="range-input-wrap">
                <input type="text" id="rangeA" placeholder="MM/AAAA" maxlength="7" inputmode="numeric" autocomplete="off" />
                <i class="fas fa-calendar-alt range-icon"></i>
              </div>
            </div>
            <button class="btn-cancella" id="btnEliminaRange" disabled>
              <i class="fas fa-trash"></i> Elimina intervallo
            </button>
          </div>
        </div>
        <div class="impostazioni-card" id="contenitoreLista" hidden>
          <div class="mv-layout">
            <div class="mv-blocco gruppi">
              <div class="mv-blocco-header">
                <i class="fas fa-layer-group"></i>
                <span>Categorie trovate</span>
              </div>
              <div class="gruppi-list" id="elencoGruppi"></div>
            </div>
            <div class="mv-blocco">
              <div class="mv-blocco-header" id="dettaglioHeader">
                <i class="fas fa-list-ul"></i>
                <span>Dettaglio voci</span>
              </div>
              <div class="elenco-azioni dettaglio-azioni">
                <button id="btnSelezionaTutto" class="link-btn">Tutto</button>
                <button id="btnNessuno" class="link-btn">Nessuno</button>
              </div>
              <div class="mv-list" id="elencoMovimenti"></div>
            </div>
          </div>
        </div>
      </div>
      <!-- Pulsanti in basso, sotto le card -->
      <div class="elenco-footer toolbar-bottom" id="toolbarAzioni" hidden>
        <div class="toolbar-left-btns">
          <button class="btn-cancella" id="btnEliminaCategorie" disabled>
            <i class="fas fa-trash"></i> Elimina Categorie Selezionate
          </button>
          <button class="btn-cancella" id="btnEliminaTutte" disabled>
            <i class="fas fa-trash"></i> Elimina tutte le categorie
          </button>
        </div>
        <div class="elenco-footer-btns">
          <button class="btn-cancella" id="btnConfermaCancella" disabled>
            <i class="fas fa-trash"></i> Elimina selezionate (0)
          </button>
          <button class="btn-annulla" id="btnAnnulla">Annulla</button>
        </div>
      </div>
    `;

    contenitoreLista = document.getElementById("contenitoreLista");
    elencoGruppi = document.getElementById("elencoGruppi");
    dettaglioHeader = document.getElementById("dettaglioHeader");
    elencoMovimenti = document.getElementById("elencoMovimenti");
    btnSelezionaTutto = document.getElementById("btnSelezionaTutto");
    btnNessuno = document.getElementById("btnNessuno");
    btnConferma = document.getElementById("btnConfermaCancella");
    btnAnnulla = document.getElementById("btnAnnulla");
    btnEliminaCategorie = document.getElementById("btnEliminaCategorie");
    btnEliminaTutte = document.getElementById("btnEliminaTutte");
    cardRangeDate = document.getElementById("cardRangeDate");
    rangeDa = document.getElementById("rangeDa");
    rangeA = document.getElementById("rangeA");
    btnEliminaRange = document.getElementById("btnEliminaRange");
    toolbarAzioni = document.getElementById("toolbarAzioni");

    // Eventi blocco intervallo date
    initMaskMeseAnno(rangeDa);
    initMaskMeseAnno(rangeA);
    rangeDa.addEventListener("input", aggiornaBtnRange);
    rangeA.addEventListener("input", aggiornaBtnRange);
    rangeDa.addEventListener("click", function () {
      apriPickerMeseAnno(rangeDa);
    });
    rangeA.addEventListener("click", function () {
      apriPickerMeseAnno(rangeA);
    });
    const iconeRange = cardRangeDate.querySelectorAll(
      ".range-input-wrap .range-icon"
    );
    if (iconeRange[0]) {
      iconeRange[0].addEventListener("click", function (e) {
        e.stopPropagation();
        apriPickerMeseAnno(rangeDa);
      });
    }
    if (iconeRange[1]) {
      iconeRange[1].addEventListener("click", function (e) {
        e.stopPropagation();
        apriPickerMeseAnno(rangeA);
      });
    }
    btnEliminaRange.addEventListener("click", eliminaRange);
    aggiornaBtnRange();

    // Eventi contenuto
    btnSelezionaTutto.addEventListener("click", function () {
      selezione = new Set();
      const gruppiSel =
        categorieSelezionate.size > 0
          ? [...categorieSelezionate].map((idx) => gruppi[idx]).filter(Boolean)
          : gruppoAttivo >= 0 && gruppi[gruppoAttivo]
            ? [gruppi[gruppoAttivo]]
            : [];
      gruppiSel.forEach((g) => g.voci.forEach((v) => selezione.add(v.id)));
      renderDettaglio();
    });
    btnNessuno.addEventListener("click", function () {
      selezione = new Set();
      renderDettaglio();
    });
    btnConferma.addEventListener("click", eliminaSelezionate);
    btnAnnulla.addEventListener("click", function () {
      selezione = new Set();
      renderDettaglio();
    });
    btnEliminaCategorie.addEventListener("click", eliminaCategorieSelezionate);
    btnEliminaTutte.addEventListener("click", eliminaTutteCategorie);
    aggiornaBtnCategorie();
  }

  // Chiede la password con il modale esistente: resta aperto finché non
  // viene inserita la password corretta (o si annulla).
  function chiediPasswordAccesso(msg) {
    return new Promise((resolve) => {
      pwTitle.textContent = "Cancellazione Dati";
      pwOk.innerHTML = '<i class="fas fa-key"></i> Accedi';
      pwMsg.textContent = msg;
      pwInput.value = "";
      pwModal.classList.add("active");
      pwInput.focus();

      function gestisci(valore) {
        if (valore === null) {
          chiudi(null);
          return;
        }
        if (valore !== PASSWORD) {
          pwMsg.textContent = "Password errata. Riprova.";
          pwInput.value = "";
          pwInput.focus();
          return; // resta aperto
        }
        chiudi(true);
      }
      function chiudi(valore) {
        pwModal.classList.remove("active");
        pwOk.removeEventListener("click", okHandler);
        pwAnnulla.removeEventListener("click", annullaHandler);
        pwInput.removeEventListener("keydown", keyHandler);
        resolve(valore);
      }
      function okHandler() {
        gestisci(pwInput.value);
      }
      function annullaHandler() {
        chiudi(null);
      }
      function keyHandler(e) {
        if (e.key === "Enter") okHandler();
        if (e.key === "Escape") annullaHandler();
      }

      pwOk.addEventListener("click", okHandler);
      pwAnnulla.addEventListener("click", annullaHandler);
      pwInput.addEventListener("keydown", keyHandler);
    });
  }

  async function apriTabCancellazione() {
    if (!tabCancellazione) costruisciTabCancellazione();

    // Contenuto nascosto finché non si inserisce la password
    contenitoreLista.hidden = true;
    if (cardRangeDate) cardRangeDate.hidden = true;
    if (toolbarAzioni) toolbarAzioni.hidden = true;
    cancellazioneSbloccata = false;

    const ok = await chiediPasswordAccesso(
      "Inserisci la password per accedere"
    );
    if (ok !== true) return; // annullato → resta bloccato

    cancellazioneSbloccata = true;
    contenitoreLista.hidden = false;
    if (cardRangeDate) cardRangeDate.hidden = false;
    if (toolbarAzioni) toolbarAzioni.hidden = false;
    popolaLista();
  }

  function chiudiTabCancellazione() {
    // Svuota tutto: il tab torna completamente vuoto
    if (tabCancellazione) tabCancellazione.innerHTML = "";
    tabCancellazione = null;
    contenitoreLista = null;
    elencoGruppi = null;
    dettaglioHeader = null;
    elencoMovimenti = null;
    btnSelezionaTutto = null;
    btnNessuno = null;
    btnConferma = null;
    btnAnnulla = null;
    btnEliminaCategorie = null;
    cardRangeDate = null;
    rangeDa = null;
    rangeA = null;
    btnEliminaRange = null;
    toolbarAzioni = null;
    categorieSelezionate = new Set();
    cancellazioneSbloccata = false;
  }

  // =============================================
  // TAB STORICO — elenco snapshot + ripristino
  // =============================================

  function costruisciTabStorico() {
    tabStorico = document.getElementById("tab-storico");
    tabStorico.innerHTML = `
      <div class="impostazioni-card">
        <h3><i class="fas fa-history"></i> Storico Salvataggi</h3>
        <div class="card-desc">
          Ogni modifica ai dati salva automaticamente uno snapshot.
          Da qui puoi ripristinare una versione precedente del piano.
        </div>
        <div class="snapshot-list" id="elencoSnapshot">
          <div class="mv-empty">Caricamento...</div>
        </div>
      </div>
    `;
    elencoSnapshot = document.getElementById("elencoSnapshot");
  }

  async function apriTabStorico() {
    if (!tabStorico) costruisciTabStorico();
    await caricaSnapshotLista();
  }

  function chiudiTabStorico() {
    if (tabStorico) tabStorico.innerHTML = "";
    tabStorico = null;
    elencoSnapshot = null;
  }

  async function caricaSnapshotLista() {
    if (!elencoSnapshot) return;
    elencoSnapshot.innerHTML = '<div class="mv-empty">Caricamento...</div>';
    try {
      const lista = await getSnapshotList();
      if (!lista || lista.length === 0) {
        elencoSnapshot.innerHTML =
          '<div class="mv-empty">Nessuno snapshot salvato.</div>';
        return;
      }
      elencoSnapshot.innerHTML = "";
      lista.forEach((snap) => {
        const row = document.createElement("div");
        row.className = "snapshot-row";
        const data = new Date(snap.timestamp);
        const dataStr = data.toLocaleString("it-IT", {
          day: "2-digit",
          month: "2-digit",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit"
        });
        row.innerHTML = `
          <div class="snapshot-info">
            <div class="snapshot-data">
              <i class="fas fa-clock"></i> ${escapeHtml(dataStr)}
            </div>
          </div>
          <button class="btn-ripristina">
            <i class="fas fa-undo"></i> Ripristina
          </button>
        `;
        row
          .querySelector(".btn-ripristina")
          .addEventListener("click", () => ripristinaSnapshotById(snap.id));
        elencoSnapshot.appendChild(row);
      });
    } catch (e) {
      elencoSnapshot.innerHTML =
        '<div class="mv-empty">Errore nel caricamento degli snapshot.</div>';
    }
  }

  // =============================================
  // CONFERMA RIPRISTINO — variante di showConfirm
  // con pulsante "Ripristina" invece di "Elimina"
  // =============================================

  function showConfirmRipristina(msg) {
    return new Promise((resolve) => {
      notificaIcon.className = "notifica-icon question";
      notificaIcon.innerHTML = '<i class="fas fa-question-circle"></i>';
      notificaMsg.textContent = msg;
      notificaBtns.innerHTML = `
        <button class="btn-no" id="notificaNoBtn">Annulla</button>
        <button class="btn-yes" id="notificaYesBtn">Ripristina</button>
      `;
      notificaModal.classList.add("active");

      function chiudi() {
        document
          .getElementById("notificaYesBtn")
          .removeEventListener("click", yesHandler);
        document
          .getElementById("notificaNoBtn")
          .removeEventListener("click", noHandler);
        notificaModal.classList.remove("active");
      }
      function yesHandler() {
        chiudi();
        resolve(true);
      }
      function noHandler() {
        chiudi();
        resolve(false);
      }

      document
        .getElementById("notificaYesBtn")
        .addEventListener("click", yesHandler);
      document
        .getElementById("notificaNoBtn")
        .addEventListener("click", noHandler);
    });
  }

  async function ripristinaSnapshotById(id) {
    const ok = await showConfirmRipristina(
      "Ripristinare questo snapshot?\nI dati correnti verranno sovrascritti."
    );
    if (!ok) return;
    // Spinner visibile dopo il click su "Ripristina" nel modale di conferma
    showSpinner("Attendere prego...");
    let esito = false;
    try {
      esito = await ripristinaSnapshot(id);
    } finally {
      hideSpinner();
    }
    if (esito) {
      await showAlert("Snapshot ripristinato correttamente.");
    } else {
      await showAlert("Errore durante il ripristino dello snapshot.");
    }
    // La lista NON viene ricaricata qui: il tab la ricarica da solo
    // alla prossima attivazione (click sul tab "Storico")
  }

  document.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const panelAttivo = document.querySelector(".tab-panel.active");
      const eraCancellazione =
        panelAttivo && panelAttivo.id === "tab-cancellazione";
      const eraStorico = panelAttivo && panelAttivo.id === "tab-storico";

      document
        .querySelectorAll(".tab-btn")
        .forEach((b) => b.classList.remove("active"));
      document
        .querySelectorAll(".tab-panel")
        .forEach((p) => p.classList.remove("active"));
      btn.classList.add("active");
      const panel = document.getElementById("tab-" + btn.dataset.tab);
      if (panel) panel.classList.add("active");

      if (btn.dataset.tab === "cancellazione") {
        // Entrando nel tab Cancellazione → mostra il form password
        if (!eraCancellazione) apriTabCancellazione();
        if (eraStorico) chiudiTabStorico();
      } else if (btn.dataset.tab === "storico") {
        // Entrando nel tab Storico → carica e mostra la lista snapshot
        if (eraCancellazione) chiudiTabCancellazione();
        if (!eraStorico) apriTabStorico();
      } else {
        // Lasciando uno dei tab dinamici → svuota tutto
        if (eraCancellazione) chiudiTabCancellazione();
        if (eraStorico) chiudiTabStorico();
      }
    });
  });

  // =============================================
  // INIT — il tab Cancellazione è vuoto all'apertura
  // (i contenuti vengono creati solo al click sul tab)
  // =============================================

  // Chiude il picker mese/anno se si clicca fuori
  document.addEventListener("click", function (e) {
    if (
      !e.target.closest(".month-year-picker") &&
      !e.target.closest(".range-input-wrap")
    ) {
      chiudiPickerMeseAnno();
    }
  });

  window.addEventListener("dataReady", function () {
    if (cancellazioneSbloccata && contenitoreLista) popolaLista();
  });
})();
