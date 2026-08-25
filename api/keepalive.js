/* =============================================
   GeoGestioneSpese — Keepalive Supabase
   =============================================
   Funzione serverless (Vercel Cron) che esegue una
   chiamata REST a Supabase per impedire che il
   progetto free vada in "pausa" per inattività.
   Chiamata da vercel.json -> crons (es. 1x/giorno).
   ============================================= */

const SUPABASE_URL = "https://pxbgbzizfrojbmvvtpzc.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB4Ymdieml6ZnJvamJtdnZ0cHpjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUzMjY4NDUsImV4cCI6MjEwMDkwMjg0NX0.sybF0NAU_p-UghS0ckLSYa0yEVjT97EzJYnZ_4H9gtw";

module.exports = async function handler(req, res) {
  try {
    // Richiesta leggera: una sola riga dalla tabella spese
    const resp = await fetch(
      `${SUPABASE_URL}/rest/v1/spese?select=id&limit=1`,
      {
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`
        }
      }
    );

    if (!resp.ok) {
      console.warn(`keepalive: Supabase ha risposto ${resp.status}`);
      res.status(502).json({ ok: false, status: resp.status });
      return;
    }

    res.status(200).json({ ok: true, supabase: "active" });
  } catch (e) {
    console.error("keepalive: errore", e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
};
