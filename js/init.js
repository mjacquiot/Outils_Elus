window.initAiWorker = () => {
    if (!window.Worker) return console.warn("Web Workers non supportés.");
    
    state.workerCallbacks = {};

    try {
        state.aiWorker = new Worker('js/workers/ner_worker.js', { type: 'module' });
    } catch (e) {
        console.error("Erreur d'initialisation du Worker :", e);
        if (window.location.protocol === 'file:') {
            alert("Erreur de sécurité : L'application doit être lancée via un serveur local (ex: http://localhost:8000) et non en double-cliquant sur le fichier index.html, car le navigateur bloque les Web Workers pour des raisons de sécurité.");
        }
        return;
    }

    state.aiWorker.onmessage = (e) => {
        const { type, id, status, level, data, results, entities, error } = e.data;
        
        switch (type) {
            case 'status':
                console.log(`[Worker NER] Mode ${level} : ${status}`);
                break;
            case 'progress':
                // Peut-être afficher une petite barre de progression si la taille > 1MB ?
                if (data && data.status === 'downloading') {
                     // console.log(`[Worker NER] Download : ${Math.round(data.progress)}%`);
                }
                break;
            case 'result':
                if (state.workerCallbacks[id]) {
                    state.workerCallbacks[id].resolve(entities);
                    delete state.workerCallbacks[id];
                }
                break;
            case 'error':
                console.error("[Worker NER] Erreur :", error);
                if (id && state.workerCallbacks[id]) {
                    state.workerCallbacks[id].reject(error);
                    delete state.workerCallbacks[id];
                }
                break;
        }
    };
    
    // Initialiser le modèle léger immédiatement
    state.aiWorker.postMessage({ type: 'init' });
    console.log("Worker NER initialisé et prêt.");
};

window.analyzeTextWithVMBTask = (text) => {
    if (!state.aiWorker) return Promise.resolve([]);
    return new Promise((resolve, reject) => {
        const id = Date.now() + Math.random().toString();
        state.workerCallbacks[id] = { resolve, reject };
        state.aiWorker.postMessage({ type: 'analyze', id: id, text: text });
    });
};

document.addEventListener('DOMContentLoaded', () => {
  console.log("DOM LOADED FIRED, scheduling render");
  window.initAiWorker();
  setTimeout(render, 300);
});
// Failsafe if DOMContentLoaded already fired:
console.log("Current document.readyState: ", document.readyState);
if (document.readyState === 'interactive' || document.readyState === 'complete') {
  console.log("Failsafe: scheduling render immediately");
  window.initAiWorker();
  setTimeout(render, 300);
}
console.log("=== APP.JS FULLY LOADED WITHOUT SYNTAX ERROR ===");
window.onerror = function (msg, url, lineNo, columnNo, error) {
  document.body.innerHTML = "<div style='padding:2rem;background:white;color:red;'><h2>Erreur Critique Globale</h2><p>" + msg + " (Ligne: " + lineNo + ")</p></div>";
  return false;
};
