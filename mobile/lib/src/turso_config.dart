// =============================================
// Configurazione Turso + credenziali fisse
// =============================================
// URL del database Turso (protocollo HTTPS per SQL over HTTP).
// Nota sicurezza: il token RW è incorporato nell'app perché il
// client Android dialoga direttamente con Turso senza backend.

const String tursoUrl =
    "https://geogestionespese-paolozxs.aws-eu-west-1.turso.io";
const String tursoToken =
    "eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3ODc5MTQxMDYsImlkIjoiMDFhMDQ3ZmItOTMwMS03NmQ4LTgyNTctNWI5YTNiNzJmMTY5Iiwia2lkIjoidmQ2VmduNUs4d1pEY1hqcXNVLThRR0lWbnZXazExeW1mRlVkVmJNX3owdyIsInJpZCI6ImQxM2Y4NDlkLWY4NWMtNDVlNy1iZDQ1LTczMzg5YWIyOGVkNSJ9.IcfC4DvFZ34pVqIDZF_gmQfFx3HvcOXhj4x-36jsBfrU-pxk3a0jsDfkHHxDs6kYs2bp580wYbE1HzhqQXsKBw";

const String loginUsername = "Giorsetti";
const String loginPassword = "3621";
