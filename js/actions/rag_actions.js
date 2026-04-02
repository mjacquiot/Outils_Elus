// --- RAG IA & ANONYMISATION ---
window.renderRagIaView = () => {
  const profile = state.users.find(u => u.id === state.user.id);
  const pc = profile && profile.personal_context ? profile.personal_context : (localStorage.getItem('rag_pc') || '');
  const mc = localStorage.getItem('rag_mc') || ''; // Mandatory entities

  const allDocs = [];
  state.themes.filter(t => !t.isArchived).forEach(t => {
    let themeDocs = [];
    const subs = state.subjects.filter(s => s.themeId === t.id && Permissions.canSeeSubject(s, state.user));
    subs.forEach(s => {
      if (s.docs && s.docs.length > 0) {
        themeDocs.push({ subject: s, docs: s.docs });
      }
    });
    if (themeDocs.length > 0) allDocs.push({ theme: t, subjects: themeDocs });
  });

  const validCouncils = state.councils.slice().sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 5);

  return `
    <div class="view-header">
      <h2 style="display:flex; align-items:center; gap:0.5rem;"><span class="material-icons-round" style="color:var(--primary); font-size:2.5rem; filter:drop-shadow(0 4px 3px rgb(0 0 0 / 0.07));">smart_toy</span>IA & Rédaction Assistée (RAG)</h2>
      <p style="color:var(--text-muted); font-size:1.05rem;">Générez des requêtes IA intelligentes enrichies par vos documents tout en préservant 100% de la confidentialité de vos données sensibles.</p>
    </div>
    
    <div style="margin-bottom:2rem; background:white; border-radius:12px; border:1px solid #e2e8f0; box-shadow:0 4px 6px -1px rgba(0,0,0,0.05); overflow:hidden;">
       <div style="background:linear-gradient(to right, #f8fafc, #f1f5f9); padding:1rem 1.5rem; cursor:pointer; display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid #e2e8f0;" onclick="toggleRagSettings()">
          <h3 style="margin:0; font-size:1.1rem; display:flex; align-items:center; gap:0.5rem; color:var(--text-main);"><span class="material-icons-round" style="color:var(--primary);">tune</span> Paramètres de contexte et de pseudonymisation</h3>
          <span class="material-icons-round" id="rag-settings-icon" style="color:#64748b; background:white; border-radius:50%; box-shadow:0 1px 2px rgba(0,0,0,0.1); padding:0.2rem;">${pc ? 'expand_more' : 'expand_less'}</span>
       </div>
       <div id="rag-settings-body" style="padding:1.5rem 2rem; display:${pc ? 'none' : 'block'}; background:white;">
          <div style="display:grid; grid-template-columns:1fr 1fr; gap:2rem;">
              <div>
                  <label style="font-size:0.9rem; font-weight:600; display:block; margin-bottom:0.5rem; color:#334155;"><span class="material-icons-round" style="font-size:1.1rem; vertical-align:middle; color:#8b5cf6;">person</span> Votre contexte personnel (rôle, mandat...)</label>
                  <textarea id="rag_pc" style="width:100%; height:100px; padding:1rem; border-radius:8px; border:1px solid #cbd5e1; font-family:inherit; background:#f8fafc; transition:all 0.2s;" placeholder="Ex: Je suis Maire de la commune de X...">${sanitizeHTML(pc)}</textarea>
              </div>
              <div>
                  <label style="font-size:0.9rem; font-weight:600; display:block; margin-bottom:0.5rem; color:#334155;"><span class="material-icons-round" style="font-size:1.1rem; vertical-align:middle; color:#f43f5e;">gpp_bad</span> Entités à pseudonymiser obligatoirement</label>
                  <textarea id="rag_mc" style="width:100%; height:100px; padding:1rem; border-radius:8px; border:1px solid #cbd5e1; font-family:inherit; background:#f8fafc; transition:all 0.2s;" placeholder="ex: Jean Dupont, Mairie de Trifouilly (séparé par des virgules)">${sanitizeHTML(mc)}</textarea>
                  <div style="margin-top:0.5rem; text-align:right;">
                     <label class="btn btn-outline btn-sm" style="cursor:pointer; padding:0.2rem 0.5rem; font-size:0.75rem;"><input type="file" id="ragCsvImport" accept=".csv" style="display:none" onchange="importRagMcCsv(event)"><span class="material-icons-round" style="font-size:1rem; margin-right:0.3rem;">upload_file</span> Importer liste CSV (Noms, Emails...)</label>
                  </div>
              </div>
          </div>
          <div style="text-align:right; margin-top:1.5rem;">
              <button class="btn btn-primary" onclick="saveRagContext()"><span class="material-icons-round">save</span> Sauvegarder Paramètres de Contexte</button>
          </div>
       </div>
    </div>
    
    <div style="display:grid; grid-template-columns:1fr 1.2fr; gap:2rem;">
      <div style="display:flex; flex-direction:column; gap:1.5rem;">
         <div class="card" style="border:1px solid #e2e8f0; height:450px; display:flex; flex-direction:column; box-shadow:0 4px 6px -1px rgba(0,0,0,0.05);">
             <h3 style="margin:0 0 1rem 0; font-size:1.1rem; border-bottom:1px solid #f1f5f9; padding-bottom:1rem; display:flex; align-items:center; gap:0.5rem; color:var(--text-main);"><span class="material-icons-round" style="color:#0ea5e9;">folder_open</span> Documents à inclure dans l'IA</h3>
             <div style="flex:1; overflow-y:auto; font-size:0.95rem; padding-right:0.5rem;">
                ${validCouncils.length > 0 ? `
                   <div style="margin-bottom:1.5rem; padding-bottom:1rem; border-bottom:1px dashed #cbd5e1;">
                      <div style="font-weight:600; font-size:0.95rem; color:#f59e0b; margin-bottom:0.8rem;"><span class="material-icons-round" style="font-size:1.1rem; vertical-align:middle;">calendar_month</span> Conseils Communaux (5 derniers)</div>
                      ${validCouncils.map(c => {
    const agIds = (c.agenda || []).map(a => typeof a === 'object' ? a.id : a);
    const dIds = state.subjects.filter(sb => agIds.includes(sb.id) && sb.docs).flatMap(sb => sb.docs.map(doc => doc.id));
    if (dIds.length === 0) return '';
    return `
                             <label style="display:flex; align-items:center; gap:0.5rem; cursor:pointer; margin-left:1rem; margin-bottom:0.5rem;">
                                <input type="checkbox" onchange="toggleRagDocsByArray(this, [${dIds.join(',')}])">
                                <span style="font-size:0.85rem; color:var(--text-main); font-weight:500;">Conseil du ${new Date(c.date).toLocaleDateString('fr-FR')} <span style="font-size:0.75rem; color:#94a3b8; font-weight:normal;">(${dIds.length} doc${dIds.length > 1 ? 's' : ''})</span></span>
                             </label>
                          `;
  }).join('')}
                   </div>
                ` : ''}

                ${allDocs.length === 0 ? '<p style="color:#94a3b8; font-style:italic;">Aucun document disponible. Uploadez des fichiers.</p>' : ''}
                ${allDocs.map(t => {
    const themeDocsIds = t.subjects.flatMap(s => s.docs.map(d => d.id));
    return `
                   <details style="margin-bottom:1rem;">
                     <summary style="display:flex; align-items:center; gap:0.5rem; cursor:pointer;">
                        <input type="checkbox" onchange="toggleRagDocsByArray(this, [${themeDocsIds.join(',')}])" onclick="event.stopPropagation()">
                        <span style="font-weight:600; color:var(--primary); display:flex; align-items:center; gap:0.3rem;"><span class="material-icons-round" style="font-size:1.2rem;">folder</span>${sanitizeHTML(t.theme.title)}</span>
                     </summary>
                     ${t.subjects.map(s => {
      const subjDocsIds = s.docs.map(d => d.id);
      return `
                        <details style="margin-left:1.5rem; margin-top:0.4rem;">
                           <summary style="display:flex; align-items:center; gap:0.5rem; cursor:pointer;">
                              <input type="checkbox" onchange="toggleRagDocsByArray(this, [${subjDocsIds.join(',')}])" onclick="event.stopPropagation()">
                              <span style="font-weight:500; font-size:0.85rem; color:#475569; display:flex; align-items:center; gap:0.3rem;"><span class="material-icons-round" style="font-size:1rem;">topic</span>${sanitizeHTML(s.subject.title)}</span>
                           </summary>
                           <div style="margin-left:1.5rem; display:flex; flex-direction:column; gap:0.4rem; margin-top:0.4rem; margin-bottom:0.8rem;">
                              ${s.docs.map(d => `
                                <label style="display:flex; align-items:center; gap:0.5rem; cursor:pointer;">
                                   <input type="checkbox" class="rag-doc-cb" id="rag-cb-${d.id}" value="${d.id}" data-title="${sanitizeHTML(d.title)}">
                                   <span style="font-size:0.85rem; color:var(--text-main);"><span class="material-icons-round" style="font-size:0.9rem; vertical-align:middle; margin-right:0.2rem; color:#94a3b8;">description</span>${sanitizeHTML(d.title)}</span>
                                </label>
                              `).join('')}
                           </div>
                        </details>
                     `}).join('')}
                   </details>
                `}).join('')}

                 <!-- DOCUMENTS ÉPHÉMÈRES -->
                 <div style="margin-top:2rem; padding-top:1rem; border-top:1px dashed #cbd5e1;">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.8rem;">
                       <div style="font-weight:600; font-size:0.95rem; color:#8b5cf6;"><span class="material-icons-round" style="font-size:1.1rem; vertical-align:middle;">attach_file</span> Documents Importés (Éphémères)</div>
                       <div style="display:flex; gap:0.5rem;">
                           <label class="btn btn-outline btn-sm" style="cursor:pointer; padding:0.3rem 0.6rem; font-size:0.75rem; border-color:#8b5cf6; color:#7c3aed;">
                               <input type="file" accept=".pdf,.txt,.csv,.xls,.xlsx,.png,.jpg" multiple style="display:none" onchange="handleTempRagUpload(event)">
                               <span class="material-icons-round" style="font-size:0.9rem; margin-right:0.2rem;">note_add</span> Fichier(s)
                           </label>
                           <label class="btn btn-outline btn-sm" style="cursor:pointer; padding:0.3rem 0.6rem; font-size:0.75rem; border-color:#8b5cf6; color:#7c3aed;">
                               <input type="file" accept=".pdf,.txt,.csv,.xls,.xlsx,.png,.jpg" multiple webkitdirectory style="display:none" onchange="handleTempRagUpload(event)">
                               <span class="material-icons-round" style="font-size:0.9rem; margin-right:0.2rem;">create_new_folder</span> Dossier
                           </label>
                           ${state.tempRagDocs.length > 0 ? `<button class="btn btn-icon" style="color:#ef4444; width:24px; height:24px; padding:0;" onclick="clearTempRagDocs()" title="Vider"><span class="material-icons-round" style="font-size:1rem;">delete</span></button>` : ''}
                       </div>
                    </div>
                    <div id="rag-temp-loader" style="display:none; text-align:center; padding:1rem; color:#64748b; font-size:0.85rem;"><div class="spinner" style="width:20px;height:20px;margin:0 auto 0.5rem auto;"></div>Extraction du texte...</div>
                    <div id="rag-temp-list" style="margin-left:1.5rem; display:flex; flex-direction:column; gap:0.4rem;">
                       ${state.tempRagDocs.length === 0 ? '<div style="font-size:0.8rem; color:#94a3b8; font-style:italic;">Aucun document éphémère.</div>' : ''}
                       ${state.tempRagDocs.map(d => `
                          <label style="display:flex; align-items:center; gap:0.5rem; cursor:pointer;">
                             <input type="checkbox" class="rag-temp-cb" value="${d.id}" checked>
                             <span style="font-size:0.85rem; color:var(--text-main);">${sanitizeHTML(d.name)}</span>
                          </label>
                       `).join('')}
                    </div>
                 </div>

             </div>
          </div>
      </div>

      <div style="display:flex; flex-direction:column; gap:1.5rem;">
         <div class="card" style="border:1px solid #e2e8f0; display:flex; flex-direction:column; box-shadow:0 4px 6px -1px rgba(0,0,0,0.05); min-height:450px;">
             
             <!-- TABS -->
             <div style="display:flex; border-bottom:1px solid #e2e8f0; margin:-1.5rem -1.5rem 1.5rem -1.5rem; background:#f8fafc; border-radius:12px 12px 0 0;">
                <div onclick="switchRagMode('manuel')" style="flex:1; padding:1rem; text-align:center; font-weight:600; cursor:pointer; border-right:1px solid #e2e8f0; color:${state.aiChatMode === 'auto' ? '#64748b' : 'var(--primary)'}; background:${state.aiChatMode === 'auto' ? 'transparent' : 'white'}; border-bottom:${state.aiChatMode === 'auto' ? '1px solid transparent' : '2px solid var(--primary)'};"><span class="material-icons-round" style="vertical-align:middle; font-size:1.1rem; margin-right:0.3rem;">draw</span> Mode Manuel (Copier/Coller)</div>
                ${Boolean(state.apiConfig.keys.mamouth || state.apiConfig.keys.pro || state.apiConfig.keys.free) ? `<div onclick="switchRagMode('auto')" style="flex:1; padding:1rem; text-align:center; font-weight:600; cursor:pointer; color:${state.aiChatMode === 'auto' ? '#ef4444' : '#64748b'}; background:${state.aiChatMode === 'auto' ? 'white' : 'transparent'}; border-bottom:${state.aiChatMode === 'auto' ? '2px solid #ef4444' : '1px solid transparent'};"><span class="material-icons-round" style="vertical-align:middle; font-size:1.1rem; margin-right:0.3rem;">smart_toy</span> Mode Auto (Chat API)</div>` : ''}
             </div>

             <!-- MODE MANUEL (Copier Coller) -->
             <div id="rag-manuel-mode" style="display:${state.aiChatMode === 'auto' ? 'none' : 'flex'}; flex-direction:column; flex:1;">
                 <!-- Prompt Input -->
                 <div id="rag-input-section" style="flex:1; display:flex; flex-direction:column;">
                    <h3 style="margin:0 0 1rem 0; font-size:1.1rem; display:flex; align-items:center; gap:0.5rem; color:var(--text-main);"><span class="material-icons-round" style="color:#8b5cf6;">draw</span> Votre Demande (Prompt)</h3>
                    <textarea id="rag_prompt" style="flex:1; width:100%; min-height:150px; padding:1rem; border-radius:8px; border:1px solid #cbd5e1; margin-bottom:1rem; font-family:inherit; font-size:1rem; resize:none; background:#f8fafc;" placeholder="Rédigez ici votre question pour l'IA (ex: Fais-moi une synthèse structurée de ces documents en prenant compte de ma fonction...)"></textarea>
                
                <button class="btn btn-primary" onclick="generateRagPrompt()" style="width:100%; justify-content:center; padding:1rem; font-size:1.1rem; background:linear-gradient(135deg, var(--primary) 0%, #3730a3 100%);"><span class="material-icons-round" style="margin-right:0.5rem;">security</span> Générer le Prompt Anonymisé</button>
                <div id="rag-loader" style="display:none; text-align:center; margin-top:1.5rem; color:#64748b; font-size:0.9rem;"><div class="spinner" style="width:24px;height:24px;border-width:3px;margin:0 auto 0.5rem auto;"></div>Pseudonymisation locale en cours...</div>
             </div>

             <!-- Compiled Prompt Output -->
             <div id="rag_result_container" style="display:none; flex-direction:column; flex:1;">
                <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:1rem;">
                    <h3 style="margin:0; font-size:1.1rem; color:#059669; display:flex; align-items:center; gap:0.5rem;"><span class="material-icons-round">task_alt</span> Prompt Prêt (100% Anonyme)</h3>
                    <button class="btn btn-icon" style="color:#64748b;" onclick="resetRagUI()" title="Recommencer"><span class="material-icons-round">refresh</span></button>
                </div>
                <p style="font-size:0.9rem; color:#047857; background:#d1fae5; padding:0.8rem; border-radius:8px; border:1px solid #a7f3d0; margin-top:0;">1. Copiez ce texte et collez-le dans l'interface de votre IA (ChatGPT, Claude, Gemini...). Les données sensibles ont été masquées.</p>
                 <div style="position:relative;">
                    <div id="rag_compiled" onmouseup="handleRagSelection(event)" style="width:100%; height:120px; padding:1rem; border-radius:8px; border:1px solid #a7f3d0; background:#f0fdf4; margin-bottom:0.5rem; font-family:inherit; font-size:0.85rem; overflow-y:auto; white-space:pre-wrap;"></div>
                    <textarea id="rag_compiled_hidden" style="display:none;"></textarea>
                    
                    <div id="rag_whitelist_container" style="display:none; margin-top:0.5rem; padding:1rem; background:#fff; border:1px solid #e2e8f0; border-radius:8px; margin-bottom:1rem;">
                        <div style="font-size:0.85rem; font-weight:600; color:#475569; margin-bottom:0.1rem; display:flex; justify-content:space-between; align-items:center;">
                           <span>Éléments pseudonymisés :</span>
                           <button class="btn btn-outline btn-sm" onclick="toggleRagWhitelistVisibility()" id="rag_whitelist_toggle_btn" style="font-size:0.75rem; padding:0.2rem 0.5rem; background:white;"><span class="material-icons-round" style="font-size:0.9rem; margin-right:0.2rem;">visibility</span> Voir les éléments</button>
                        </div>
                        <div id="rag_anonymized_chips" style="display:none; flex-wrap:wrap; gap:0.5rem; margin-top:0.8rem;"></div>
                    </div>
                    
                    <div id="rag_selection_popup" style="display:none; position:absolute; bottom:20px; right:20px; background:#1e293b; color:white; padding:0.5rem; border-radius:8px; box-shadow:0 4px 6px -1px rgba(0,0,0,0.2); z-index:50;">
                       <div style="font-size:0.75rem; margin-bottom:0.4rem; color:#94a3b8; font-weight:600;">Oubli IA ? Cacher ce mot (Regénérer ensuite):</div>
                       <div style="display:flex; gap:0.4rem;">
                          <button class="btn btn-primary btn-sm" style="font-size:0.7rem; padding:0.2rem 0.5rem;" onclick="addSelectionToRag()"><span class="material-icons-round" style="font-size:0.9rem; margin-right:0.2rem;">person_off</span> Masquer Obligatoirement</button>
                          <button class="btn btn-icon btn-sm" style="color:#ef4444; width:22px; height:22px; padding:0; background:transparent;" onclick="closeRagSelectionPopup()"><span class="material-icons-round" style="font-size:1.1rem;">close</span></button>
                       </div>
                    </div>
                 </div>
                <button class="btn btn-outline" style="border-color:#10b981; color:#059669; justify-content:center;" onclick="copyRagPrompt()"><span class="material-icons-round" style="margin-right:0.4rem;">content_copy</span>Copier le texte</button>
                
                <div style="margin:2rem 0; border-top:1px dashed #cbd5e1; position:relative;">
                   <span style="position:absolute; top:-12px; left:50%; transform:translateX(-50%); background:white; padding:0 1rem; color:#94a3b8; font-size:0.85rem; font-weight:600;"><span class="material-icons-round" style="font-size:1.2rem; vertical-align:middle;">arrow_downward</span> ENSUITE</span>
                </div>
                
                <h3 style="margin:0 0 0.5rem 0; font-size:1.1rem; color:var(--text-main); display:flex; align-items:center; gap:0.5rem;"><span class="material-icons-round" style="color:#f59e0b;">auto_fix_high</span> 2. Restaurer les noms</h3>
                <p style="font-size:0.85rem; color:#64748b; margin-top:0;">Collez la réponse fournie par l'IA ci-dessous. Les vraies informations réapparaîtront instantanément.</p>
                <textarea id="rag_llm_response" style="width:100%; height:120px; padding:1rem; border-radius:8px; border:1px solid #cbd5e1; margin-bottom:0.5rem; font-family:inherit; font-size:0.9rem; background:#f8fafc;" placeholder="Collez la réponse factice de l'IA ici..."></textarea>
                <button class="btn btn-primary" style="width:100%; justify-content:center; background:#f59e0b; border-color:#d97706; color:white;" onclick="deanonymiseRag()">Révéler les vraies données</button>
                
                <!-- Magic result div -->
                <div id="rag-clean-result" style="display:none; margin-top:1.5rem; padding:1.5rem; background:white; border-radius:8px; border:2px solid #8b5cf6; box-shadow:0 10px 15px -3px rgba(139,92,246,0.1);">
                   <div style="color:#6d28d9; font-weight:700; margin-bottom:1rem; display:flex; align-items:center; gap:0.5rem;"><span class="material-icons-round">verified</span> Réponse dé-anonymisée :</div>
                   <div id="rag-clean-text" style="font-family:Georgia, serif; line-height:1.7; color:#334155; font-size:1rem; white-space:pre-wrap;"></div>
                    <button class="btn btn-outline btn-sm" style="margin-top:1rem; width:100%; justify-content:center; border-color:#8b5cf6; color:#6d28d9;" onclick="copyFinalRagResult()"><span class="material-icons-round" style="margin-right:0.4rem;">content_copy</span>Copier cette réponse</button>
                 </div>
              </div>
            </div>

            <!-- MODE AUTO (Chat IA) -->
            <div id="rag-auto-mode" style="display:${state.aiChatMode === 'auto' ? 'flex' : 'none'}; flex-direction:column; flex:1; height:100%;">
                
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1rem;">
                    <div style="display:flex; align-items:center; gap:0.5rem;">
                        <span style="font-size:0.85rem; font-weight:600; color:#475569;">API :</span>
                        <select id="api_selector_active" style="padding:0.3rem; border-radius:4px; border:1px solid #cbd5e1; font-size:0.85rem; background:white;" onchange="changeActiveApi()">
                           <option value="none" ${state.apiConfig.active === 'none' ? 'selected' : ''}>Aucune (Mode manuel)</option>
                           <option value="mamouth" ${state.apiConfig.active === 'mamouth' ? 'selected' : ''}>Mammouth.ai</option>
                           <option value="pro" ${state.apiConfig.active === 'pro' ? 'selected' : ''}>OpenAI</option>
                           <option value="free" ${state.apiConfig.active === 'free' ? 'selected' : ''}>Gemini</option>
                        </select>
                    </div>
                    
                    <button class="btn btn-outline btn-sm" onclick="toggleChatViewMode()" style="padding:0.3rem 0.6rem; font-size:0.8rem; border-color:${state.aiChatViewMode === 'anon' ? '#ef4444' : '#10b981'}; color:${state.aiChatViewMode === 'anon' ? '#ef4444' : '#10b981'};">
                       <span class="material-icons-round" style="font-size:1.1rem; margin-right:0.3rem;">${state.aiChatViewMode === 'anon' ? 'visibility_off' : 'visibility'}</span>
                       ${state.aiChatViewMode === 'anon' ? 'Inspecter Vue Anonyme (IA)' : 'Vue Normale (Locale)'}
                    </button>
                </div>
                
                <div id="chat-messages-container" style="flex:1; border:1px solid #e2e8f0; border-radius:8px; padding:1rem; background:#f8fafc; overflow-y:auto; display:flex; flex-direction:column; gap:1rem; min-height:250px; margin-bottom:1rem;">
                    ${state.aiChat.length === 0 ? '<div style="text-align:center; color:#94a3b8; margin:auto;"><span class="material-icons-round" style="font-size:3rem; opacity:0.5; display:block; margin-bottom:0.5rem;">forum</span>Posez votre première question. Vos documents cochés seront envoyés automatiquement de façon anonyme.</div>' : ''}
                    ${state.aiChat.map(msg => renderChatMessage(msg)).join('')}
                </div>
                
                <div style="display:flex; gap:0.5rem;">
                   <textarea id="chat_prompt_input" style="flex:1; padding:0.8rem; border-radius:8px; border:1px solid #cbd5e1; font-family:inherit; font-size:0.95rem; resize:none; height:60px;" placeholder="Votre message..." onkeydown="if(event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); sendChatMessage(); }"></textarea>
                   <button class="btn btn-primary" onclick="sendChatMessage()" style="background:#ef4444; border-color:#dc2626;"><span class="material-icons-round">send</span></button>
                </div>

            </div>

         </div>
      </div>
    </div>
  `;
};

