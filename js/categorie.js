/* =============================================
   CATEGORIE — Gestione Categorie
   ============================================= */

(function () {
  "use strict";

  const catListEntrate = document.getElementById("catListEntrate");
  const catListUscite = document.getElementById("catListUscite");
  const catInputEntrate = document.getElementById("catInputEntrate");
  const catInputUscite = document.getElementById("catInputUscite");

  // =============================================
  // RENDER
  // =============================================

  function renderCategorie() {
    renderCatColumn("entrate", catListEntrate);
    renderCatColumn("uscite", catListUscite);
  }

  function renderCatColumn(tipo, container) {
    const cat = getCategorie();
    const items = [...(cat[tipo] || [])];
    items.sort((a, b) => a.descrizione.localeCompare(b.descrizione, "it"));
    container.innerHTML = "";

    if (items.length === 0) {
      container.innerHTML =
        '<div class="categorie-empty">Nessuna categoria</div>';
      return;
    }

    items.forEach((catItem, idx) => {
      const item = document.createElement("div");
      item.className = "categorie-item";
      item.dataset.tipo = tipo;

      // Dobbiamo trovare l'indice reale nell'array originale (quello salvato)
      // Poiché abbiamo ordinato, cerchiamo per id
      const categorieComplete = getCategorie();
      const realIdx = categorieComplete[tipo].findIndex(
        (c) => c.id === catItem.id
      );

      item.innerHTML = `
        <span class="cat-desc">${catItem.descrizione}</span>
        <input class="cat-edit-input" type="text" value="${catItem.descrizione}" />
        <button class="cat-delete-btn" title="Elimina"><i class="fas fa-trash"></i></button>
      `;

      // Click sulla descrizione -> modifica inline
      item.querySelector(".cat-desc").addEventListener("click", function (e) {
        e.stopPropagation();
        avviaModificaCategoria(item, tipo, realIdx);
      });

      // Pulsante elimina
      item
        .querySelector(".cat-delete-btn")
        .addEventListener("click", async function (e) {
          e.stopPropagation();
          const confirmed = await showConfirm(
            `Eliminare la categoria "${catItem.descrizione}"?`
          );
          if (confirmed) {
            await deleteCategoria(tipo, realIdx);
            renderCategorie();
          }
        });

      container.appendChild(item);
    });
  }

  function avviaModificaCategoria(item, tipo, idx) {
    if (item.classList.contains("editing")) return;
    item.classList.add("editing");
    const input = item.querySelector(".cat-edit-input");
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);

    const salva = async function () {
      const val = input.value.trim();
      if (val) {
        await updateCategoria(tipo, idx, val);
        renderCategorie();
      } else {
        item.classList.remove("editing");
      }
    };

    input.addEventListener("keydown", function handlerKey(e) {
      if (e.key === "Enter") {
        input.removeEventListener("keydown", handlerKey);
        salva();
      }
      if (e.key === "Escape") {
        input.removeEventListener("keydown", handlerKey);
        item.classList.remove("editing");
        renderCategorie();
      }
    });

    input.addEventListener(
      "blur",
      function handlerBlur() {
        input.removeEventListener("blur", handlerBlur);
        salva();
      },
      { once: true }
    );
  }

  async function aggiungiCategoria(tipo, inputEl) {
    const val = inputEl.value.trim();
    if (!val) return;
    await addCategoria(tipo, val);
    inputEl.value = "";
    renderCategorie();
    inputEl.focus();
  }

  // =============================================
  // INIT
  // =============================================

  renderCategorie();

  // Ri-render quando arrivano dati da Supabase
  window.addEventListener("dataReady", renderCategorie);

  // ---- EVENTI ----
  document.querySelectorAll(".btn-add-cat").forEach(function (btn) {
    btn.addEventListener("click", function () {
      const tipo = this.dataset.tipo;
      const input = document.getElementById(
        "catInput" + (tipo === "entrate" ? "Entrate" : "Uscite")
      );
      aggiungiCategoria(tipo, input);
    });
  });

  catInputEntrate.addEventListener("keypress", function (e) {
    if (e.key === "Enter") aggiungiCategoria("entrate", catInputEntrate);
  });
  catInputUscite.addEventListener("keypress", function (e) {
    if (e.key === "Enter") aggiungiCategoria("uscite", catInputUscite);
  });
})();
