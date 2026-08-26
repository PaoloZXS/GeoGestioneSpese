/* =============================================
   LOGIN — Autenticazione
   ============================================= */

(function () {
  "use strict";

  const USERNAME = "Giorsetti";
  const PASSWORD = "3621";

  const pwInput = document.getElementById("loginPw");
  const loginBtn = document.getElementById("loginBtn");
  const loginError = document.getElementById("loginError");
  const togglePw = document.getElementById("togglePw");
  const toggleIcon = togglePw.querySelector("i");

  // Se già autenticato, vai direttamente al planning
  if (sessionStorage.getItem("auth") === "true") {
    window.location.replace("index.html");
    return;
  }

  // Toggle password visibility
  togglePw.addEventListener("click", function () {
    const isPassword = pwInput.style.webkitTextSecurity !== "none";
    pwInput.style.webkitTextSecurity = isPassword ? "none" : "disc";
    toggleIcon.className = isPassword ? "fas fa-eye-slash" : "fas fa-eye";
  });

  // Login
  function tentaLogin() {
    const pw = pwInput.value;

    if (pw === PASSWORD) {
      sessionStorage.setItem("auth", "true");
      // Effetto visivo prima del redirect
      loginBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Accesso...';
      setTimeout(function () {
        window.location.replace("index.html");
      }, 300);
    } else {
      loginError.classList.add("visible");
      pwInput.value = "";
      pwInput.focus();
      // Nascondi errore dopo 3 secondi
      setTimeout(function () {
        loginError.classList.remove("visible");
      }, 3000);
    }
  }

  loginBtn.addEventListener("click", tentaLogin);

  pwInput.addEventListener("keypress", function (e) {
    if (e.key === "Enter") tentaLogin();
  });

  // Focus sulla password all'avvio
  pwInput.focus();
})();
