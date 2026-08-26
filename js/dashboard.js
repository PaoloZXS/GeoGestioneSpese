/* =============================================
   DASHBOARD — Planning Grid & Modali
   ============================================= */

(function () {
  "use strict";

  let currentYear = getCurrentYear();

  // ---- REFERENCES DOM ----
  const grid = document.getElementById("planningGrid");
  const annoLabel = document.getElementById("annoLabel");
  const prevYearBtn = document.getElementById("prevYearBtn");
  const nextYearBtn = document.getElementById("nextYearBtn");

  // Modale gruppo spese (voci aggregate)
  const gruppoModal = document.getElementById("gruppoModal");
  const gruppoModalTitle = document.getElementById("gruppoModalTitle");
  const gruppoList = document.getElementById("gruppoList");
  const gruppoEditor = document.getElementById("gruppoEditor");
  const gruppoDelBtn = document.getElementById("gruppoDelBtn");
  const gruppoSaveBtn = document.getElementById("gruppoSaveBtn");
  const closeGruppoModal = document.getElementById("closeGruppoModal");

  // Modale modifica
  const editModal = document.getElementById("editModal");
  const editDesc = document.getElementById("editDesc");
  const editData = document.getElementById("editData");
  const editStato = document.getElementById("editStato");
  const modalSaveBtn = document.getElementById("modalSaveBtn");
  const modalCancelBtn = document.getElementById("modalCancelBtn");
  const modalDeleteBtn = document.getElementById("modalDeleteBtn");
  const editModalTitle = document.getElementById("editModalTitle");
  const editAddImporto = document.getElementById("editAddImporto");
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
  let currentEntryTipo = "uscita"; // tipo della voce in creazione: 'entrata' | 'uscita'
  let currentGruppoMonthIdx = -1;
  let carouselMonthIndex = 0;
  let currentGruppoIds = [];
  let currentGruppoSelectedId = null;
  // Riferimenti ai campi dell'editor gruppo (costruiti una sola volta)
  let gruppoEditorHint = null;
  let gruppoDescSel = null;
  let gruppoDataInput = null;
  let gruppoImportoInput = null;
  let gruppoStatoSel = null;

  // =============================================
  // RENDER
  // =============================================

  function renderPlanning() {
    grid.innerHTML = "";
    const meseAttuale = getMeseCorrente(currentYear);
    carouselMonthIndex = meseAttuale;

    const shell = document.createElement("div");
    shell.className = "month-carousel-shell";

    const viewport = document.createElement("div");
    viewport.className = "month-scroll-viewport";

    const track = document.createElement("div");
    track.className = "month-track";
    for (let m = 0; m < 12; m++) {
      track.appendChild(createMonthCard(m, meseAttuale));
    }
    viewport.appendChild(track);
    shell.appendChild(viewport);
    grid.appendChild(shell);

    const prevBtn = document.querySelector(".month-nav-btn.prev");
    const nextBtn = document.querySelector(".month-nav-btn.next");

    if (prevBtn && nextBtn) {
      prevBtn.onclick = function () {
        carouselMonthIndex = Math.max(0, carouselMonthIndex - 1);
        const target = track.children[carouselMonthIndex];
        if (!target) return;
        viewport.scrollTo({
          left: target.offsetLeft - (viewport.clientWidth - target.offsetWidth) / 2,
          behavior: "smooth"
        });
      };

      nextBtn.onclick = function () {
        carouselMonthIndex = Math.min(11, carouselMonthIndex + 1);
        const target = track.children[carouselMonthIndex];
        if (!target) return;
        viewport.scrollTo({
          left: target.offsetLeft - (viewport.clientWidth - target.offsetWidth) / 2,
          behavior: "smooth"
        });
      };
    }

    attachDragDrop();
    annoLabel.textContent = currentYear;
    aggiornaRiepilogoAnnuale();

    requestAnimationFrame(() => {
      const currentCard = track.querySelector(`.month-card[data-month="${meseAttuale}"]`);
      if (!currentCard) return;
      viewport.scrollTo({
        left: Math.max(0, currentCard.offsetLeft - (viewport.clientWidth - currentCard.offsetWidth) / 2),
        behavior: "auto"
      });
    });
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

  function createMonthEntryItem(entry, meseIndex) {
    const tipo = entry.tipo || "uscita";
    const stato = (entry.stato || "preventivata").toLowerCase();
    const icone = {
      scaduta: "fa-exclamation-triangle",
      preventivata: "fa-clock",
      eseguita: "fa-check"
    };
    const icona = icone[stato] || "fa-circle";

    const div = document.createElement("div");
    div.className = `expense-item ${tipo === "entrata" ? "entrata-row" : "uscita-row"}`;
    div.dataset.type = tipo;
    div.dataset.id = entry.id;
    div.dataset.month = meseIndex;

    const amount = formatEuro(entry.importo);
    const entrataAmount = tipo === "entrata" ? `+${amount}` : "";
    const uscitaAmount = tipo === "uscita" ? `-${amount}` : "";

    div.innerHTML = `
      <span class="desc"><i class="fas ${icona} entry-icon status-${stato}"></i>${entry.descrizione}</span>
      <span class="importo entrata">${entrataAmount}</span>
      <span class="importo uscita">${uscitaAmount}</span>
    `;

    attachDrag(div, tipo, entry.id, meseIndex);
    return div;
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

    const saldo = totaleEntrate - totaleUscite;
    const saldoClasse = saldo >= 0 ? "positivo" : "negativo";
    const segnoSaldo = saldo >= 0 ? "+" : "-";
    const saldoHeader = `${segnoSaldo}${formatEuro(Math.abs(saldo))}`;

    const header = document.createElement("div");
    header.className = "month-header";
    header.innerHTML = `
      <span class="month-title">
        <span class="month-title-text">${MESI[meseIndex]}</span>
        <span class="month-saldo ${saldoClasse}">${saldoHeader}</span>
      </span>
      <span class="month-header-right">
        <button class="add-entrata-btn" data-month="${meseIndex}" title="Nuova entrata">
          <i class="fas fa-arrow-up"></i>
        </button>
        <button class="add-expense-btn" data-month="${meseIndex}" title="Nuova spesa">
          <i class="fas fa-arrow-down"></i>
        </button>
      </span>
    `;

    header
      .querySelector(".add-entrata-btn")
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

    const list = document.createElement("div");
    list.className = "expense-list";
    list.dataset.month = meseIndex;

    const statoPriorita = { scaduta: 0, preventivata: 1, eseguita: 2 };
    const entries = [
      ...speseOrdinate.map((item) => ({ ...item, tipo: "uscita", stato: item.stato || "preventivata" })),
      ...entrate.map((item) => ({ ...item, tipo: "entrata", stato: item.stato || "preventivata" }))
    ].sort((a, b) => {
      // Prima tutte le USCITE, poi tutte le ENTRATE
      const ordTipo = (t) => (t === "uscita" ? 0 : 1);
      if (ordTipo(a.tipo) !== ordTipo(b.tipo)) return ordTipo(a.tipo) - ordTipo(b.tipo);
      // Tra le USCITE: scadute -> preventivate -> eseguite, poi per data
      if (a.tipo === "uscita") {
        const pa = statoPriorita[a.stato] ?? 99;
        const pb = statoPriorita[b.stato] ?? 99;
        if (pa !== pb) return pa - pb;
      }
      const da = a.data ? new Date(a.data + "T12:00:00").getTime() : 0;
      const db = b.data ? new Date(b.data + "T12:00:00").getTime() : 0;
      return da - db;
    });

    if (entries.length === 0) {
      const empty = document.createElement("div");
      empty.className = "empty-month";
      empty.textContent = "Nessuna voce";
      list.appendChild(empty);
    } else {
      entries.forEach((entry) => {
        list.appendChild(createMonthEntryItem(entry, meseIndex));
      });
    }

    card.appendChild(list);

    const totalDiv = document.createElement("div");
    totalDiv.className = "month-total";
    totalDiv.innerHTML = `
      <span class="mt-desc">Totali</span>
      <span class="mt-entrate">${formatEuro(totaleEntrate)}</span>
      <span class="mt-uscite">${formatEuro(totaleUscite)}</span>
    `;
    card.appendChild(totalDiv);

    return card;
  }

  /**
   * Raggruppa le spese per stato (eseguita, preventivata, scaduta).
   * Ogni gruppo contiene tutte le voci dello stesso stato.
   */
  function raggruppaEntrate(entrate) {
    const mappa = new Map();
    for (const e of entrate) {
      const key = e.stato || "preventivata";
      if (!mappa.has(key)) mappa.set(key, []);
      mappa.get(key).push(e);
    }
    return Array.from(mappa.values());
  }

  function raggruppaSpese(spese) {
    const mappa = new Map();
    for (const s of spese) {
      const key = s.stato;
      if (!mappa.has(key)) mappa.set(key, []);
      mappa.get(key).push(s);
    }
    return Array.from(mappa.values());
  }

  /**
   * Crea una sezione espandibile per un gruppo di spese dello stesso stato.
   * La riga principale espande/contrae il contenitore figlio; le righe figlie
   * mantengono il comportamento di modifica standard.
   */
  function createExpenseGroupItem(gruppo, meseIndex) {
    const stato = gruppo[0].stato;
    const totale = gruppo.reduce((s, x) => s + x.importo, 0);
    const statoLabel = (stato || "preventivata").toUpperCase();

    const wrapper = document.createElement("div");
    wrapper.className = "expense-group-wrapper";
    wrapper.dataset.month = meseIndex;

    const header = document.createElement("div");
    header.className = `expense-item uscita-row status-${stato} expandable`;
    header.dataset.type = "uscita-group";
    header.dataset.month = meseIndex;
    header.dataset.stato = stato;

    header.innerHTML = `
      <span class="desc group-label">
        <span class="group-type-pill uscita">USCITE</span>
        <span class="group-state-pill status-${stato}">${statoLabel}</span>
      </span>
      <span class="importo entrata"></span>
      <span class="importo uscita">${formatEuro(totale)}</span>
    `;

    header.addEventListener("click", function (e) {
      e.stopPropagation();
      const parent = header.closest(".expense-group-wrapper");
      if (!parent) return;
      const expanded = parent.classList.toggle("expanded");
      const children = parent.querySelector(".expense-children");
      if (children) {
        children.style.display = expanded ? "flex" : "none";
      }
    });

    const children = document.createElement("div");
    children.className = "expense-children";
    children.style.display = "none";

    gruppo.forEach((spesa) => {
      const child = createExpenseItem(spesa, meseIndex);
      child.classList.add("child");
      child.dataset.type = "uscita";
      child.classList.remove("merged");
      children.appendChild(child);
    });

    wrapper.appendChild(header);
    wrapper.appendChild(children);
    return wrapper;
  }

  // ---- MODALE GRUPPO (dettaglio voci aggregate) ----

  function openGruppoModal(monthIdx, ids) {
    currentGruppoMonthIdx = monthIdx;
    currentGruppoIds = ids;
    currentGruppoSelectedId = null;
    renderGruppoModal();
  }

  function renderGruppoModal() {
    const all = getSpeseMese(currentYear, currentGruppoMonthIdx);
    const voci = all.filter((s) => currentGruppoIds.includes(s.id));
    if (voci.length === 0) {
      gruppoModal.classList.remove("active");
      return;
    }
    const prima = voci[0];
    const statoLabel =
      prima.stato.charAt(0).toUpperCase() + prima.stato.slice(1);
    gruppoModalTitle.textContent = `${prima.descrizione} · ${statoLabel}`;

    // Se la selezione corrente non esiste più (es. voce eliminata),
    // azzerala: nessuna voce preselezionata, l'utente sceglie dalla lista
    if (
      currentGruppoSelectedId &&
      !voci.some((v) => v.id === currentGruppoSelectedId)
    ) {
      currentGruppoSelectedId = null;
    }

    // ---- COLONNA SINISTRA: elenco voci ----
    gruppoList.innerHTML = "";
    voci.forEach((v) => {
      const row = document.createElement("div");
      row.className = "gruppo-item";
      row.dataset.voceId = v.id;
      if (v.id === currentGruppoSelectedId) row.classList.add("selected");
      const dataStr = formatDataBreve(v.data);
      row.innerHTML = `
        <span class="gruppo-data">${dataStr}</span>
        <span class="gruppo-importo">${formatEuro(v.importo)}</span>
      `;
      // Click: aggiorna SOLO la selezione (nessun refresh dell'intero modale)
      row.addEventListener("click", function () {
        currentGruppoSelectedId = v.id;
        selezionaVoceGruppo();
      });
      gruppoList.appendChild(row);
    });

    // ---- COLONNA DESTRA: form della voce selezionata ----
    if (gruppoEditor.children.length === 0) {
      buildGruppoEditor();
    }
    aggiornaGruppoEditor(voci.find((v) => v.id === currentGruppoSelectedId));
    gruppoModal.classList.add("active");
  }

  /**
   * Aggiorna solo la riga selezionata e i valori dell'editor, senza
   * ricostruire il modale (evita "refresh"/riposizionamento al click).
   */
  function selezionaVoceGruppo() {
    // Sposta l'evidenziazione tra le righe della lista
    gruppoList.querySelectorAll(".gruppo-item").forEach((row) => {
      row.classList.toggle(
        "selected",
        row.dataset.voceId === currentGruppoSelectedId
      );
    });
    // Aggiorna SOLO i valori dell'editor (struttura già costruita)
    const all = getSpeseMese(currentYear, currentGruppoMonthIdx);
    const voce = all.find((s) => s.id === currentGruppoSelectedId);
    aggiornaGruppoEditor(voce);
  }

  /**
   * Costruisce UNA SOLA VOLTA la struttura del form (hint + label + select).
   * La struttura resta fissa: al click vengono aggiornati solo i valori.
   */
  function buildGruppoEditor() {
    gruppoEditor.innerHTML = "";

    // Hint (sempre presente, visibile solo senza selezione)
    const hint = document.createElement("p");
    hint.className = "gruppo-editor-empty";
    hint.textContent = "Seleziona una voce a sinistra per modificarla";
    gruppoEditor.appendChild(hint);
    gruppoEditorHint = hint;

    // Categorie per il select Descrizione
    const categorieUscite = (getCategorie().uscite || [])
      .slice()
      .sort((a, b) => a.descrizione.localeCompare(b.descrizione, "it"));

    // Descrizione (select)
    const fDesc = document.createElement("div");
    fDesc.className = "gruppo-field";
    const descLabel = document.createElement("label");
    descLabel.textContent = "Descrizione";
    fDesc.appendChild(descLabel);
    const descSel = document.createElement("select");
    descSel.className = "gruppo-f-desc";
    const optPlaceholder = document.createElement("option");
    optPlaceholder.value = "";
    optPlaceholder.textContent = "Seleziona una categoria...";
    descSel.appendChild(optPlaceholder);
    categorieUscite.forEach((c) => {
      const opt = document.createElement("option");
      opt.value = c.descrizione;
      opt.textContent = c.descrizione;
      descSel.appendChild(opt);
    });
    fDesc.appendChild(descSel);
    gruppoDescSel = descSel;

    // Data
    const fData = document.createElement("div");
    fData.className = "gruppo-field";
    const dataLabel = document.createElement("label");
    dataLabel.textContent = "Data";
    fData.appendChild(dataLabel);
    const dataInput = document.createElement("input");
    dataInput.type = "date";
    dataInput.className = "gruppo-f-data";
    fData.appendChild(dataInput);
    gruppoDataInput = dataInput;

    // Importo
    const fImporto = document.createElement("div");
    fImporto.className = "gruppo-field";
    const importoLabel = document.createElement("label");
    importoLabel.textContent = "Importo (€)";
    fImporto.appendChild(importoLabel);
    const importoInput = document.createElement("input");
    importoInput.type = "number";
    importoInput.className = "gruppo-f-importo";
    importoInput.step = "0.01";
    importoInput.min = "0";
    fImporto.appendChild(importoInput);
    gruppoImportoInput = importoInput;

    // Stato
    const fStato = document.createElement("div");
    fStato.className = "gruppo-field";
    const statoLabel = document.createElement("label");
    statoLabel.textContent = "Stato";
    fStato.appendChild(statoLabel);
    const statoSel = document.createElement("select");
    statoSel.className = "gruppo-f-stato";
    const optStatoPlaceholder = document.createElement("option");
    optStatoPlaceholder.value = "";
    optStatoPlaceholder.textContent = "Seleziona stato...";
    statoSel.appendChild(optStatoPlaceholder);
    ["eseguita", "preventivata", "scaduta"].forEach((s) => {
      const opt = document.createElement("option");
      opt.value = s;
      opt.textContent = s.charAt(0).toUpperCase() + s.slice(1);
      statoSel.appendChild(opt);
    });
    fStato.appendChild(statoSel);
    gruppoStatoSel = statoSel;

    gruppoEditor.appendChild(fDesc);
    gruppoEditor.appendChild(fData);
    gruppoEditor.appendChild(fImporto);
    gruppoEditor.appendChild(fStato);
  }

  /**
   * Aggiorna i valori dell'editor e la visibilità dell'hint senza ricostruire.
   */
  function aggiornaGruppoEditor(v) {
    if (gruppoEditorHint) {
      gruppoEditorHint.style.visibility = v ? "hidden" : "visible";
    }
    if (gruppoDescSel) gruppoDescSel.value = v ? v.descrizione : "";
    if (gruppoDataInput) gruppoDataInput.value = v ? v.data : "";
    if (gruppoImportoInput) gruppoImportoInput.value = v ? v.importo : "";
    if (gruppoStatoSel) gruppoStatoSel.value = v ? v.stato : "";
    gruppoDelBtn.disabled = !v;
    gruppoSaveBtn.disabled = !v;
  }

  function createExpenseItem(spesa, meseIndex) {
    const div = document.createElement("div");
    div.className = `expense-item uscita-row status-${spesa.stato}`;
    div.dataset.type = "uscita";
    div.dataset.id = spesa.id;
    div.dataset.month = meseIndex;

    div.innerHTML = `
      <span class="desc">${spesa.descrizione}</span>
      <span class="importo entrata"></span>
      <span class="importo uscita">${formatEuro(spesa.importo)}</span>
    `;

    // Click sulla riga -> modifica (delegato sul grid)
    attachDrag(div, "uscita", spesa.id, meseIndex);

    return div;
  }

  function createEntrataGroupItem(gruppo, meseIndex) {
    const stato = gruppo[0].stato || "preventivata";
    const totale = gruppo.reduce((s, x) => s + x.importo, 0);
    const statoLabel = (stato || "preventivata").toUpperCase();

    const wrapper = document.createElement("div");
    wrapper.className = "expense-group-wrapper";
    wrapper.dataset.month = meseIndex;

    const header = document.createElement("div");
    header.className = `expense-item entrata-row status-${stato} expandable`;
    header.dataset.type = "entrata-group";
    header.dataset.month = meseIndex;
    header.dataset.stato = stato;

    header.innerHTML = `
      <span class="desc group-label">
        <span class="group-type-pill entrata">ENTRATE</span>
        <span class="group-state-pill status-${stato}">${statoLabel}</span>
      </span>
      <span class="importo entrata">${formatEuro(totale)}</span>
      <span class="importo uscita"></span>
    `;

    header.addEventListener("click", function (e) {
      e.stopPropagation();
      const parent = header.closest(".expense-group-wrapper");
      if (!parent) return;
      const expanded = parent.classList.toggle("expanded");
      const children = parent.querySelector(".expense-children");
      if (children) {
        children.style.display = expanded ? "flex" : "none";
      }
    });

    const children = document.createElement("div");
    children.className = "expense-children";
    children.style.display = "none";

    gruppo.forEach((entrata) => {
      const child = createEntrataItem(entrata, meseIndex);
      child.classList.add("child");
      child.dataset.type = "entrata";
      child.classList.remove("merged");
      children.appendChild(child);
    });

    wrapper.appendChild(header);
    wrapper.appendChild(children);
    return wrapper;
  }

  function createEntrataItem(entrata, meseIndex) {
    const div = document.createElement("div");
    const stato = entrata.stato || "preventivata";
    div.className = `expense-item entrata-row status-${stato}`;
    div.dataset.type = "entrata";
    div.dataset.id = entrata.id;
    div.dataset.month = meseIndex;

    div.innerHTML = `
      <span class="desc">${entrata.descrizione}</span>
      <span class="importo entrata">${formatEuro(entrata.importo)}</span>
      <span class="importo uscita"></span>
    `;

    // Click sulla riga -> modifica entrata (delegato sul grid)
    attachDrag(div, "entrata", entrata.id, meseIndex);

    return div;
  }

  function attachDrag(div, tipo, id, meseIndex) {
    div.draggable = true;
    div.addEventListener("dragstart", function (e) {
      e.dataTransfer.setData(
        "text/plain",
        JSON.stringify({ tipo: tipo, id: id, fromMonth: meseIndex })
      );
      e.dataTransfer.effectAllowed = "move";
      div.classList.add("dragging");
    });
    div.addEventListener("dragend", function () {
      div.classList.remove("dragging");
      document
        .querySelectorAll(".month-card.drag-over")
        .forEach((c) => c.classList.remove("drag-over"));
    });
  }

  // =============================================
  // NUOVA VOCE (entrata/uscita) — modale di modifica
  // =============================================

  function openNuovaVoceModal(tipo, meseIndex) {
    isAddingNewExpense = true;
    isEditingEntrata = false;
    currentEditMonthIdx = meseIndex;
    currentEditExpenseId = null;
    currentEntryTipo = tipo;
    editModalTitle.textContent =
      tipo === "entrata" ? "Nuova entrata" : "Nuova spesa";
    modalDeleteBtn.style.display = "none";
    popolaSelectCategorie(
      "editDesc",
      tipo === "entrata" ? "entrate" : "uscite"
    );
    editDesc.value = "";
    editNewImportoSection.style.display = "block";
    editImportiSection.style.display = "none";
    editAddImporto.value = "";
    editRicorrenteSection.style.display = "none";
    editData.value = `${currentYear}-${String(meseIndex + 1).padStart(2, "0")}-01`;
    // Stato visibile e modificabile per entrambe: entrate default "eseguita", uscite default "preventivata"
    editStatoSection.style.display = "block";
    editStato.value = tipo === "entrata" ? "eseguita" : "preventivata";
    editModal.classList.add("active");
    editDesc.focus();
  }

  function openEntrateModal(meseIndex) {
    openNuovaVoceModal("entrata", meseIndex);
  }

  function openNewExpenseModal(meseIndex) {
    openNuovaVoceModal("uscita", meseIndex);
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
    editAddImporto.value = entrata.importo;
    editData.value = entrata.data;
    // Stato visibile e modificabile anche per le entrate
    editStatoSection.style.display = "block";
    editStato.value = entrata.stato || "eseguita";
    // Mostra sezione ricorrente se ha ricId
    if (entrata.ricId) {
      editRicorrenteSection.style.display = "block";
    } else {
      editRicorrenteSection.style.display = "none";
    }
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
    editAddImporto.value = spesa.importo;
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

  function closeEditModal() {
    editModal.classList.remove("active");
    currentEditMonthIdx = -1;
    currentEditExpenseId = null;
    isAddingNewExpense = false;
    isEditingEntrata = false;
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

    const nuovoImporto = isAddingNewExpense
      ? parseFloat(document.getElementById("editImporto").value)
      : parseFloat(editAddImporto.value);
    if (isNaN(nuovoImporto) || nuovoImporto <= 0) {
      await showAlert("Inserire un importo valido");
      return;
    }

    if (!isAddingNewExpense && !currentEditExpenseId) return;

    // Spinner visibile subito dopo il click su "Salva"
    showSpinner("Salvataggio in corso...");

    try {
      if (isAddingNewExpense) {
        if (currentEntryTipo === "entrata") {
          await addEntrata(currentYear, currentEditMonthIdx, {
            id: generaId("entrata"),
            data: nuovaData,
            descrizione: nuovaDesc,
            importo: nuovoImporto,
            stato: nuovoStato
          });
        } else {
          await addSpesa(currentYear, currentEditMonthIdx, {
            id: generaId("spesa"),
            data: nuovaData,
            descrizione: nuovaDesc,
            importo: nuovoImporto,
            stato: nuovoStato
          });
        }
      } else if (isEditingEntrata) {
        // MODIFICA ENTRATA (lo stato non è modificabile dal modale: preservato)
        const all = getEntrateMese(currentYear, currentEditMonthIdx);
        const entrata = all.find((e) => e.id === currentEditExpenseId);
        if (!entrata) throw new Error("Entrata non trovata");
        await updateEntrata(
          currentYear,
          currentEditMonthIdx,
          currentEditExpenseId,
          {
            descrizione: nuovaDesc,
            importo: nuovoImporto,
            data: nuovaData,
            stato: nuovoStato
          }
        );
      } else {
        // MODIFICA SPESA
        const all = getSpeseMese(currentYear, currentEditMonthIdx);
        const spesa = all.find((s) => s.id === currentEditExpenseId);
        if (!spesa) throw new Error("Spesa non trovata");
        await updateSpesa(
          currentYear,
          currentEditMonthIdx,
          currentEditExpenseId,
          {
            descrizione: nuovaDesc,
            importo: nuovoImporto,
            data: nuovaData,
            stato: nuovoStato
          }
        );
      }

      // Successo: nascondi spinner, aggiorna la griglia e chiudi il modale
      hideSpinner();
      renderPlanning();
      closeEditModal();
    } catch (e) {
      console.warn("Errore salvataggio:", e.message);
      hideSpinner();
      await showAlert("Errore durante il salvataggio");
    }
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
    if (!confirmed) return;

    // Spinner visibile subito dopo la conferma dell'eliminazione
    showSpinner("Attendere prego...");

    try {
      if (isEditingEntrata) {
        await deleteEntrata(
          currentYear,
          currentEditMonthIdx,
          currentEditExpenseId
        );
      } else {
        await deleteSpesa(
          currentYear,
          currentEditMonthIdx,
          currentEditExpenseId
        );
      }

      hideSpinner();
      renderPlanning();
      await showAlert("Eliminazione completata");
      closeEditModal();
    } catch (e) {
      console.warn("Errore eliminazione:", e.message);
      hideSpinner();
      await showAlert("Errore durante l'eliminazione");
    }
  }

  // =============================================
  // DRAG & DROP
  // =============================================

  function attachDragDrop() {
    // Delegazione drag & drop sul grid (un solo listener, evitando duplicati)
    if (grid.dataset.dndAttached) return;
    grid.dataset.dndAttached = "1";

    grid.addEventListener("dragover", function (e) {
      const card = e.target.closest(".month-card");
      if (!card) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      card.classList.add("drag-over");
    });
    grid.addEventListener("dragleave", function (e) {
      const card = e.target.closest(".month-card");
      if (card) card.classList.remove("drag-over");
    });
    grid.addEventListener("drop", async function (e) {
      const card = e.target.closest(".month-card");
      if (!card) return;
      e.preventDefault();
      card.classList.remove("drag-over");
      const raw = e.dataTransfer.getData("text/plain");
      if (!raw) return;
      try {
        const data = JSON.parse(raw);
        const toMonth = parseInt(card.dataset.month, 10);
        if (data.fromMonth === toMonth) return;
        const overlay = document.getElementById("spinnerOverlay");
        if (overlay) overlay.classList.add("active");
        const ok =
          data.tipo === "entrata"
            ? await moveEntrata(
                data.id,
                currentYear,
                data.fromMonth,
                currentYear,
                toMonth
              )
            : await moveSpesa(
                data.id,
                currentYear,
                data.fromMonth,
                currentYear,
                toMonth
              );
        if (overlay) overlay.classList.remove("active");
        if (ok) renderPlanning();
      } catch (err) {
        console.warn("drop error", err);
      }
    });
  }

  // =============================================
  // YEAR NAVIGATION
  // =============================================

  function changeYear(delta) {
    currentYear += delta;
    setCurrentYear(currentYear);
    carouselMonthIndex = getMeseCorrente(currentYear);
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

  // Delegazione click sul planning: la riga principale espande/contrae il gruppo,
  // mentre le righe figlie mantengono la modifica diretta delle singole voci.
  grid.addEventListener("click", function (e) {
    const item = e.target.closest(".expense-item");
    if (!item) return;
    if (item.classList.contains("expandable")) {
      return;
    }
    const meseIndex = parseInt(item.dataset.month, 10);
    if (item.dataset.type === "entrata") {
      openEditEntrataModal(meseIndex, item.dataset.id);
    } else {
      openEditModal(meseIndex, item.dataset.id);
    }
  });

  // Modale gruppo
  closeGruppoModal.addEventListener("click", function () {
    gruppoModal.classList.remove("active");
  });
  gruppoModal.addEventListener("click", function (e) {
    if (e.target === gruppoModal) gruppoModal.classList.remove("active");
  });

  // Salva modifiche della voce selezionata nel modale gruppo
  gruppoSaveBtn.addEventListener("click", async function () {
    if (!currentGruppoSelectedId) return;
    const descSel = gruppoEditor.querySelector(".gruppo-f-desc");
    const dataInput = gruppoEditor.querySelector(".gruppo-f-data");
    const importoInput = gruppoEditor.querySelector(".gruppo-f-importo");
    const statoSel = gruppoEditor.querySelector(".gruppo-f-stato");
    if (!descSel || !dataInput || !importoInput || !statoSel) return;

    const nuovaDesc = descSel.value.trim() || "Senza descrizione";
    const nuovaData = dataInput.value;
    const nuovoImporto = parseFloat(importoInput.value);
    if (!nuovaData) {
      await showAlert("Inserire una data");
      return;
    }
    if (isNaN(nuovoImporto) || nuovoImporto <= 0) {
      await showAlert("Inserire un importo valido");
      return;
    }

    // Mostra spinner e disabilita il pulsante durante il salvataggio
    const htmlOriginale = gruppoSaveBtn.innerHTML;
    gruppoSaveBtn.disabled = true;
    gruppoSaveBtn.innerHTML =
      '<i class="fas fa-spinner fa-spin"></i> Salvataggio...';
    try {
      await updateSpesa(
        currentYear,
        currentGruppoMonthIdx,
        currentGruppoSelectedId,
        {
          descrizione: nuovaDesc,
          importo: nuovoImporto,
          data: nuovaData,
          stato: statoSel.value
        }
      );
      renderPlanning();
      // Chiudi il modale (senza avviso di conferma)
      gruppoModal.classList.remove("active");
    } finally {
      gruppoSaveBtn.disabled = false;
      gruppoSaveBtn.innerHTML = htmlOriginale;
    }
  });

  // Elimina la voce selezionata nel modale gruppo
  gruppoDelBtn.addEventListener("click", async function () {
    if (!currentGruppoSelectedId) return;
    const all = getSpeseMese(currentYear, currentGruppoMonthIdx);
    const v = all.find((s) => s.id === currentGruppoSelectedId);
    if (!v) return;
    const confirmed = await showConfirm(
      `Eliminare "${v.descrizione}" (${formatEuro(v.importo)})?`
    );
    if (confirmed) {
      // Mostra spinner e disabilita il pulsante durante l'eliminazione
      const htmlOriginale = gruppoDelBtn.innerHTML;
      gruppoDelBtn.disabled = true;
      gruppoDelBtn.innerHTML =
        '<i class="fas fa-spinner fa-spin"></i> Eliminazione...';
      try {
        await deleteSpesa(currentYear, currentGruppoMonthIdx, v.id);
        renderPlanning();
        // Chiudi il modale (senza avviso di conferma)
        gruppoModal.classList.remove("active");
      } finally {
        gruppoDelBtn.disabled = false;
        gruppoDelBtn.innerHTML = htmlOriginale;
      }
    }
  });
  // Modale modifica
  modalSaveBtn.addEventListener("click", saveExpense);
  modalCancelBtn.addEventListener("click", closeEditModal);
  modalDeleteBtn.addEventListener("click", deleteFromModal);

  // ---- GESTIONE RICORRENTI ----
  ricDeleteThis.addEventListener("click", async function () {
    if (currentEditMonthIdx === -1 || !currentEditExpenseId) return;
    const confirmed = await showConfirm("Eliminare solo questa ricorrenza?");
    if (!confirmed) return;

    // Spinner visibile subito dopo la conferma dell'eliminazione
    showSpinner("Attendere prego...");
    try {
      if (isEditingEntrata) {
        await deleteEntrata(
          currentYear,
          currentEditMonthIdx,
          currentEditExpenseId
        );
      } else {
        await deleteSpesa(
          currentYear,
          currentEditMonthIdx,
          currentEditExpenseId
        );
      }
      renderPlanning();
    } catch (e) {
      console.warn("Errore eliminazione:", e.message);
      await showAlert("Errore durante l'eliminazione");
    } finally {
      hideSpinner();
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
    if (!confirmed) return;

    // Spinner visibile subito dopo la conferma dell'eliminazione
    showSpinner("Attendere prego...");
    try {
      for (let m = daMese; m <= aMese; m++) {
        const lista = getList(currentYear, m);
        const daEliminare = lista.filter((s) => s.ricId === ricId);
        for (const s of daEliminare) {
          await deleteItem(currentYear, m, s.id);
        }
      }
      ricRangeModal.classList.remove("active");
      renderPlanning();
    } catch (e) {
      console.warn("Errore eliminazione ricorrenze:", e.message);
      await showAlert("Errore durante l'eliminazione");
    } finally {
      hideSpinner();
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
    if (!confirmed) return;

    // Spinner visibile subito dopo la conferma dell'eliminazione
    showSpinner("Attendere prego...");
    try {
      for (let m = 0; m < 12; m++) {
        const lista = getList(currentYear, m);
        const daEliminare = lista.filter((s) => s.ricId === ricId);
        for (const s of daEliminare) {
          await deleteItem(currentYear, m, s.id);
        }
      }
      renderPlanning();
    } catch (e) {
      console.warn("Errore eliminazione ricorrenze:", e.message);
      await showAlert("Errore durante l'eliminazione");
    } finally {
      hideSpinner();
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
