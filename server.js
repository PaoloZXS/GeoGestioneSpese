/* =============================================
   GeoGestioneSpese — Server locale
   =============================================
   Avvia con:  node server.js
   Poi apri:   http://localhost:3000
   ============================================= */

const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = 3000;
const DATA_FILE = path.join(__dirname, "data.json");
const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon"
};

// =============================================
// SALVATAGGIO DATI SU FILE
// =============================================

function caricaDati() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const raw = fs.readFileSync(DATA_FILE, "utf8");
      return JSON.parse(raw);
    }
  } catch (e) {
    console.error("Errore lettura data.json:", e.message);
  }
  return {};
}

function salvaDati(dati) {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(dati, null, 2), "utf8");
    return true;
  } catch (e) {
    console.error("Errore scrittura data.json:", e.message);
    return false;
  }
}

// =============================================
// SERVER
// =============================================

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const pathname = url.pathname;

  // ---- API: CARICA DATI ----
  if (pathname === "/api/load" && req.method === "GET") {
    const dati = caricaDati();
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(dati));
    return;
  }

  // ---- API: SALVA DATI ----
  if (pathname === "/api/save" && req.method === "POST") {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      try {
        const dati = JSON.parse(body);
        const ok = salvaDati(dati);
        res.writeHead(ok ? 200 : 500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: ok }));
      } catch (e) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: false, error: e.message }));
      }
    });
    return;
  }

  // ---- STATIC FILES ----
  let filePath = path.join(
    __dirname,
    pathname === "/" ? "index.html" : pathname
  );
  const ext = path.extname(filePath);

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("404 — File non trovato");
      return;
    }
    res.writeHead(200, {
      "Content-Type": MIME_TYPES[ext] || "application/octet-stream"
    });
    res.end(data);
  });
});

server.listen(PORT, () => {
  console.log("");
  console.log("  ╔══════════════════════════════════╗");
  console.log("  ║   GeoGestioneSpese — Server ON   ║");
  console.log(`  ║   http://localhost:${PORT}           ║`);
  console.log("  ╚══════════════════════════════════╝");
  console.log("");
  console.log("  Apri il browser e vai su:");
  console.log(`  → http://localhost:${PORT}`);
  console.log("");
  console.log("  Premi Ctrl+C per fermare il server.");
  console.log("");
});