// --- LOGIQUE RAG IA AUTO & EPHEMERE ---
window.changeActiveApi = () => {
  const v = document.getElementById('api_selector_active').value;
  state.apiConfig.active = v;
  localStorage.setItem('rag_api_active', v);
  render();
};

window.switchRagMode = (mode) => {
  state.aiChatMode = mode;
  render();
};

window.toggleChatViewMode = () => {
  state.aiChatViewMode = state.aiChatViewMode === 'anon' ? 'clear' : 'anon';
  render();
};

window.renderChatMessage = (msg) => {
  const isUser = msg.role === 'user';
  const displayTxt = state.aiChatViewMode === 'anon' ? msg.anonText : msg.clearText;
  return `
    <div style="display:flex; flex-direction:column; align-items:${isUser ? 'flex-end' : 'flex-start'};">
       <span style="font-size:0.75rem; color:#64748b; margin-bottom:0.2rem; margin-left:1rem; margin-right:1rem;">
          ${isUser ? state.user.username : (state.apiConfig.active === 'mamouth' ? 'Mammouth.ai' : (state.apiConfig.active === 'pro' ? 'OpenAI' : 'Assistant (Auto)'))}
       </span>
       <div style="background:${isUser ? 'linear-gradient(135deg, var(--primary), #3730a3)' : 'white'}; color:${isUser ? 'white' : 'var(--text-main)'}; border:1px solid ${isUser ? 'transparent' : '#cbd5e1'}; padding:0.8rem 1rem; border-radius:12px; font-size:0.95rem; max-width:85%; white-space:pre-wrap; line-height:1.6; box-shadow:0 1px 2px rgba(0,0,0,0.05);">
          ${sanitizeHTML(displayTxt)}
       </div>
    </div>
  `;
};

