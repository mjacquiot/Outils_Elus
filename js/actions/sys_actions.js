// --- OPTIONS VIEW ---
window.renderOptionsView = () => {
  return `
    <div class="view-header">
      <h2 style="display:flex; align-items:center; gap:0.5rem;"><span class="material-icons-round" style="color:var(--primary); font-size:2.5rem; filter:drop-shadow(0 4px 3px rgb(0 0 0 / 0.07));">settings</span>Options Système</h2>
      <p style="color:var(--text-muted); font-size:1.05rem;">Configurations avancées de l'application et gestion des intégrations externes.</p>
    </div>
    
    <div style="display:flex; flex-direction:column; gap:2rem; max-width:800px;">
        <div class="card" style="border:1px solid #e2e8f0; padding:2rem; box-shadow:0 4px 6px -1px rgba(0,0,0,0.05);">
            <h3 style="margin:0 0 1rem 0; color:var(--text-main); display:flex; align-items:center; gap:0.5rem;"><span class="material-icons-round" style="color:#0ea5e9;">vpn_key</span> Clés API Intelligence Artificielle (RAG Auto)</h3>
            <p style="font-size:0.95rem; color:#64748b; margin-bottom:1.5rem;">Ces clés vous permettent d'utiliser l'assistance automatique de rédaction. Elles sont stockées de manière sécurisée uniquement sur cet ordinateur (localStorage) et ne sont jamais transmises à nos serveurs.</p>
            
            <div style="display:grid; grid-template-columns:1fr; gap:1.5rem;">
               <div>
                  <label style="font-size:0.95rem; font-weight:600; display:block; margin-bottom:0.5rem; color:#334155;">Clé Mammouth.ai (Recommandé)</label>
                  <input type="password" id="api_key_mamouth" value="${state.apiConfig.keys.mamouth}" placeholder="sk-..." style="width:100%; padding:0.8rem; border-radius:8px; border:1px solid #cbd5e1; font-size:1rem;">
               </div>
               <div>
                  <label style="font-size:0.95rem; font-weight:600; display:block; margin-bottom:0.5rem; color:#334155;">Clé OpenAI (ChatGPT / Pro)</label>
                  <input type="password" id="api_key_pro" value="${state.apiConfig.keys.pro}" placeholder="sk-proj-..." style="width:100%; padding:0.8rem; border-radius:8px; border:1px solid #cbd5e1; font-size:1rem;">
               </div>
               <div>
                  <label style="font-size:0.95rem; font-weight:600; display:block; margin-bottom:0.5rem; color:#334155;">Clé Gemini / Autre (Gratuit)</label>
                  <input type="password" id="api_key_free" value="${state.apiConfig.keys.free}" placeholder="Votre Clé API..." style="width:100%; padding:0.8rem; border-radius:8px; border:1px solid #cbd5e1; font-size:1rem;">
               </div>
            </div>
            
            <div style="text-align:right; margin-top:2rem;">
               <button class="btn btn-primary" onclick="saveApiKeys()"><span class="material-icons-round">save</span> Sauvegarder Clés API</button>
            </div>
        </div>

        <div class="card" style="border:1px solid #e2e8f0; padding:2rem; box-shadow:0 4px 6px -1px rgba(0,0,0,0.05);">
            <h3 style="margin:0 0 1rem 0; color:var(--text-main); display:flex; align-items:center; gap:0.5rem;"><span class="material-icons-round" style="color:#ef4444;">security</span> RAG IA : Paramètres d'Anonymisation Avancés</h3>
            
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:2rem; margin-bottom:1.5rem;">
               <div>
                  <label style="font-size:0.95rem; font-weight:600; display:block; margin-bottom:0.5rem; color:#334155;"><span class="material-icons-round" style="font-size:1.1rem; vertical-align:middle; color:#f43f5e;">gpp_bad</span> Mots forcés à masquer</label>
                  <p style="font-size:0.8rem; color:#64748b; margin-top:0;">(Liste noire, séparée par des virgules)</p>
                  <textarea id="sys_rag_mc" style="width:100%; height:120px; padding:1rem; border-radius:8px; border:1px solid #cbd5e1; font-family:inherit; font-size:0.95rem;">${localStorage.getItem('rag_mc') || ''}</textarea>
               </div>
               <div>
                  <label style="font-size:0.95rem; font-weight:600; display:block; margin-bottom:0.5rem; color:#334155;"><span class="material-icons-round" style="font-size:1.1rem; vertical-align:middle; color:#10b981;">verified_user</span> Mots ignorés par l'IA</label>
                  <p style="font-size:0.8rem; color:#64748b; margin-top:0;">(Liste blanche, séparée par des virgules)</p>
                  <textarea id="sys_rag_whitelist" style="width:100%; height:120px; padding:1rem; border-radius:8px; border:1px solid #cbd5e1; font-family:inherit; font-size:0.95rem;">${state.user?.rag_whitelist || ''}</textarea>
               </div>
            </div>
            
            <div style="text-align:right;">
               <button class="btn btn-primary" onclick="saveSysRagSettings()"><span class="material-icons-round">save</span> Sauvegarder Listes d'Anonymisation</button>
            </div>
        </div>
    </div>
  `;
};

