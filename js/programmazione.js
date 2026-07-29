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
  const applyRicBtn = document.getElementById("applyRicBtn");

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

      item.innerHTML = `
        <span class="ric-desc">${ric.descrizione}</span>
        <span class="ric-importo">${formatEuro(ric.importo)}</span>
        <span class="ric-periodo">${periodo}</span>
      `;

      // Click sulla riga -> carica nei campi per modifica/elimina
      const avviaModifica = function () {
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
        ricDataInizio.value = ric.dataInizio;
        ricDataFine.value = ric.dataFine;
        aggiornaTipoForm();
        addRicorrenteBtn.innerHTML = '<i class="fas fa-save"></i> Aggiorna';
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
    addRicorrenteBtn.innerHTML = '<i class="fas fa-plus"></i> Aggiungi';
    cancelRicBtn.style.display = "none";
    deleteRicBtn.style.display = "none";
    ricDesc.value = "";
    ricImporto.value = "";
    const year = getCurrentYear();
    ricDataInizio.value = year + "-01";
    ricDataFine.value = year + "-12";
    ricTipo.value = "entrate";
    popolaDescrizioniDaCategorie();
    aggiornaTipoForm();
  }

  async function aggiungiRicorrente() {
    const desc = ricDesc.value.trim();
    const importo = parseFloat(ricImporto.value);
    const tipo = ricTipo.value;
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

    if (editingTipo && editingIdx >= 0) {
      // MODIFICA: aggiorna ricorrente esistente
      updateRicorrente(editingTipo, editingIdx, {
        descrizione: desc,
        importo: importo,
        dataInizio: dataInizio,
        dataFine: dataFine
      });
      annullaModifica();
    } else {
      // NUOVO: aggiungi ricorrente
      addRicorrente(tipo, {
        id: generaId("ric-" + (tipo === "entrate" ? "e" : "u")),
        descrizione: desc,
        importo: importo,
        dataInizio: dataInizio,
        dataFine: dataFine
      });
      ricDesc.value = "";
      ricImporto.value = "";
    }

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
  // APPLY
  // =============================================

  function applicaESalva() {
    const year = getCurrentYear();
    applicaRicorrenti(year);
    // Redirect alla dashboard
    window.location.href = "index.html";
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
      deleteRicorrente(editingTipo, editingIdx);
      annullaModifica();
      renderRicorrenti();
    }
  });
  applyRicBtn.addEventListener("click", applicaESalva);

  // Ri-render quando arrivano dati da Supabase
  window.addEventListener("dataReady", function () {
    popolaDescrizioniDaCategorie();
    renderRicorrenti();
  });
})();