window.sendChatMessage = async () => {
  const inputEl = document.getElementById('chat_prompt_input');
  if (!inputEl) return;
  const txt = inputEl.value.trim();
  if (!txt) return;

  const activeApiStr = state.apiConfig.active;
  if (activeApiStr === 'none') return alert('Veuillez sélectionner une API avant de discuter.');

  const apiKey = state.apiConfig.keys[activeApiStr];
  if (!apiKey) return alert('La clé API pour ce service n\'est pas configurée dans les paramètres.');

  // UI state : ajout user
  inputEl.value = '';

  // 1. Constuire le contexte de base
  const pc = document.getElementById('rag_pc').value;
  const mc = document.getElementById('rag_mc').value.split(',').map(s => s.trim()).filter(Boolean);

  // Auto-anonymisation : injecter les noms des utilisateurs de la collectivité
  state.users.forEach(u => {
    if (u.username && u.username.length > 2 && !mc.includes(u.username)) mc.push(u.username);
    if (u.email && !mc.includes(u.email)) mc.push(u.email);
  });

  let docsContent = "";
  document.querySelectorAll('.rag-doc-cb:checked').forEach(cb => {
    const d = state.subjects.flatMap(s => s.docs || []).find(x => x.id === parseInt(cb.value));
    if (d) docsContent += `\n--- DOC: ${d.title} ---\n${d.content}\n`;
  });
  state.tempRagDocs.forEach(d => {
    const isChecked = document.querySelector(`.rag-temp-cb[value="${d.id}"]`)?.checked;
    if (isChecked) docsContent += `\n--- DOC ÉPHÉMÈRE: ${d.name} ---\n${d.content}\n`;
  });

  let fullContext = "";
  if (pc) fullContext += `[CONTEXTE UTILISATEUR]\n${pc}\n\n`;
  if (docsContent) fullContext += `[DOCUMENTS FOURNIS]\n${docsContent}\n\n`;

  const currentMap = state.aiChat.length > 0 ? JSON.parse(localStorage.getItem('rag_keys') || '{}') : {};
  // 2. Anonymisation (en injectant l'ancienne map si conversation continue, mais pour simplifier on garde pseudonymiseText)
  const safeMsg = await pseudonymiseText(fullContext + "[REQ]\n" + txt, mc);
  // Extrait la derniere ligne pseudo
  const splitReq = safeMsg.text.split('[REQ]\n');
  const userAnonMsg = splitReq.length > 1 ? splitReq[splitReq.length - 1] : safeMsg.text;

  localStorage.setItem('rag_keys', JSON.stringify(safeMsg.map));

  // Ajout du message utilisateur
  state.aiChat.push({ role: 'user', clearText: txt, anonText: userAnonMsg });
  render();

  // Affichage "Loading" robot
  state.aiChat.push({ role: 'assistant', clearText: '...', anonText: '...' });
  render();
  setTimeout(() => { const c = document.getElementById('chat-messages-container'); if (c) c.scrollTop = c.scrollHeight; }, 50);

  // 3. Requete API compatible OpenAI (Mamouth / OpenAI)
  try {
    const url = activeApiStr === 'mamouth' ? 'https://api.mammouth.ai/v1/chat/completions' : (activeApiStr === 'pro' ? 'https://api.openai.com/v1/chat/completions' : '');
    const model = activeApiStr === 'mamouth' ? 'mistral-medium-3.1' : (activeApiStr === 'pro' ? 'gpt-4o' : 'gemini-1.5-flash');
    // Pour Gemini (Free) en direct il faudrait une URL diff. On simule ici la compat OpenAI si gérée par proxy/agrégateur, ou on fait simple :
    // Si ce n'est pas un endpoint API direct complet, on utilise Mamouth comme standard
    const fetchUrl = url || 'https://api.mammouth.ai/v1/chat/completions';

    // Constuire messages historiques (anonymes)
    const messages = [];
    if (fullContext) {
      messages.push({ role: 'system', content: splitReq[0] || 'Tu es un assistant IA. Analyse strictement les documents dans le contexte si fournis.' });
    }
    state.aiChat.slice(0, state.aiChat.length - 1).forEach(m => {
      messages.push({ role: m.role, content: m.anonText });
    });

    const resp = await fetch(fetchUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify({ model: model, messages: messages })
    });

    if (!resp.ok) throw new Error("Erreur HTTP: " + resp.status);
    const data = await resp.json();
    let assistantAnonMsg = "";
    if (data.choices && data.choices[0] && data.choices[0].message) {
      assistantAnonMsg = data.choices[0].message.content;
    } else {
      assistantAnonMsg = "[Erreur de parsing de la réponse]";
    }

    // 4. Désanonymisation
    let assistantClearMsg = assistantAnonMsg;
    for (const [real, fake] of Object.entries(safeMsg.map)) {
      const escapeRegExp = (string) => string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(escapeRegExp(fake), 'gi');
      assistantClearMsg = assistantClearMsg.replace(regex, real);
    }

    state.aiChat[state.aiChat.length - 1] = { role: 'assistant', clearText: assistantClearMsg, anonText: assistantAnonMsg };
    render();

  } catch (err) {
    console.error(err);
    state.aiChat[state.aiChat.length - 1] = { role: 'assistant', clearText: "[Erreur API: " + err.message + "]", anonText: err.message };
    render();
  }
};

