/* Cavesson header auth state (auth-ready, not a login form).
   One same-origin fetch to /auth/me. If the auth service is not
   live yet, or the visitor is signed out, this does nothing and
   the header stays in its signed-out state. No retries, no
   banners, no fake session is ever created here. */
(function () {
  var authArea = document.getElementById("auth-area");
  if (!authArea) { return; }
  fetch("/auth/me", { credentials: "same-origin", headers: { Accept: "application/json" } })
    .then(function (response) {
      if (!response.ok) { return null; }
      return response.json().catch(function () { return null; });
    })
    .then(function (data) {
      if (!data || (data.authenticated !== true && !data.user)) { return; }
      authArea.innerHTML = "";
      var dashboard = document.createElement("a");
      dashboard.className = "btn btn-on-paper";
      dashboard.href = "/app";
      dashboard.textContent = "Dashboard";
      var signOut = document.createElement("a");
      signOut.href = "/auth/logout";
      signOut.textContent = "Sign out";
      authArea.appendChild(dashboard);
      authArea.appendChild(signOut);
      var heroCta = document.getElementById("hero-primary");
      if (heroCta) {
        heroCta.href = "/app";
        heroCta.textContent = "Open the Vault";
      }
    })
    .catch(function () { /* Auth service not live: stay signed out, silently. */ });
})();