window.saveSysRagSettings = async () => {
    if (!state.user) return;
    const mc = document.getElementById('sys_rag_mc').value;
    const wl = document.getElementById('sys_rag_whitelist').value;
    
    // Save MC locally
    localStorage.setItem('rag_mc', mc);
    
    // Save WL in Supabase
    state.user.rag_whitelist = wl;
    await supabaseClient.from('profiles').update({ rag_whitelist: wl }).eq('id', state.user.id);
    
    alert("Paramètres d'anonymisation sauvegardés avec succès !");
};


window.toggleRagDocsByArray = (el, idArray) => {
  const isChecked = el.checked;
  idArray.forEach(id => {
    const box = document.getElementById('rag-cb-' + id);
    if (box) box.checked = isChecked;
  });
};

window.toggleRagSettings = () => {
  const el = document.getElementById('rag-settings-body');
  const icon = document.getElementById('rag-settings-icon');
  if (el.style.display === 'none') {
    el.style.display = 'block';
    icon.innerText = 'expand_less';
  } else {
    el.style.display = 'none';
    icon.innerText = 'expand_more';
  }
};

window.resetRagUI = () => {
  document.getElementById('rag_result_container').style.display = 'none';
  document.getElementById('rag-input-section').style.display = 'flex';
  document.getElementById('rag_llm_response').value = '';
  document.getElementById('rag-clean-result').style.display = 'none';
};

window.copyFinalRagResult = () => {
  const text = document.getElementById('rag-clean-text').innerText;
  navigator.clipboard.writeText(text);
  alert("Résultat copié !");
};

window.handleRagSelection = (e) => {
   const sel = window.getSelection();
   const selectedText = sel.toString().trim();
   if (selectedText.length > 2) {
       window._ragSelectionTemp = selectedText;
       const popup = document.getElementById('rag_selection_popup');
       popup.style.display = 'block';
   }
};

window.toggleRagWhitelist = async (realWord) => {
    if (!state.user) return;
    let wl = (state.user.rag_whitelist || '').split(',').map(s => s.trim()).filter(Boolean);
    if (!wl.includes(realWord)) {
        wl.push(realWord);
    }
    state.user.rag_whitelist = wl.join(', ');
    if (state.user.id) {
       await supabaseClient.from('profiles').update({ rag_whitelist: state.user.rag_whitelist }).eq('id', state.user.id);
    }
    generateRagPrompt();
};

window.toggleRagWhitelistVisibility = () => {
    const chipsDiv = document.getElementById('rag_anonymized_chips');
    const btn = document.getElementById('rag_whitelist_toggle_btn');
    if (chipsDiv && btn) {
        if (chipsDiv.style.display === 'none') {
            chipsDiv.style.display = 'flex';
            btn.innerHTML = `<span class="material-icons-round" style="font-size:0.9rem; margin-right:0.2rem;">visibility_off</span> Masquer les éléments`;
        } else {
            chipsDiv.style.display = 'none';
            btn.innerHTML = `<span class="material-icons-round" style="font-size:0.9rem; margin-right:0.2rem;">visibility</span> Voir les éléments`;
        }
    }
};

