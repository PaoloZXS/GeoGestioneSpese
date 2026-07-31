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

  // Elementi DOM
  const contenitoreLista = document.getElementById("contenitoreLista");
  const elencoGruppi = document.getElementById("elencoGruppi");
  const dettaglioHeader = document.getElementById("dettaglioHeader");
  const elencoMovimenti = document.getElementById("elencoMovimenti");
  const btnSelezionaTutto = document.getElementById("btnSelezionaTutto");
  const btnNessuno = document.getElementById("btnNessuno");
  const btnConferma = document.getElementById("btnConfermaCancella");
  const btnAnnulla = document.getElementById("btnAnnulla");

  // Modale password
  const pwModal = document.getElementById("pwModal");
  const pwMsg = document.getElementById("pwMsg");
  const pwInput = document.getElementById("pwInput");
  const pwOk = document.getElementById("pwOk");
  const pwAnnulla = document.getElementById("pwAnnulla");

  let gruppi = []; // [{ descrizione, voci: [...] }]
  let gruppoAttivo = -1; // indice del gruppo selezionato
  let selezione = new Set(); // id delle voci spuntate

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
      return;
    }

    gruppi.forEach((g, idx) => {
      const row = document.createElement("div");
      row.className = "gruppo-row" + (idx === gruppoAttivo ? " attiva" : "");
      row.innerHTML = `
        <span class="gruppo-nome">${escapeHtml(g.descrizione)}</span>
        <span class="gruppo-count">${g.voci.length} voci</span>
      `;
      row.addEventListener("click", () => {
        gruppoAttivo = idx;
        renderGruppi();
        renderDettaglio();
      });
      elencoGruppi.appendChild(row);
    });
  }

  // =============================================
  // RENDER DETTAGLIO (blocco destra)
  // =============================================

  function renderDettaglio() {
    const g = gruppi[gruppoAttivo];

    if (!g) {
      dettaglioHeader.innerHTML =
        '<i class="fas fa-list-ul"></i> <span>Dettaglio</span>';
      elencoMovimenti.innerHTML =
        '<div class="mv-empty">Clicca su una voce a sinistra per vedere le singole voci.</div>';
      aggiornaRiepilogo();
      return;
    }

    dettaglioHeader.innerHTML =
      '<i class="fas fa-list-ul"></i> <span>' +
      escapeHtml(g.descrizione) +
      "</span>";

    elencoMovimenti.innerHTML = "";
    g.voci.forEach((mv) => {
      const isSel = selezione.has(mv.id);
      const row = document.createElement("label");
      row.className = "mv-row" + (isSel ? " selezionata" : "");

      const icona =
        mv.tipo === "entrata"
          ? '<i class="fas fa-arrow-up"></i>'
          : '<i class="fas fa-arrow-down"></i>';

      row.innerHTML = `
        <input type="checkbox" class="mv-check" ${isSel ? "checked" : ""} />
        <span class="mv-tipo ${mv.tipo}">${icona}</span>
        <span class="mv-data">${formatDataBreve(mv.data)}</span>
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

      elencoMovimenti.appendChild(row);
    });

    aggiornaRiepilogo();
  }

  function aggiornaRiepilogo() {
    const sel = selezione.size;
    btnConferma.textContent = `Elimina selezionat${sel === 1 ? "a" : "e"} (${sel})`;
    btnConferma.disabled = sel === 0;
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
    gruppoAttivo = gruppi.length > 0 ? 0 : -1;
    selezione = new Set();
    renderGruppi();
    renderDettaglio();
    contenitoreLista.hidden = false;
  }

  btnSelezionaTutto.addEventListener("click", () => {
    // Seleziona SOLO le voci del gruppo attivo (non tutte)
    const g = gruppi[gruppoAttivo];
    if (!g) return;
    selezione = new Set(g.voci.map((v) => v.id));
    renderDettaglio();
  });

  btnNessuno.addEventListener("click", () => {
    // Deseleziona SOLO le voci del gruppo attivo
    const g = gruppi[gruppoAttivo];
    if (!g) return;
    g.voci.forEach((v) => selezione.delete(v.id));
    renderDettaglio();
  });

  btnConferma.addEventListener("click", async () => {
    if (selezione.size === 0) return;
    const n = selezione.size;

    const ok = await showConfirm(
      `Eliminare ${n} ${n === 1 ? "voce" : "voci"} dal planning?\nLe descrizioni (ricorrenti) restano invariate.`
    );
    if (!ok) return;

    // La password viene chiesta solo qui
    const pw = await chiediPassword(
      `Inserisci la password per eliminare ${n} ${n === 1 ? "voce" : "voci"}.`
    );
    if (pw === null) return;

    if (pw !== PASSWORD) {
      await showAlert("Password errata. Operazione annullata.");
      return;
    }

    await cancellaSelezionati();
    await showAlert(
      `${n} ${n === 1 ? "voce eliminata" : "voci eliminate"} dal planning.`
    );

    // Ricarica la lista con i dati rimasti
    popolaLista();
  });

  btnAnnulla.addEventListener("click", () => {
    selezione = new Set();
    renderDettaglio();
  });

  // =============================================
  // TABS
  // =============================================

  document.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document
        .querySelectorAll(".tab-btn")
        .forEach((b) => b.classList.remove("active"));
      document
        .querySelectorAll(".tab-panel")
        .forEach((p) => p.classList.remove("active"));
      btn.classList.add("active");
      const panel = document.getElementById("tab-" + btn.dataset.tab);
      if (panel) panel.classList.add("active");
    });
  });

  // =============================================
  // INIT — popola la lista appena i dati sono pronti
  // =============================================

  if (_cacheReady) {
    popolaLista();
  } else {
    window.addEventListener("dataReady", popolaLista);
  }
})();
