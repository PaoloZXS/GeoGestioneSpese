/* =============================================
   GeoGestioneSpese — Keepalive Turso
   =============================================
   Funzione serverless (Vercel Cron) che esegue una
   chiamata leggera a Turso (SELECT 1) per impedire che
   il database free vada in "pausa" per inattività.
   Chiamata da vercel.json -> crons (es. 1x/giorno).
   ============================================= */

// Turso: usa TURSO_URL e TURSO_TOKEN dalle variabili d'ambiente (Vercel/.env)
function normalizzaTursoUrl(url) {
  if (url && url.startsWith("libsql://")) {
    return "https://" + url.slice("libsql://".length);
  }
  return url;
}

const TURSO_URL = normalizzaTursoUrl(process.env.TURSO_URL || "");
const TURSO_TOKEN = process.env.TURSO_TOKEN || "";

module.exports = async function handler(req, res) {
  try {
    if (!TURSO_URL || !TURSO_TOKEN) {
      throw new Error("TURSO_URL / TURSO_TOKEN non configurati");
    }

    // Richiesta leggera: SELECT 1 via SQL over HTTP (/v2/pipeline)
    const resp = await fetch(`${TURSO_URL}/v2/pipeline`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${TURSO_TOKEN}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        requests: [
          {
            type: "execute",
            stmt: { sql: "SELECT 1", args: [], named_args: [] }
          },
          { type: "close" }
        ]
      })
    });

    if (!resp.ok) {
      console.warn(`keepalive: Turso ha risposto ${resp.status}`);
      res.status(502).json({ ok: false, status: resp.status });
      return;
    }

    res.status(200).json({ ok: true, turso: "active" });
  } catch (e) {
    console.error("keepalive: errore", e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
};