window.addSelectionToRag = () => {
   if (!window._ragSelectionTemp) return;
   const sel = window._ragSelectionTemp;
   
   const currentMcBox = document.getElementById('rag_mc');
   const existing = currentMcBox.value.split(',').map(x => x.trim()).filter(Boolean);
   if (!existing.includes(sel)) {
       existing.push(sel);
       currentMcBox.value = existing.join(', ');
       // Auto-save setting
       if (state.user && state.user.id) {
           localStorage.setItem('rag_pc', document.getElementById('rag_pc').value);
           localStorage.setItem('rag_mc', currentMcBox.value);
           supabaseClient.from('profiles').update({ personal_context: document.getElementById('rag_pc').value }).eq('id', state.user.id);
       }
   }
   
   window.closeRagSelectionPopup();
   alert(`"${sel}" a été ajouté aux entités obligatoires à masquer. Veuillez relancer la "Génération du Prompt".`);
};

window.closeRagSelectionPopup = () => {
   const popup = document.getElementById('rag_selection_popup');
   if (popup) popup.style.display = 'none';
   window._ragSelectionTemp = null;
};

window.generateRagPrompt = async () => {
  const promptText = document.getElementById('rag_prompt').value;
  if (!promptText) return alert("Veuillez entrer une consigne (prompt) pour l'IA.");

  document.getElementById('rag-loader').style.display = 'block';
  document.getElementById('rag_result_container').style.display = 'none';

  setTimeout(async () => {
    const pc = document.getElementById('rag_pc').value;
    const mc = document.getElementById('rag_mc').value.split(',').map(s => s.trim()).filter(Boolean);

    // Auto-anonymisation : injecter les noms des utilisateurs de la collectivité
    state.users.forEach(u => {
      if (u.username && u.username.length > 2 && !mc.includes(u.username)) mc.push(u.username);
      if (u.email && !mc.includes(u.email)) mc.push(u.email);
    });

    const cbs = document.querySelectorAll('.rag-doc-cb:checked');
    let docsContent = "";
    cbs.forEach(cb => {
      const docId = parseInt(cb.value);
      const d = state.subjects.flatMap(s => s.docs || []).find(x => x.id === docId);
      if (d) {
        docsContent += `\n\n--- DOCUMENT: ${d.title} ---\n${d.content}\n`;
      }
    });

    const tmpCbs = document.querySelectorAll('.rag-temp-cb:checked');
    tmpCbs.forEach(cb => {
      const docId = parseInt(cb.value);
      const d = state.tempRagDocs.find(x => x.id === docId);
      if (d) {
        docsContent += `\n\n--- DOCUMENT ÉPHÉMÈRE: ${d.name} ---\n${d.content}\n`;
      }
    });

    let fullContext = "";
    if (pc) fullContext += `[CONTEXTE UTILISATEUR]\n${pc}\n\n`;
    if (docsContent) fullContext += `[DOCUMENTS FOURNIS]\n${docsContent}\n\n`;
    
    fullContext += `[DIRECTIVE]\n${promptText}`;

    const wl = (state.user?.rag_whitelist || '').split(',').map(s => s.trim()).filter(Boolean);
    const res = await pseudonymiseText(fullContext, mc, wl);

    // Directive formelle pour préserver les crochets (AFTER pseudonymization)
    const formattingInstruction = "\n\n[IMPORTANT] Les noms propres, entités ou données personnelles ont été remplacés par des pseudonymes entre crochets, par exemple [Hugues CARPENTIER]. Vous DEVEZ ABSOLUMENT conserver ce format exact avec les crochets dans votre réponse pour ces entités, sans jamais les modifier (ne pas transformer en [M. CARPENTIER] ou [Hugues]).";
    res.text += formattingInstruction;

    // Appliquer style CSS sur les entités pour affichage
    let displayHtml = sanitizeHTML(res.text);
    Object.values(res.map).forEach(fakeBracketed => {
        const safeFake = sanitizeHTML(fakeBracketed);
        const escapeRegExp = (string) => string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        displayHtml = displayHtml.replace(new RegExp(escapeRegExp(safeFake), 'g'), `<span style="color:#ef4444; font-weight:bold;">${safeFake}</span>`);
    });

    document.getElementById('rag_compiled').innerHTML = displayHtml;
    document.getElementById('rag_compiled_hidden').value = res.text;

    // Rendering Whitelist Chips
    const chipsDiv = document.getElementById('rag_anonymized_chips');
    const wlContainer = document.getElementById('rag_whitelist_container');
    const anonymizedKeys = Object.keys(res.map);
    
    if (chipsDiv && wlContainer) {
        if (anonymizedKeys.length > 0) {
            wlContainer.style.display = 'block';
            chipsDiv.innerHTML = anonymizedKeys.map(real => {
                 const fake = res.map[real];
                 return `<label style="background:#f1f5f9; border:1px solid #cbd5e1; padding:0.3rem 0.6rem; border-radius:16px; font-size:0.75rem; display:flex; align-items:center; gap:0.4rem; cursor:pointer; color:#334155; transition:all 0.2s;" onmouseenter="this.style.background='#e2e8f0'" onmouseleave="this.style.background='#f1f5f9'">
                    <input type="checkbox" checked onchange="toggleRagWhitelist('${real.replace(/'/g, "\\'")}')" style="accent-color:#ef4444;">
                    <span title="Si vous décochez, ce mot ne sera plus masqué."><b>${sanitizeHTML(real)}</b> <span class="material-icons-round" style="font-size:0.8rem; margin:0 0.1rem; vertical-align:middle; color:#94a3b8;">arrow_forward</span> <span style="color:#ef4444;"><b>${sanitizeHTML(fake)}</b></span></span>
                 </label>`;
            }).join('');
        } else {
            wlContainer.style.display = 'none';
        }
    }

    document.getElementById('rag-input-section').style.display = 'none';
    document.getElementById('rag_result_container').style.display = 'flex';
    document.getElementById('rag-loader').style.display = 'none';

    localStorage.setItem('rag_keys', JSON.stringify(res.map));
  }, 100); // Let UI update loader
};

