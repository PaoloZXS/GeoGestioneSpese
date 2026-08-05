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
        <input type="radio" name="catSel" class="mv-check" ${isCatSel ? "checked" : ""} />
        <span class="gruppo-nome">${escapeHtml(g.descrizione)}</span>
        <span class="gruppo-count">${g.voci.length} voci</span>
      `;
      const radio = row.querySelector(".mv-check");
      radio.addEventListener("click", (e) => {
        e.stopPropagation();
        if (radio.checked) {
          categorieSelezionate = new Set([idx]); // una sola categoria alla volta
          gruppoAttivo = idx; // sincronizza la lista a destra con questa categoria
        }
        renderGruppi();
        renderDettaglio();
        aggiornaBtnCategorie();
      });
      row.addEventListener("click", () => {
        gruppoAttivo = idx;
        categorieSelezionate = new Set([idx]); // radio selezionato
        renderGruppi();
        renderDettaglio();
        aggiornaBtnCategorie();
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
  }

  // =============================================
  // CANCELLAZIONE (solo voci spuntate)
  // =============================================

  async function cancellaSelezionati() {
    const idsSpese = new Set();
    const idsEntrate = new Set();

    // Rimuove dalla cache e raccoglie gli id selezionati (per tabella)
    for (const anno of Object.keys(_speseCache)) {
      const all = _speseCache[anno];
      for (let m = 0; m < 12; m++) {
        if (!all[m]) continue;
        all[m].forEach((s) => {
          if (selezione.has(s.id)) idsSpese.add(s.id);
        });
        all[m] = all[m].filter((s) => !selezione.has(s.id));
      }
    }
    for (const anno of Object.keys(_entrateCache)) {
      const all = _entrateCache[anno];
      for (let m = 0; m < 12; m++) {
        if (!all[m]) continue;
        all[m].forEach((e) => {
          if (selezione.has(e.id)) idsEntrate.add(e.id);
        });
        all[m] = all[m].filter((e) => !selezione.has(e.id));
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

  // =============================================
  // TAB CANCELLAZIONE — costruzione dinamica + accesso protetto
  // =============================================

  function costruisciTabCancellazione() {
    tabCancellazione = document.getElementById("tab-cancellazione");
    tabCancellazione.innerHTML = `
      <div class="impostazioni-card" id="contenitoreLista" hidden>
        <!-- Pulsanti fissi in alto -->
        <div class="elenco-footer toolbar-top">
          <button class="btn-cancella" id="btnEliminaCategorie" disabled>
            <i class="fas fa-trash"></i> Elimina Categorie Selezionate
          </button>
          <div class="elenco-footer-btns">
            <button class="btn-annulla" id="btnAnnulla">Annulla</button>
            <button class="btn-cancella" id="btnConfermaCancella" disabled>
              <i class="fas fa-trash"></i> Elimina selezionate (0)
            </button>
          </div>
        </div>
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
    cancellazioneSbloccata = false;

    const ok = await chiediPasswordAccesso(
      "Inserisci la password per accedere"
    );
    if (ok !== true) return; // annullato → resta bloccato

    cancellazioneSbloccata = true;
    contenitoreLista.hidden = false;
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

  window.addEventListener("dataReady", function () {
    if (cancellazioneSbloccata && contenitoreLista) popolaLista();
  });
})();
