import { pipeline, env } from 'https://cdn.jsdelivr.net/npm/@xenova/transformers@2.16.0';

// Configuration : Autoriser le stockage local en cache pour ne pas le re-télécharger.
env.allowLocalModels = false; 

// Nous garderons en mémoire l'état du pipeline actuel
let currentPipeline = null;
let currentLevel = 'none'; 

// "Xenova/distilbert-base-multilingual-cased-ner" (100+ MB)
const LIGHT_MODEL_NAME = 'Xenova/distilbert-base-multilingual-cased-ner';

// Vous pourriez déclarer un modèle expert ici s'il y en a un de performant pour la RGPD/multilingue.
// Pour l'instant nous utilisons le light model car c'est déjà un bon candidat de départ.
// const EXPERT_MODEL_NAME = 'Xenova/...';

const loadModel = async (modelName, level) => {
    try {
        self.postMessage({ type: 'status', status: 'loading', level: level });
        
        currentPipeline = await pipeline('token-classification', modelName, {
            progress_callback: (info) => {
                // Info : { status: "downloading", name: "...", file: "...", progress: 45.2, loaded: ..., total: ... }
                self.postMessage({ type: 'progress', level: level, data: info });
            }
        });
        
        currentLevel = level;
        self.postMessage({ type: 'status', status: 'ready', level: level });
    } catch (error) {
        self.postMessage({ type: 'error', error: error.message || error.toString() });
    }
};

// Écouter les messages venant du thread principal
self.addEventListener('message', async (event) => {
    const message = event.data;
    
    if (message.type === 'init') {
        // Appelé par l'UI lors de la première connexion
        await loadModel(LIGHT_MODEL_NAME, 'light');
        
        // --- CHARGEMENT EXPERT EN ARRIERE PLAN ---
        // Si vous avez un modèle plus lourd, vous pouvez l'initialiser un peu plus tard
        /*
        setTimeout(async () => {
             await loadModel(EXPERT_MODEL_NAME, 'expert');
        }, 5000); 
        */
    }
    
    if (message.type === 'analyze') {
        if (!currentPipeline) {
            self.postMessage({ type: 'error', error: 'Pipeline is not loaded yet.' });
            return;
        }

        try {
            // Le modèle NER extrait les entités (Personne, Organisation, Lieux...)
            const output = await currentPipeline(message.text, { ignore_labels: ['O'] });
            
            // output est un tableau de : { entity: "B-PER", score: 0.99, index: 1, word: "Jean", start: 0, end: 4 }
            
            // Note: avec les tokenizer WordPiece, "Dupont" peut être divisé en "Du" et "##pont".
            // Il faut regrouper les mots contigus
            const aggregatedEntities = [];
            let currentEntity = null;
            
            for (const token of output) {
                // Si c'est un B-PER (Beginning Person) ou B-ORG (Organisation) ou B-LOC
                // On peut cibler 'PER' spécifiquement pour la pseudonymisation stricte.
                const isPerson = token.entity.endsWith('PER');
                const isContinuation = token.entity.startsWith('I-') || token.word.startsWith('##');
                
                if (isPerson && (!isContinuation || !currentEntity)) {
                    // Nouvelle entité valide
                    if (currentEntity) aggregatedEntities.push(currentEntity);
                    currentEntity = { 
                        type: token.entity.split('-')[1], // 'PER'
                        word: token.word.replace('##', ''), 
                        score: token.score,
                        start: token.start,
                        end: token.end
                    };
                } else if (currentEntity && isContinuation) {
                    // Suite du mot actuel
                    currentEntity.word += token.word.replace('##', '');
                    currentEntity.end = token.end;
                    // On fait la moyenne du score par confort
                    currentEntity.score = (currentEntity.score + token.score) / 2;
                } else {
                    // Autre type (LOC, ORG)
                    if (currentEntity) aggregatedEntities.push(currentEntity);
                    currentEntity = null;
                }
            }
            if (currentEntity) aggregatedEntities.push(currentEntity);
            
            // Retourner les noms propres détectés au UI Thread
            self.postMessage({ 
                type: 'result', 
                id: message.id, 
                entities: aggregatedEntities 
            });
            
        } catch (error) {
           self.postMessage({ type: 'error', id: message.id, error: error.message || error.toString() });
        }
    }
});
