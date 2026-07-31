/* =============================================
   NOTIFICATIONS — Sistema alert / confirm
   ============================================= */

const notificaModal = document.getElementById("notificaModal");
const notificaIcon = document.getElementById("notificaIcon");
const notificaMsg = document.getElementById("notificaMsg");
const notificaBtns = document.getElementById("notificaBtns");

/**
 * Mostra un alert personalizzato.
 * Restituisce una Promise che si risolve quando l'utente preme OK.
 */
function showAlert(msg) {
  return new Promise((resolve) => {
    notificaIcon.className = "notifica-icon warning";
    notificaIcon.innerHTML = '<i class="fas fa-exclamation-triangle"></i>';
    notificaMsg.textContent = msg;
    notificaBtns.innerHTML =
      '<button class="btn-ok" id="notificaOkBtn">OK</button>';
    notificaModal.classList.add("active");

    document
      .getElementById("notificaOkBtn")
      .addEventListener("click", function handler() {
        notificaModal.classList.remove("active");
        this.removeEventListener("click", handler);
        resolve();
      });
  });
}

/**
 * Mostra un confirm personalizzato.
 * Restituisce una Promise che si risolve con true (conferma) o false (annulla).
 */
function showConfirm(msg) {
  return new Promise((resolve) => {
    notificaIcon.className = "notifica-icon question";
    notificaIcon.innerHTML = '<i class="fas fa-question-circle"></i>';
    notificaMsg.textContent = msg;
    notificaBtns.innerHTML = `
      <button class="btn-no" id="notificaNoBtn">Annulla</button>
      <button class="btn-yes" id="notificaYesBtn">Elimina</button>
    `;
    notificaModal.classList.add("active");

    function chiudiConferma() {
      document
        .getElementById("notificaYesBtn")
        .removeEventListener("click", yesHandler);
      document
        .getElementById("notificaNoBtn")
        .removeEventListener("click", noHandler);
      notificaModal.classList.remove("active");
    }

    function yesHandler() {
      chiudiConferma();
      resolve(true);
    }

    function noHandler() {
      chiudiConferma();
      resolve(false);
    }

    document
      .getElementById("notificaYesBtn")
      .addEventListener("click", yesHandler);
    document
      .getElementById("notificaNoBtn")
      .addEventListener("click", noHandler);
  });
}
