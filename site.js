/* Cavesson header disclosure: open on wide screens, closed on phones,
   and Escape closes it on phones. Collapsible owns aria-expanded and
   returns focus to the trigger when it closes from inside the panel. */
(function () {
  var collapsible = document.querySelector("ui-collapsible.site-nav-collapsible");
  var header = document.querySelector(".site-header");
  if (!collapsible || !header) { return; }
  var wide = window.matchMedia("(min-width: 761px)");
  function sync() {
    if (collapsible.open !== wide.matches) { collapsible.open = wide.matches; }
  }
  function ready() {
    sync();
    if (typeof wide.addEventListener === "function") {
      wide.addEventListener("change", sync);
    }
    header.addEventListener("keydown", function (event) {
      if (event.key === "Escape" && !wide.matches && collapsible.open) {
        if (collapsible.api && collapsible.api.close) { collapsible.api.close(); }
        else { collapsible.open = false; }
      }
    });
  }
  if (window.customElements && customElements.whenDefined) {
    customElements.whenDefined("ui-collapsible").then(ready).catch(function () {});
  } else { ready(); }
})();