window.copyRagPrompt = () => {
  const el = document.getElementById('rag_compiled_hidden');
  el.style.display = 'block';
  el.select();
  document.execCommand('copy');
  el.style.display = 'none';
  alert("Prompt anonymisé copié dans le presse-papier !");
};

window.deanonymiseRag = () => {
  let llmText = document.getElementById('rag_llm_response').value;
  if (!llmText) return alert("Veuillez coller la réponse du LLM en premier.");
  try {
    const map = JSON.parse(localStorage.getItem('rag_keys') || '{}');
    for (const [real, fake] of Object.entries(map)) {
      const escapeRegExp = (string) => string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(escapeRegExp(fake), 'gi'); // Ignorer la casse pour le retour LLM
      llmText = llmText.replace(regex, real);
    }

    const cleanDiv = document.getElementById('rag-clean-text');
    cleanDiv.innerText = llmText; // Use innerText to preserve line breaks safely
    document.getElementById('rag-clean-result').style.display = 'block';

  } catch (e) {
    console.error(e);
    alert("Erreur lors de la désanonymisation : " + e.message);
  }
};

window.pseudonymiseText = async (text, mandatoryEntities, whitelist = []) => {
  // map contiendra la correspondance Finale (Real -> [Fake]) pour la session/texte en cours
  let map = {};
  
  // Assurons nous que le dictionnaire local est chargé
  if (Object.keys(state.localDict).length === 0) {
      const localContext = localStorage.getItem('eluConnect_localContext');
      if (localContext) state.localDict = JSON.parse(localContext);
  }

  const getOrGenerateFakeFor = async (realStr, type, forcedFake = null) => {
    if (!realStr || realStr.length < 2) return realStr;
    if (whitelist.includes(realStr)) return realStr;
    if (map[realStr]) return map[realStr]; // Déjà matché dans ce run
    if (state.localDict[realStr]) {
        map[realStr] = state.localDict[realStr]; // Existant dans le dictionnaire de Pseudos
        return map[realStr];
    }
    
    if (forcedFake) {
        map[realStr] = forcedFake;
        state.localDict[realStr] = forcedFake;
        return forcedFake;
    }

    let fake = "";
    if (type === 'Person') fake = window.faker.person.fullName();
    else if (type === 'Place' || type === 'LOC') fake = window.faker.location.city();
    else if (type === 'Organization' || type === 'ORG') fake = window.faker.company.name();
    else if (type === 'Email') fake = window.faker.internet.email();
    else if (type === 'Phone') {
        const randPhone = "06" + Math.floor(10000000 + Math.random() * 90000000);
        fake = randPhone;
    } else fake = window.faker.person.lastName();

    fake = "[" + fake + "]";

    map[realStr] = fake;
    state.localDict[realStr] = fake;
    
    // --- ZERO-KNOWLEDGE SUPABASE PERSISTENCE ---
    // Puisque c'est un NOUVEAU pseudonyme généré, on le sauvegarde sur Supabase
    if (window.sessionCollectivityKey && state.user) {
        try {
             const collId = state.user.collectivite_id;
             if (collId) {
                 const hash = await window.CryptoManager.hashName(realStr);
                 const payload = { real_name: realStr, pseudo: fake };
                 const encData = await window.CryptoManager.encryptDictionaryEntry(payload, window.sessionCollectivityKey);

                 await supabaseClient.from('pseudonymization_dict').upsert({
                     collectivite_id: collId,
                     real_name_hash: hash,
                     encrypted_data: encData.cipher,
                     iv: encData.iv
                 }, { onConflict: 'collectivite_id, real_name_hash' });
             }
        } catch(e) {
             console.error("Erreur de sauvegarde Zero-Knowledge du pseudonyme:", e);
        }
    }
    
    // Sauvegarde en cache clair de la session courante
    localStorage.setItem('eluConnect_localContext', JSON.stringify(state.localDict));

    return fake;
  };

  // 1. Mandatory Entités
  for (const ent of mandatoryEntities) {
    const fake = await getOrGenerateFakeFor(ent, 'Person');
    const parts = ent.split(/[\s-]/).filter(Boolean);
    if (parts.length === 2) {
       const reverseReal = parts[1] + ' ' + parts[0];
       const fakeParts = fake.replace(/\[|\]/g, '').split(/\s/);
       if (fakeParts.length >= 2) {
           const reverseFake = '[' + fakeParts[1] + ' ' + fakeParts[0] + ']';
           await getOrGenerateFakeFor(reverseReal, 'Person', reverseFake);
       } else {
           await getOrGenerateFakeFor(reverseReal, 'Person', fake);
       }
    }
  }

  // 2. Extractions Regex (Emails & Phones)
  const emailRegex = /([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9._-]+)/gi;
  const emails = text.match(emailRegex) || [];
  for (const e of emails) await getOrGenerateFakeFor(e, 'Email');

  const phoneRegex = /(?:(?:\+|00)33|0)\s*[1-9](?:[\s.-]*\d{2}){4}/g;
  const phones = text.match(phoneRegex) || [];
  for (const p of phones) await getOrGenerateFakeFor(p, 'Phone');

  // 3. Extraction IA Locale via Transformers.js (au lieu de Compromise)
  try {
      if (window.analyzeTextWithVMBTask) {
          const aiEntities = await window.analyzeTextWithVMBTask(text);
          // aiEntities est un array: { type: 'PER', word: "Jean Dupont", score: 0.98, ... }
          for (const ent of aiEntities) {
              // Filtrer un peu la casse ou la longueur pour éviter du bruit IA
              if (ent.word.length > 2 && ent.score > 0.8) {
                  await getOrGenerateFakeFor(ent.word.trim(), ent.type);
              }
          }
      }
  } catch (err) {
      console.warn("L'IA Locale n'est pas disponible ou a échoué. On utilise l'ancienne méthode de Regex.", err);
  }

  // 4. Remplacement effectif
  let newText = text;
  const sortedKeys = Object.keys(map).sort((a, b) => b.length - a.length);
  let usedMap = {};

  sortedKeys.forEach(real => {
    const fake = map[real];
    const escapeRegExp = (string) => string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`(^|[^a-zA-ZÀ-ÿ0-9_])(${escapeRegExp(real)})(?=[^a-zA-ZÀ-ÿ0-9_]|$)`, 'gi');
    
    let matched = false;
    newText = newText.replace(regex, (m, p1, p2) => {
        matched = true;
        return p1 + fake;
    });
    
    if (matched) usedMap[real] = fake;
  });

  return { text: newText, map: usedMap };
};
