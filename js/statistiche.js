/* =============================================
   STATISTICHE / REPORT — Grafici e tabelle
   ============================================= */

(function () {
  "use strict";

  let currentYear = getCurrentYear();
  // Grafico rimosso (non utilizzato)

  // ---- REFERENCES DOM ----
  const annoLabel = document.getElementById("annoLabel");
  const prevYearBtn = document.getElementById("prevYearBtn");
  const nextYearBtn = document.getElementById("nextYearBtn");
  const statTotEntrate = document.getElementById("statTotEntrate");
  const statTotUscite = document.getElementById("statTotUscite");
  const statSaldo = document.getElementById("statSaldo");
  const statsTableBodySx = document.getElementById("statsTableBodySx");
  const statsTableBodyDx = document.getElementById("statsTableBodyDx");

  // =============================================
  // COLORI PALETTE
  // =============================================
  const COLORS = [
    "#3b82f6",
    "#ef4444",
    "#22c55e",
    "#f59e0b",
    "#8b5cf6",
    "#ec4899",
    "#14b8a6",
    "#f97316",
    "#6366f1",
    "#84cc16",
    "#06b6d4",
    "#d946ef",
    "#eab308",
    "#64748b"
  ];

  // =============================================
  // RACCOLTA DATI
  // =============================================

  function raccogliDati(year) {
    const entrateMensili = [];
    const usciteMensili = [];
    let totEntrate = 0,
      totUscite = 0,
      totVoci = 0;
    const categorieMap = {};

    for (let m = 0; m < 12; m++) {
      const entrate = getEntrateMese(year, m);
      const spese = getSpeseMese(year, m);

      const sumEntrate = entrate.reduce((s, e) => s + e.importo, 0);
      const sumUscite = spese.reduce((s, e) => s + e.importo, 0);

      entrateMensili.push(sumEntrate);
      usciteMensili.push(sumUscite);
      totEntrate += sumEntrate;
      totUscite += sumUscite;
      totVoci += entrate.length + spese.length;

      // Raggruppa uscite per categoria
      for (const s of spese) {
        if (!categorieMap[s.descrizione]) {
          categorieMap[s.descrizione] = 0;
        }
        categorieMap[s.descrizione] += s.importo;
      }
    }

    return {
      entrateMensili,
      usciteMensili,
      totEntrate,
      totUscite,
      saldo: totEntrate - totUscite,
      totVoci,
      categorieMap
    };
  }

  // =============================================
  // CARD RIEPILOGO
  // =============================================

  function aggiornaRiepilogo(dati) {
    statTotEntrate.textContent = formatEuro(dati.totEntrate);
    statTotUscite.textContent = formatEuro(dati.totUscite);
    statSaldo.textContent = formatEuro(dati.saldo);
    statSaldo.style.color = dati.saldo >= 0 ? "#16a34a" : "#dc2626";
    // Aggiorna anche la card saldo
    const saldoCard = statSaldo.closest(".stat-card");
    if (saldoCard) {
      saldoCard.classList.toggle("negative", dati.saldo < 0);
    }
  }

  // =============================================
  // GRAFICO ANDAMENTO MENSILE
  // =============================================
  // TABELLA DETTAGLIO PER DESCRIZIONE (pivot)
  // =============================================

  function aggiornaTabellaDescrizioni(year) {
    const conf = {
      entrate: {
        headId: "descTableHeadEntrate",
        bodyId: "descTableBodyEntrate",
        emptyId: "descEmptyEntrate",
        upIsGood: true,
        labelMetrica: "Entrate"
      },
      uscite: {
        headId: "descTableHeadUscite",
        bodyId: "descTableBodyUscite",
        emptyId: "descEmptyUscite",
        upIsGood: false,
        labelMetrica: "Uscite"
      }
    };

    // Raccogli tutte le descrizioni uniche con i loro importi per mese
    const descMap = {}; // { descrizione: { tipo, [mese]: importo } }

    for (let m = 0; m < 12; m++) {
      const entrate = getEntrateMese(year, m);
      for (const e of entrate) {
        if (!descMap[e.descrizione])
          descMap[e.descrizione] = { tipo: "entrate", mesi: {} };
        descMap[e.descrizione].mesi[m] =
          (descMap[e.descrizione].mesi[m] || 0) + e.importo;
      }
      const spese = getSpeseMese(year, m);
      for (const s of spese) {
        if (!descMap[s.descrizione])
          descMap[s.descrizione] = { tipo: "uscite", mesi: {} };
        descMap[s.descrizione].mesi[m] =
          (descMap[s.descrizione].mesi[m] || 0) + s.importo;
      }
    }

    const descEntries = Object.keys(descMap);

    // Intestazione comune
    const headerHtml = `<tr>
      <th>Descrizione</th>
      ${MESI_ABBR.map((m) => `<th>${m}</th>`).join("")}
      <th>Totale</th>
    </tr>`;

    for (const tipo of ["entrate", "uscite"]) {
      const c = conf[tipo];
      const head = document.getElementById(c.headId);
      const body = document.getElementById(c.bodyId);
      const empty = document.getElementById(c.emptyId);
      const wrapper = head.closest(".desc-table-wrapper");
      const entries = descEntries
        .filter((d) => descMap[d].tipo === tipo)
        .sort();

      if (entries.length === 0) {
        wrapper.style.display = "none";
        empty.style.display = "flex";
        continue;
      }
      wrapper.style.display = "block";
      empty.style.display = "none";

      head.innerHTML = headerHtml;
      body.innerHTML = "";

      for (const desc of entries) {
        const data = descMap[desc];
        const row = document.createElement("tr");
        let html = `<td><span class="desc-name">${desc}</span></td>`;
        let tot = 0;
        for (let m = 0; m < 12; m++) {
          const val = data.mesi[m] || 0;
          tot += val;
          const cls =
            val > 0 ? (tipo === "entrate" ? "td-positive" : "td-negative") : "";
          // Indicatore di tendenza rispetto al mese precedente della stessa descrizione.
          // Se il mese non ha valore, il campo resta vuoto (senza cifre né simboli).
          let trend = "";
          if (m > 0 && val > 0) {
            const prev = data.mesi[m - 1] || 0;
            trend = trendIcon(val, prev, c.upIsGood, c.labelMetrica);
          }
          html += `<td class="${cls}">${val > 0 ? formatEuro(val) + trend : ""}</td>`;
        }
        const totCls = tipo === "entrate" ? "td-positive" : "td-negative";
        html += `<td class="${totCls}"><strong>${formatEuro(tot)}</strong></td>`;
        row.innerHTML = html;
        body.appendChild(row);
      }
    }
  }

  // =============================================
  // TABELLA DETTAGLIO MENSILE
  // =============================================

  /**
   * Icona di tendenza rispetto al mese precedente.
   * cur = valore mese corrente, prev = valore mese precedente.
   * upIsGood = true se per quella colonna un aumento è positivo
   *   (entrate, saldo); false per le uscite (dove una diminuzione è positiva).
   * La freccia indica l'ANDAMENTO del bilancio: ▲ verde = migliorato,
   * ▼ rossa = peggiorato, = grigia = invariato. Nessuna ambiguità:
   * verde è sempre su, rosso è sempre giù.
   * Se prev è null (primo mese senza riferimento) non mostra nulla.
   */
  function trendIcon(cur, prev, upIsGood, metric) {
    if (prev === null || prev === undefined) return "";
    if (cur === prev) {
      return ` <i class="fas fa-equals trend-icon trend-eq" title="${metric}: invariato"></i>`;
    }
    const migliorato = upIsGood ? cur > prev : cur < prev;
    const inAumento = cur > prev;
    const icona = migliorato ? "fa-arrow-up" : "fa-arrow-down";
    const color = migliorato ? "trend-good" : "trend-bad";
    const effetto = migliorato
      ? upIsGood
        ? "positivo"
        : "risparmio"
      : "negativo";
    const label = `${metric} ${inAumento ? "in aumento" : "in calo"} — ${effetto}`;
    return ` <i class="fas ${icona} trend-icon ${color}" title="${label}"></i>`;
  }

  function aggiornaTabella(dati) {
    statsTableBodySx.innerHTML = "";
    statsTableBodyDx.innerHTML = "";

    const buildRow = (m) => {
      const e = dati.entrateMensili[m];
      const u = dati.usciteMensili[m];
      const saldo = e - u;
      const saldoClass = saldo >= 0 ? "td-positive" : "td-negative";

      // Riferimento al mese precedente (nessuno per Gennaio)
      let prevE = null,
        prevU = null,
        prevSaldo = null;
      if (m > 0) {
        prevE = dati.entrateMensili[m - 1];
        prevU = dati.usciteMensili[m - 1];
        prevSaldo = prevE - prevU;
      }

      return `
        <tr>
          <td><strong>${MESI[m]}</strong></td>
          <td class="td-positive">${formatEuro(e)}${trendIcon(e, prevE, true, "Entrate")}</td>
          <td class="td-negative">${formatEuro(u)}${trendIcon(u, prevU, false, "Uscite")}</td>
          <td class="${saldoClass}">${formatEuro(saldo)}${trendIcon(
            saldo,
            prevSaldo,
            true,
            "Saldo"
          )}</td>
        </tr>`;
    };

    for (let m = 0; m < 6; m++) statsTableBodySx.innerHTML += buildRow(m);
    for (let m = 6; m < 12; m++) statsTableBodyDx.innerHTML += buildRow(m);
  }

  // =============================================
  // RENDER COMPLETO
  // =============================================

  function renderReport() {
    try {
      const dati = raccogliDati(currentYear);
      aggiornaRiepilogo(dati);
      aggiornaTabellaDescrizioni(currentYear);
      aggiornaTabella(dati);
      annoLabel.textContent = currentYear;
    } catch (e) {
      console.warn("Report render error:", e.message);
    }
  }

  // =============================================
  // NAVIGAZIONE ANNO
  // =============================================

  function changeYear(delta) {
    currentYear += delta;
    setCurrentYear(currentYear);
    renderReport();
  }

  prevYearBtn.addEventListener("click", () => changeYear(-1));
  nextYearBtn.addEventListener("click", () => changeYear(1));

  // =============================================
  // INIT
  // =============================================

  // Esponi renderReport globalmente per l'init in HTML
  window._renderReportStats = renderReport;
  window._currentYearStats = currentYear;
  window._changeYearStats = changeYear;

  // Ri-render quando arrivano dati da Supabase (consistente con le altre pagine)
  window.addEventListener("dataReady", renderReport);
})();
