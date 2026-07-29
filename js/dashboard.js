/* =============================================
   DASHBOARD — Planning Grid & Modali
   ============================================= */

(function () {
  "use strict";

  let currentYear = getCurrentYear();
  let currentEntrateMonth = -1;

  // ---- REFERENCES DOM ----
  const grid = document.getElementById("planningGrid");
  const annoLabel = document.getElementById("annoLabel");
  const prevYearBtn = document.getElementById("prevYearBtn");
  const nextYearBtn = document.getElementById("nextYearBtn");

  // Modale entrate
  const entrateModal = document.getElementById("entrateModal");
  const entrateList = document.getElementById("entrateList");
  const entrateModalTitle = document.getElementById("entrateModalTitle");
  const closeEntrateModal = document.getElementById("closeEntrateModal");
  const newEntrataData = document.getElementById("newEntrataData");
  const newEntrataDesc = document.getElementById("newEntrataDesc");
  const newEntrataImporto = document.getElementById("newEntrataImporto");
  const addEntrataBtn = document.getElementById("addEntrataBtn");

  // Modale modifica
  const editModal = document.getElementById("editModal");
  const editDesc = document.getElementById("editDesc");
  const editData = document.getElementById("editData");
  const editStato = document.getElementById("editStato");
  const modalSaveBtn = document.getElementById("modalSaveBtn");
  const modalCancelBtn = document.getElementById("modalCancelBtn");
  const modalDeleteBtn = document.getElementById("modalDeleteBtn");
  const editModalTitle = document.getElementById("editModalTitle");
  const editImportoAttuale = document.getElementById("editImportoAttuale");
  const editAddImporto = document.getElementById("editAddImporto");
  const editImportoTotale = document.getElementById("editImportoTotale");
  const editImportiSection = document.getElementById("editImportiSection");
  const editNewImportoSection = document.getElementById(
    "editNewImportoSection"
  );
  const editRicorrenteSection = document.getElementById(
    "editRicorrenteSection"
  );
  const editStatoSection = document.getElementById("editStatoSection");
  const ricDeleteThis = document.getElementById("ricDeleteThis");
  const ricDeleteRangeBtn = document.getElementById("ricDeleteRangeBtn");
  const ricRangeModal = document.getElementById("ricRangeModal");
  const ricRangeDa = document.getElementById("ricRangeDa");
  const ricRangeA = document.getElementById("ricRangeA");
  const ricRangeConfirm = document.getElementById("ricRangeConfirm");
  const ricRangeClose = document.getElementById("ricRangeClose");
  const ricRangeCancel = document.getElementById("ricRangeCancel");
  const ricDeleteAll = document.getElementById("ricDeleteAll");

  let currentEditMonthIdx = -1;
  let currentEditExpenseId = null;
  let isAddingNewExpense = false;
  let isEditingEntrata = false;

  // =============================================
  // RENDER
  // =============================================

  function renderPlanning() {
    grid.innerHTML = "";
    const meseAttuale = getMeseCorrente(currentYear);
    for (let row = 0; row < 3; row++) {
      const rowDiv = document.createElement("div");
      rowDiv.className = "row-months";
      const start = row * 4;
      const end = Math.min(start + 4, 12);
      for (let m = start; m < end; m++) {
        const card = createMonthCard(m, meseAttuale);
        rowDiv.appendChild(card);
      }
      grid.appendChild(rowDiv);
    }
    attachDragDrop();
    annoLabel.textContent = currentYear;
    aggiornaRiepilogoAnnuale();
  }

  function aggiornaRiepilogoAnnuale() {
    let totaleEntrate = 0;
    let totaleUscite = 0;
    for (let m = 0; m < 12; m++) {
      const entrate = getEntrateMese(currentYear, m);
      totaleEntrate += entrate.reduce((sum, e) => sum + e.importo, 0);
      const spese = getSpeseMese(currentYear, m);
      totaleUscite += spese.reduce((sum, s) => sum + s.importo, 0);
    }
    const saldo = totaleEntrate - totaleUscite;
    document.getElementById("riepEntrate").innerHTML =
      `<i class="fas fa-arrow-up"></i> ${formatEuro(totaleEntrate)}`;
    document.getElementById("riepUscite").innerHTML =
      `<i class="fas fa-arrow-down"></i> ${formatEuro(totaleUscite)}`;
    const riepSaldo = document.getElementById("riepSaldo");
    const isNegativo = saldo < 0;
    const iconaSaldo = isNegativo
      ? "fa-exclamation-triangle"
      : "fa-check-circle";
    riepSaldo.innerHTML = `<i class="fas ${iconaSaldo}"></i> ${formatEuro(saldo)}`;
    riepSaldo.className = "riep-item saldo" + (isNegativo ? " negative" : "");
  }

  function createMonthCard(meseIndex, meseAttuale) {
    const card = document.createElement("div");
    card.className = "month-card";
    if (meseIndex === meseAttuale) {
      card.classList.add("current-month");
    }
    card.dataset.month = meseIndex;

    const speseOriginali = getSpeseMese(currentYear, meseIndex);
    const speseOrdinate = ordinaSpese(speseOriginali, DATA_RIFERIMENTO);
    const totaleUscite = speseOrdinate.reduce((sum, s) => sum + s.importo, 0);

    const entrate = getEntrateMese(currentYear, meseIndex);
    const totaleEntrate = entrate.reduce((sum, e) => sum + e.importo, 0);

    const bilancio = totaleEntrate - totaleUscite;
    const isNegative = bilancio < 0;
    const iconClass = isNegative ? "fa-arrow-down" : "fa-arrow-up";
    const negClass = isNegative ? " negative" : "";

    // Header
    const header = document.createElement("div");
    header.className = "month-header";
    header.innerHTML = `
      <span class="month-title">
        Prospetto mese di: ${MESI[meseIndex]}
        <button class="add-expense-btn" data-month="${meseIndex}" title="Nuova spesa">
          <i class="fas fa-plus-circle"></i>
        </button>
      </span>
      <span class="total-entrate${negClass}" data-month="${meseIndex}">
        <i class="fas ${iconClass}"></i> Entrate: ${formatEuro(totaleEntrate)}
      </span>
    `;

    header
      .querySelector(".total-entrate")
      .addEventListener("click", function (e) {
        e.stopPropagation();
        openEntrateModal(meseIndex);
      });
    header
      .querySelector(".add-expense-btn")
      .addEventListener("click", function (e) {
        e.stopPropagation();
        openNewExpenseModal(meseIndex);
      });

    card.appendChild(header);

    // Lista spese
    const list = document.createElement("div");
    list.className = "expense-list";
    list.dataset.month = meseIndex;

    if (speseOrdinate.length === 0) {
      const empty = document.createElement("div");
      empty.className = "empty-month";
      empty.textContent = "Nessuna spesa";
      list.appendChild(empty);
    } else {
      speseOrdinate.forEach((spesa) => {
        const item = createExpenseItem(spesa, meseIndex);
        list.appendChild(item);
      });
    }
    card.appendChild(list);

    // Totale
    const totalDiv = document.createElement("div");
    totalDiv.className = "month-total";
    totalDiv.innerHTML = `
      <span>Totale Uscite</span>
      <span>${formatEuro(totaleUscite)}</span>
    `;
    card.appendChild(totalDiv);

    return card;
  }

  function createExpenseItem(spesa, meseIndex) {
    const div = document.createElement("div");
    div.className = `expense-item status-${spesa.stato}`;
    div.draggable = true;
    div.dataset.expenseId = spesa.id;
    div.dataset.month = meseIndex;

    const dataStr = formatDataBreve(spesa.data);
    const statoLabel =
      spesa.stato.charAt(0).toUpperCase() + spesa.stato.slice(1);

    div.innerHTML = `
      <span class="data-text">${dataStr}</span>
      <span class="desc">${spesa.descrizione}</span>
      <span class="importo">${formatEuro(spesa.importo)}</span>
      <span class="badge-stato ${spesa.stato}">${statoLabel}</span>
    `;

    // Click sulla riga -> modifica
    div.addEventListener("click", function (e) {
      openEditModal(meseIndex, spesa.id);
    });

    // Drag & drop
    div.addEventListener("dragstart", function (e) {
      e.dataTransfer.setData(
        "text/plain",
        JSON.stringify({ expenseId: spesa.id, fromMonth: meseIndex })
      );
      div.classList.add("dragging");
    });
    div.addEventListener("dragend", function () {
      div.classList.remove("dragging");
    });
    div.addEventListener("dragover", function (e) {
      e.preventDefault();
      div.classList.add("drag-over");
    });
    div.addEventListener("dragleave", function () {
      div.classList.remove("drag-over");
    });
    div.addEventListener("drop", function (e) {
      e.preventDefault();
      div.classList.remove("drag-over");
      const raw = e.dataTransfer.getData("text/plain");
      if (!raw) return;
      try {
        const data = JSON.parse(raw);
        if (data.fromMonth === meseIndex) return;
        moveSpesa(
          data.expenseId,
          currentYear,
          data.fromMonth,
          currentYear,
          meseIndex
        );
        renderPlanning();
      } catch (err) {
        console.warn("drop error", err);
      }
    });

    return div;
  }

  // =============================================
  // ENTRATE MODAL
  // =============================================

  function openEntrateModal(meseIndex) {
    currentEntrateMonth = meseIndex;
    entrateModalTitle.textContent = `${MESI[meseIndex]} ${currentYear}`;
    const defaultDate = `${currentYear}-${String(meseIndex + 1).padStart(2, "0")}-15`;
    newEntrataData.value = defaultDate;
    popolaSelectCategorie("newEntrataDesc", "entrate");
    renderEntrateList();
    entrateModal.classList.add("active");
    newEntrataDesc.value = "";
    newEntrataImporto.value = "";
    newEntrataDesc.focus();
  }

  function renderEntrateList() {
    const entrate = getEntrateMese(currentYear, currentEntrateMonth);
    entrateList.innerHTML = "";
    if (entrate.length === 0) {
      entrateList.innerHTML =
        '<div class="empty-entrate">Nessuna entrata registrata</div>';
      return;
    }
    entrate.forEach((e) => {
      const item = document.createElement("div");
      item.className = "entrata-item";
      item.style.cursor = "pointer";
      const dataStr = formatDataBreve(e.data);
      item.innerHTML = `
        <span class="entrata-data">${dataStr}</span>
        <span class="entrata-desc">${e.descrizione}</span>
        <span class="entrata-importo">${formatEuro(e.importo)}</span>
      `;
      item.addEventListener("click", function () {
        openEditEntrataModal(currentEntrateMonth, e.id);
      });
      entrateList.appendChild(item);
    });
  }

  async function aggiungiEntrataManuale() {
    const data = newEntrataData.value;
    const desc = newEntrataDesc.value.trim();
    const importo = parseFloat(newEntrataImporto.value);

    if (!data) {
      await showAlert("Inserire una data");
      return;
    }
    if (!desc) {
      await showAlert("Inserire una descrizione");
      return;
    }
    if (isNaN(importo) || importo <= 0) {
      await showAlert("Inserire un importo valido");
      return;
    }

    addEntrata(currentYear, currentEntrateMonth, {
      id: generaId("entrata"),
      data: data,
      descrizione: desc,
      importo: importo
    });

    renderEntrateList();
    renderPlanning();
    newEntrataDesc.value = "";
    newEntrataImporto.value = "";
    newEntrataDesc.focus();
  }

  // =============================================
  // EDIT MODAL
  // =============================================

  function openEditEntrataModal(monthIdx, entrataId) {
    const all = getEntrateMese(currentYear, monthIdx);
    const entrata = all.find((e) => e.id === entrataId);
    if (!entrata) return;
    isEditingEntrata = true;
    isAddingNewExpense = false;
    currentEditMonthIdx = monthIdx;
    currentEditExpenseId = entrataId;
    editModalTitle.textContent = "Modifica entrata";
    modalDeleteBtn.style.display = "";
    popolaSelectCategorie("editDesc", "entrate");
    editDesc.value = entrata.descrizione;
    editNewImportoSection.style.display = "none";
    editImportiSection.style.display = "block";
    editImportoAttuale.textContent = formatEuro(entrata.importo);
    editAddImporto.value = "";
    aggiornaTotale();
    editData.value = entrata.data;
    // Nascondi stato per entrate
    editStatoSection.style.display = "none";
    // Mostra sezione ricorrente se ha ricId
    if (entrata.ricId) {
      editRicorrenteSection.style.display = "block";
    } else {
      editRicorrenteSection.style.display = "none";
    }
    editModal.classList.add("active");
    editDesc.focus();
  }

  function openNewExpenseModal(meseIndex) {
    isAddingNewExpense = true;
    isEditingEntrata = false;
    currentEditMonthIdx = meseIndex;
    currentEditExpenseId = null;
    editModalTitle.textContent = "Nuova spesa";
    modalDeleteBtn.style.display = "none";
    popolaSelectCategorie("editDesc", "uscite");
    editDesc.value = "";
    // Per nuove spese: mostra importo normale, nascondi sezione aggiunta
    editNewImportoSection.style.display = "block";
    editImportiSection.style.display = "none";
    // Resetta campi importo
    editImportoAttuale.textContent = formatEuro(0);
    editAddImporto.value = "";
    editImportoTotale.textContent = formatEuro(0);
    // Nascondi sezione ricorrente
    editRicorrenteSection.style.display = "none";
    // Data default = primo giorno del mese selezionato
    editData.value = `${currentYear}-${String(meseIndex + 1).padStart(2, "0")}-01`;
    editStato.value = "preventivata";
    editModal.classList.add("active");
    editDesc.focus();
  }

  function openEditModal(monthIdx, expenseId) {
    const all = getSpeseMese(currentYear, monthIdx);
    const spesa = all.find((s) => s.id === expenseId);
    if (!spesa) return;
    currentEditMonthIdx = monthIdx;
    currentEditExpenseId = expenseId;
    isAddingNewExpense = false;
    isEditingEntrata = false;
    editModalTitle.textContent = "Modifica spesa";
    modalDeleteBtn.style.display = "";
    popolaSelectCategorie("editDesc", "uscite");
    editDesc.value = spesa.descrizione;
    // Nascondi nuovo-importo, mostra sezione aggiunta
    editNewImportoSection.style.display = "none";
    editImportiSection.style.display = "block";
    editImportoAttuale.textContent = formatEuro(spesa.importo);
    editAddImporto.value = "";
    aggiornaTotale();
    editStatoSection.style.display = "block";
    // Mostra opzioni ricorrente solo per spese create dai Ricorrenti
    if (spesa.stato === "preventivata" && spesa.ricId) {
      editRicorrenteSection.style.display = "block";
    } else {
      editRicorrenteSection.style.display = "none";
    }
    editData.value = spesa.data;
    editStato.value = spesa.stato;
    editModal.classList.add("active");
  }

  function closeEditModal() {
    editModal.classList.remove("active");
    currentEditMonthIdx = -1;
    currentEditExpenseId = null;
    isAddingNewExpense = false;
    isEditingEntrata = false;
  }

  function aggiornaTotale() {
    const testo = editImportoAttuale.textContent
      .replace("€ ", "")
      .replace(/\./g, "")
      .replace(",", ".");
    const importoAttuale = parseFloat(testo) || 0;
    const addImporto = parseFloat(editAddImporto.value) || 0;
    editImportoTotale.textContent = formatEuro(importoAttuale + addImporto);
  }

  async function saveExpense() {
    if (currentEditMonthIdx === -1) return;
    const nuovaDesc = editDesc.value.trim() || "Senza descrizione";
    const nuovaData = editData.value;
    const nuovoStato = editStato.value;

    if (!nuovaData) {
      await showAlert("Inserire una data");
      return;
    }

    if (isAddingNewExpense) {
      const nuovoImporto = parseFloat(
        document.getElementById("editImporto").value
      );
      if (isNaN(nuovoImporto) || nuovoImporto <= 0) {
        await showAlert("Inserire un importo valido");
        return;
      }
      addSpesa(currentYear, currentEditMonthIdx, {
        id: generaId("spesa"),
        data: nuovaData,
        descrizione: nuovaDesc,
        importo: nuovoImporto,
        stato: nuovoStato
      });
      renderPlanning();
      closeEditModal();
      return;
    }

    if (!currentEditExpenseId) return;

    const addImporto = parseFloat(editAddImporto.value) || 0;

    if (isEditingEntrata) {
      // MODIFICA ENTRATA
      const all = getEntrateMese(currentYear, currentEditMonthIdx);
      const entrata = all.find((e) => e.id === currentEditExpenseId);
      if (!entrata) return;
      const nuovoImporto = entrata.importo + addImporto;
      updateEntrata(currentYear, currentEditMonthIdx, currentEditExpenseId, {
        descrizione: nuovaDesc,
        importo: nuovoImporto,
        data: nuovaData
      });
    } else {
      // MODIFICA SPESA
      const all = getSpeseMese(currentYear, currentEditMonthIdx);
      const spesa = all.find((s) => s.id === currentEditExpenseId);
      if (!spesa) return;
      const nuovoImporto = spesa.importo + addImporto;
      updateSpesa(currentYear, currentEditMonthIdx, currentEditExpenseId, {
        descrizione: nuovaDesc,
        importo: nuovoImporto,
        data: nuovaData,
        stato: nuovoStato
      });
    }
    renderPlanning();
    closeEditModal();
  }

  async function deleteFromModal() {
    if (
      isAddingNewExpense ||
      currentEditMonthIdx === -1 ||
      !currentEditExpenseId
    )
      return;
    const label = isEditingEntrata ? "entrata" : "spesa";
    const confirmed = await showConfirm(`Eliminare questa ${label}?`);
    if (confirmed) {
      if (isEditingEntrata) {
        deleteEntrata(currentYear, currentEditMonthIdx, currentEditExpenseId);
      } else {
        deleteSpesa(currentYear, currentEditMonthIdx, currentEditExpenseId);
      }
      renderPlanning();
      closeEditModal();
    }
  }

  // =============================================
  // DRAG & DROP
  // =============================================

  function attachDragDrop() {
    document.querySelectorAll(".month-card").forEach((card) => {
      card.addEventListener("dragover", function (e) {
        e.preventDefault();
      });
      card.addEventListener("drop", function (e) {
        e.preventDefault();
      });
    });
  }

  // =============================================
  // YEAR NAVIGATION
  // =============================================

  function changeYear(delta) {
    currentYear += delta;
    setCurrentYear(currentYear);
    // Assicura che i dati esistano per il nuovo anno
    getSpese(currentYear);
    getEntrate(currentYear);
    renderPlanning();
  }

  // =============================================
  // EVENTI
  // =============================================

  prevYearBtn.addEventListener("click", function () {
    changeYear(-1);
  });
  nextYearBtn.addEventListener("click", function () {
    changeYear(1);
  });

  // Modale entrate
  closeEntrateModal.addEventListener("click", function () {
    entrateModal.classList.remove("active");
  });
  entrateModal.addEventListener("click", function (e) {
    if (e.target === entrateModal) entrateModal.classList.remove("active");
  });
  addEntrataBtn.addEventListener("click", aggiungiEntrataManuale);
  newEntrataImporto.addEventListener("keypress", function (e) {
    if (e.key === "Enter") aggiungiEntrataManuale();
  });
  newEntrataDesc.addEventListener("keypress", function (e) {
    if (e.key === "Enter") newEntrataImporto.focus();
  });

  // Modale modifica
  modalSaveBtn.addEventListener("click", saveExpense);
  modalCancelBtn.addEventListener("click", closeEditModal);
  modalDeleteBtn.addEventListener("click", deleteFromModal);
  // Calcolo totale in tempo reale
  editAddImporto.addEventListener("input", aggiornaTotale);

  // ---- GESTIONE RICORRENTI ----
  ricDeleteThis.addEventListener("click", async function () {
    if (currentEditMonthIdx === -1 || !currentEditExpenseId) return;
    const confirmed = await showConfirm("Eliminare solo questa ricorrenza?");
    if (confirmed) {
      if (isEditingEntrata) {
        deleteEntrata(currentYear, currentEditMonthIdx, currentEditExpenseId);
      } else {
        deleteSpesa(currentYear, currentEditMonthIdx, currentEditExpenseId);
      }
      renderPlanning();
      closeEditModal();
    }
  });

  ricDeleteRangeBtn.addEventListener("click", function () {
    const year = currentYear;
    ricRangeDa.value = year + "-01";
    ricRangeA.value = year + "-12";
    ricRangeModal.classList.add("active");
  });

  ricRangeClose.addEventListener("click", function () {
    ricRangeModal.classList.remove("active");
  });
  ricRangeCancel.addEventListener("click", function () {
    ricRangeModal.classList.remove("active");
  });
  ricRangeModal.addEventListener("click", function (e) {
    if (e.target === ricRangeModal) ricRangeModal.classList.remove("active");
  });

  ricRangeConfirm.addEventListener("click", async function () {
    if (currentEditMonthIdx === -1 || !currentEditExpenseId) return;
    const da = ricRangeDa.value;
    const a = ricRangeA.value;
    if (!da || !a) {
      await showAlert("Seleziona un intervallo");
      return;
    }
    if (a < da) {
      await showAlert("La data fine deve essere dopo la data inizio");
      return;
    }

    const getList = isEditingEntrata ? getEntrateMese : getSpeseMese;
    const deleteItem = isEditingEntrata ? deleteEntrata : deleteSpesa;
    const label = isEditingEntrata ? "entrate" : "spese";

    const all = getList(currentYear, currentEditMonthIdx);
    const item = all.find((s) => s.id === currentEditExpenseId);
    if (!item || !item.ricId) return;
    const ricId = item.ricId;

    const daMese = parseInt(da.split("-")[1]) - 1;
    const aMese = parseInt(a.split("-")[1]) - 1;

    const confirmed = await showConfirm(
      `Eliminare tutte le ricorrenze di "${item.descrizione}" dal mese ${daMese + 1} al mese ${aMese + 1}?`
    );
    if (confirmed) {
      for (let m = daMese; m <= aMese; m++) {
        const lista = getList(currentYear, m);
        const daEliminare = lista.filter((s) => s.ricId === ricId);
        for (const s of daEliminare) {
          deleteItem(currentYear, m, s.id);
        }
      }
      ricRangeModal.classList.remove("active");
      renderPlanning();
      closeEditModal();
    }
  });

  ricDeleteAll.addEventListener("click", async function () {
    if (currentEditMonthIdx === -1 || !currentEditExpenseId) return;
    const getList = isEditingEntrata ? getEntrateMese : getSpeseMese;
    const deleteItem = isEditingEntrata ? deleteEntrata : deleteSpesa;

    const all = getList(currentYear, currentEditMonthIdx);
    const item = all.find((s) => s.id === currentEditExpenseId);
    if (!item || !item.ricId) return;
    const ricId = item.ricId;

    const confirmed = await showConfirm(
      `Eliminare TUTTE le ricorrenze di "${item.descrizione}" dall'intero anno?`
    );
    if (confirmed) {
      for (let m = 0; m < 12; m++) {
        const lista = getList(currentYear, m);
        const daEliminare = lista.filter((s) => s.ricId === ricId);
        for (const s of daEliminare) {
          deleteItem(currentYear, m, s.id);
        }
      }
      renderPlanning();
      closeEditModal();
    }
  });

  // =============================================
  // INIT
  // =============================================

  // Assicura che i dati esistano (array vuoti)
  getSpese(currentYear);
  getEntrate(currentYear);
  renderPlanning();

  // Ri-render quando arrivano dati da Supabase
  window.addEventListener("dataReady", renderPlanning);
})();
