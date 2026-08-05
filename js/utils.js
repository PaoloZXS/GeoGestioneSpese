/* =============================================
   UTILS — Funzioni di utilità condivise
   ============================================= */

const MESI = [
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

const MESI_ABBR = [
  "Gen",
  "Feb",
  "Mar",
  "Apr",
  "Mag",
  "Giu",
  "Lug",
  "Ago",
  "Set",
  "Ott",
  "Nov",
  "Dic"
];

/**
 * Formatta una data ISO (YYYY-MM-DD) in formato italiano breve.
 */
function formatDataBreve(dataISO) {
  const d = new Date(dataISO + "T00:00:00");
  return d.toLocaleDateString("it-IT", { day: "2-digit", month: "short" });
}

/**
 * Formatta una data ISO (YYYY-MM-DD) in formato italiano completo
 * con giorno, mese e anno (es. "15 Gen 2026").
 */
function formatDataCompleta(dataISO) {
  const d = new Date(dataISO + "T00:00:00");
  return d.toLocaleDateString("it-IT", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  });
}

/**
 * Formatta un numero come valuta Euro.
 */
function formatEuro(valore) {
  // Usa Intl.NumberFormat per avere controllo esplicito sul separatore migliaia
  return (
    new Intl.NumberFormat("it-IT", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
      useGrouping: true
    }).format(valore) + " €."
  );
}

/**
 * Restituisce il mese corrente (0-based) per l'anno specificato.
 * Se l'anno è 2026, restituisce Giugno (6). Altrimenti -1.
 */
function getMeseCorrente(year) {
  // Al 26/07/2026
  if (year === 2026) return 6;
  // Per anni diversi, usa la data reale
  return -1;
}

/**
 * Ordina le spese: scadute prima (per data), poi preventivate (per vicinanza a oggi),
 * poi eseguite (per vicinanza a oggi).
 */
function ordinaSpese(spese, dataRiferimento) {
  const oggi = dataRiferimento || new Date(2026, 6, 26);

  const scadute = spese.filter((s) => s.stato === "scaduta");
  const preventive = spese.filter((s) => s.stato === "preventivata");
  const eseguite = spese.filter((s) => s.stato === "eseguita");

  scadute.sort((a, b) => a.data.localeCompare(b.data));

  preventive.sort((a, b) => {
    const da = Math.abs(new Date(a.data + "T00:00:00") - oggi);
    const db = Math.abs(new Date(b.data + "T00:00:00") - oggi);
    return da - db;
  });

  eseguite.sort((a, b) => {
    const da = Math.abs(new Date(a.data + "T00:00:00") - oggi);
    const db = Math.abs(new Date(b.data + "T00:00:00") - oggi);
    return da - db;
  });

  return [...scadute, ...preventive, ...eseguite];
}

/**
 * Crea un ID univoco con prefisso.
 */
function generaId(prefisso) {
  return (
    prefisso + "-" + Date.now() + "-" + Math.random().toString(36).substr(2, 6)
  );
}

/**
 * Converte data ISO in formato "Mese Anno".
 */
function formatMeseAnno(dataISO) {
  if (!dataISO) return "";
  const [y, m] = dataISO.split("-");
  return MESI[parseInt(m) - 1] + " " + y;
}

/**
 * Converte mese/anno in formato breve "m/YYYY".
 */
function formatPeriodoBreve(dataISO) {
  if (!dataISO) return "";
  const [y, m] = dataISO.split("-");
  return parseInt(m) + "/" + y;
}
