document.addEventListener('DOMContentLoaded', () => {
  console.log("DOM LOADED FIRED, scheduling render");
  setTimeout(render, 300);
});
// Failsafe if DOMContentLoaded already fired:
console.log("Current document.readyState: ", document.readyState);
if (document.readyState === 'interactive' || document.readyState === 'complete') {
  console.log("Failsafe: scheduling render immediately");
  setTimeout(render, 300);
}
console.log("=== APP.JS FULLY LOADED WITHOUT SYNTAX ERROR ===");
window.onerror = function (msg, url, lineNo, columnNo, error) {
  document.body.innerHTML = "<div style='padding:2rem;background:white;color:red;'><h2>Erreur Critique Globale</h2><p>" + msg + " (Ligne: " + lineNo + ")</p></div>";
  return false;
};