window.handleTempRagUpload = async (e) => {
  const files = e.target.files;
  if (!files.length) return;
  const loader = document.getElementById('rag-temp-loader');
  if (loader) loader.style.display = 'block';

  for (let f of files) {
    try {
      let content = "";
      const ext = f.name.split('.').pop().toLowerCase();
      // On réutilise la logique de chargement existante
      if (['png', 'jpg', 'jpeg'].includes(ext) || f.type.startsWith('image/')) {
        const result = typeof Tesseract !== 'undefined' ? await Tesseract.recognize(f, 'fra') : { data: { text: '(Image)' } };
        content = result.data.text;
      } else if (ext === 'txt' || ext === 'csv') {
        content = await new Promise((resolve) => { const r = new FileReader(); r.onload = ev => resolve(ev.target.result); r.readAsText(f); });
      } else if (ext === 'pdf') {
        const arrayBuffer = await f.arrayBuffer();
        const pdf = await pdfjsLib.getDocument(arrayBuffer).promise;
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const txt = await page.getTextContent();
          content += txt.items.map(it => it.str).join(" ") + "\n";
        }
      } else if (['xls', 'xlsx'].includes(ext)) {
        const arrayBuffer = await f.arrayBuffer();
        const wb = XLSX.read(arrayBuffer, { type: 'array' });
        wb.SheetNames.forEach(n => { content += XLSX.utils.sheet_to_csv(wb.Sheets[n]) + "\n"; });
      }

      state.tempRagDocs.push({ id: Date.now() + Math.floor(Math.random() * 1000), name: f.name, content: content || "Aucun texte." });
    } catch (err) {
      console.warn("Échec lecture fichier temp", f.name, err);
    }
  }
  if (loader) loader.style.display = 'none';
  render();
};

window.clearTempRagDocs = () => {
  state.tempRagDocs = [];
  render();
};

// Lancement du rendu initial garanti
try {
  console.log("Tentative de rendu initial...");
  render();
} catch (e) {
  document.body.innerHTML = "<div style='padding:2rem;background:white;color:red;'><h2>Erreur d'initialisation de app.js</h2><p>" + e.message + "</p></div>";
}

