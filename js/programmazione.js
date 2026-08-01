/* =============================================
   PROGRAMMAZIONE — Gestione Ricorrenti
   ============================================= */

(function () {
  "use strict";

  const ricListEntrate = document.getElementById("ricListEntrate");
  const ricListUscite = document.getElementById("ricListUscite");
  const ricDesc = document.getElementById("ricDesc");
  const ricTipo = document.getElementById("ricTipo");
  const ricDataInizio = document.getElementById("ricDataInizio");
  const ricDataFine = document.getElementById("ricDataFine");
  const addRicorrenteBtn = document.getElementById("addRicorrenteBtn");
  const cancelRicBtn = document.getElementById("cancelRicBtn");
  const deleteRicBtn = document.getElementById("deleteRicBtn");
  const ricImporto = document.getElementById("ricImporto");
  const ricGiorno = document.getElementById("ricGiorno");
  const applyRicBtn = document.getElementById("applyRicBtn");
  const spinnerOverlay = document.getElementById("spinnerOverlay");
  const spinnerMsg = document.getElementById("spinnerMsg");

  function showSpinner(msg) {
    spinnerMsg.textContent = msg;
    spinnerOverlay.classList.add("active");
  }
  function hideSpinner() {
    spinnerOverlay.classList.remove("active");
  }

  let editingTipo = null;
  let editingIdx = -1;

  // =============================================
  // RENDER
  // =============================================

  function renderRicorrenti() {
    renderRicColumn("entrate", ricListEntrate);
    renderRicColumn("uscite", ricListUscite);
  }

  function renderRicColumn(tipo, container) {
    const items = getRicorrenti()[tipo] || [];
    container.innerHTML = "";

    if (items.length === 0) {
      container.innerHTML =
        '<div class="ricorrenti-empty">Nessuna voce ricorrente</div>';
      return;
    }

    items.forEach((ric, idx) => {
      const item = document.createElement("div");
      item.className = "ricorrente-item";

      const periodo =
        formatPeriodoBreve(ric.dataInizio) +
        " → " +
        formatPeriodoBreve(ric.dataFine);

      // Verifica se questa ricorrente è già stata applicata al planning
      let statoBadge = "";
      const year = getCurrentYear();
      if (tipo === "uscite") {
        const spese = getSpese(year);
        const applicata = spese.some((mese) =>
          mese.some((s) => s.ricId === ric.id)
        );
        statoBadge = applicata
          ? '<span class="ric-stato applicata"><i class="fas fa-check-circle"></i> Applicata</span>'
          : '<span class="ric-stato nuova"><i class="fas fa-plus-circle"></i> Nuova</span>';
      } else {
        const entrate = getEntrate(year);
        const applicata = entrate.some((mese) =>
          mese.some((e) => e.ricId === ric.id)
        );
        statoBadge = applicata
          ? '<span class="ric-stato applicata"><i class="fas fa-check-circle"></i> Applicata</span>'
          : '<span class="ric-stato nuova"><i class="fas fa-plus-circle"></i> Nuova</span>';
      }

      item.innerHTML = `
        <span class="ric-desc">${ric.descrizione}</span>
        <span class="ric-importo">${formatEuro(ric.importo)}</span>
        <span class="ric-periodo">${periodo}</span>
        ${statoBadge}
      `;

      // Click sulla riga -> carica nei campi per modifica/elimina
      const avviaModifica = function () {
        // Evidenzia la riga selezionata (deseleziona tutte le altre in entrambe le liste)
        document.querySelectorAll(".ricorrente-item").forEach((el) => {
          el.classList.remove("selected");
        });
        item.classList.add("selected");
        // Evidenzia label/select del form in blu chiaro
        document
          .querySelector(".programmazione-form")
          .classList.add("form-active");

        editingTipo = tipo;
        editingIdx = idx;
        // Imposta tipo SENZA triggerare l'evento change
        ricTipo.value = tipo;
        // Popola manualmente le descrizioni per il tipo corretto
        const items = getCategorie()[tipo] || [];
        ricDesc.innerHTML =
          '<option value="">Seleziona una categoria...</option>';
        items.forEach((cat) => {
          const opt = document.createElement("option");
          opt.value = cat.descrizione;
          opt.textContent = cat.descrizione;
          ricDesc.appendChild(opt);
        });
        // Se la descrizione non è tra le categorie, la aggiungiamo
        if (![...ricDesc.options].some((o) => o.value === ric.descrizione)) {
          const opt = document.createElement("option");
          opt.value = ric.descrizione;
          opt.textContent = ric.descrizione;
          ricDesc.appendChild(opt);
        }
        ricDesc.value = ric.descrizione;
        ricImporto.value = ric.importo;
        ricGiorno.value = ric.giorno || 1;
        ricDataInizio.value = ric.dataInizio;
        ricDataFine.value = ric.dataFine;
        aggiornaTipoForm();
        addRicorrenteBtn.innerHTML =
          '<i class="fas fa-save"></i> Salva Ricorrente';
        cancelRicBtn.style.display = "";
        deleteRicBtn.style.display = "";
        ricDesc.focus();
      };

      item.addEventListener("click", avviaModifica);

      container.appendChild(item);
    });
  }

  // =============================================
  // CRUD
  // =============================================

  function annullaModifica() {
    editingTipo = null;
    editingIdx = -1;
    document
      .querySelector(".programmazione-form")
      .classList.remove("form-active");
    addRicorrenteBtn.innerHTML = '<i class="fas fa-save"></i> Salva Ricorrente';
    cancelRicBtn.style.display = "none";
    deleteRicBtn.style.display = "none";
    ricDesc.value = "";
    ricImporto.value = "";
    ricGiorno.value = "1";
    const year = getCurrentYear();
    ricDataInizio.value = year + "-01";
    ricDataFine.value = year + "-12";
    ricTipo.value = "entrate";
    popolaDescrizioniDaCategorie();
    aggiornaTipoForm();
  }

  /**
   * Applica SOLO la voce ricorrente indicata all'anno corrente:
   * rimuove le vecchie spese/entrate collegate a quel ricorrente (ricId)
   * e rigenera solo le sue voci mensili. Le altre ricorrenti restano invariate.
   */
  async function applicaSingolaRicorrente(tipo, ricId) {
    const ric = getRicorrenti();
    const list = ric[tipo] || [];
    const r = list.find(function (x) {
      return x.id === ricId;
    });
    if (!r) return;
    const year = getCurrentYear();

    const speseAggiornate = getSpese(year);
    const entrateAggiornate = getEntrate(year);

    // Rimuovi le vecchie voci collegate SOLO a questo ricorrente
    for (let m = 0; m < 12; m++) {
      if (tipo === "uscite" && speseAggiornate[m]) {
        speseAggiornate[m] = speseAggiornate[m].filter(function (s) {
          return s.ricId !== ricId || s.stato === "eseguita";
        });
      }
      if (tipo === "entrate" && entrateAggiornate[m]) {
        entrateAggiornate[m] = entrateAggiornate[m].filter(function (e) {
          return e.ricId !== ricId;
        });
      }
    }

    // Rigenera le voci di questo ricorrente
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

    if (tipo === "uscite") {
      await saveSpese(year, speseAggiornate);
    } else {
      await saveEntrate(year, entrateAggiornate);
    }
  }

  async function aggiungiRicorrente() {
    const desc = ricDesc.value.trim();
    const importo = parseFloat(ricImporto.value);
    const tipo = ricTipo.value;
    const giorno = parseInt(ricGiorno.value) || 1;
    const dataInizio = ricDataInizio.value;
    const dataFine = ricDataFine.value;

    if (!desc) {
      await showAlert("Inserire una descrizione");
      return;
    }
    if (isNaN(importo) || importo <= 0) {
      await showAlert("Inserire un importo valido");
      return;
    }
    if (giorno < 1 || giorno > 31) {
      await showAlert("Il giorno deve essere tra 1 e 31");
      return;
    }
    if (!dataInizio) {
      await showAlert("Inserire una data di inizio");
      return;
    }
    if (!dataFine) {
      await showAlert("Inserire una data di fine");
      return;
    }
    if (dataFine < dataInizio) {
      await showAlert("La data fine deve essere dopo la data inizio");
      return;
    }

    showSpinner("Salvataggio in corso...");

    let ricId = null;
    const tipoDaApplicare = editingTipo && editingIdx >= 0 ? editingTipo : tipo;

    if (editingTipo && editingIdx >= 0) {
      // MODIFICA: aggiorna ricorrente esistente
      const lista = getRicorrenti()[editingTipo];
      if (lista && lista[editingIdx]) ricId = lista[editingIdx].id;
      await updateRicorrente(editingTipo, editingIdx, {
        descrizione: desc,
        importo: importo,
        giorno: giorno,
        dataInizio: dataInizio,
        dataFine: dataFine
      });
      annullaModifica();
    } else {
      // NUOVO: aggiungi ricorrente
      ricId = generaId("ric-" + (tipo === "entrate" ? "e" : "u"));
      await addRicorrente(tipo, {
        id: ricId,
        descrizione: desc,
        importo: importo,
        giorno: giorno,
        dataInizio: dataInizio,
        dataFine: dataFine
      });
      ricDesc.value = "";
      ricImporto.value = "";
      ricGiorno.value = "1";
    }

    // Applica subito al planning (solo la voce modificata/aggiunta)
    if (ricId) {
      await applicaSingolaRicorrente(tipoDaApplicare, ricId);
    }

    hideSpinner();

    renderRicorrenti();
    ricDesc.focus();
  }

  // =============================================
  // FORM HELPERS
  // =============================================

  function aggiornaTipoForm() {
    const form = document.querySelector(".programmazione-form");
    form.classList.remove("entrate-mode", "uscite-mode");
    form.classList.add(ricTipo.value + "-mode");
  }

  function popolaDescrizioniDaCategorie() {
    const tipo = ricTipo.value;
    const items = getCategorie()[tipo] || [];
    ricDesc.innerHTML = '<option value="">Seleziona una categoria...</option>';
    items.forEach((cat) => {
      const opt = document.createElement("option");
      opt.value = cat.descrizione;
      opt.textContent = cat.descrizione;
      ricDesc.appendChild(opt);
    });
  }

  // =============================================
  // INIT
  // =============================================

  const year = getCurrentYear();
  ricDataInizio.value = year + "-01";
  ricDataFine.value = year + "-12";
  ricTipo.value = "entrate";
  popolaDescrizioniDaCategorie();
  aggiornaTipoForm();
  renderRicorrenti();

  // ---- EVENTI ----
  addRicorrenteBtn.addEventListener("click", aggiungiRicorrente);
  ricTipo.addEventListener("change", function () {
    popolaDescrizioniDaCategorie();
    aggiornaTipoForm();
  });
  ricImporto.addEventListener("keypress", function (e) {
    if (e.key === "Enter") aggiungiRicorrente();
  });
  ricDesc.addEventListener("keypress", function (e) {
    if (e.key === "Enter") ricImporto.focus();
  });
  cancelRicBtn.addEventListener("click", function () {
    annullaModifica();
    renderRicorrenti();
  });
  deleteRicBtn.addEventListener("click", async function () {
    if (editingTipo === null || editingIdx < 0) return;
    const ric = getRicorrenti();
    const item = ric[editingTipo][editingIdx];
    if (!item) return;
    const confirmed = await showConfirm(
      `Eliminare "${item.descrizione}" dalle voci programmate?`
    );
    if (confirmed) {
      showSpinner("Eliminazione in corso...");
      await deleteRicorrente(editingTipo, editingIdx);
      // Rigenera il planning senza la ricorrente eliminata
      await applicaRicorrenti(getCurrentYear());
      annullaModifica();
      renderRicorrenti();
      hideSpinner();
    }
  });
  // applyRicBtn non più usato — l'applicazione è automatica su ogni Salva/Elimina
  applyRicBtn.style.display = "none";

  // Ri-render quando arrivano dati da Supabase
  window.addEventListener("dataReady", function () {
    popolaDescrizioniDaCategorie();
    renderRicorrenti();
  });
})();
