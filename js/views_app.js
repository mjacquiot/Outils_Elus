// --- RENDER ENGINE ---
function render() {
  console.log("=== RENDER CALLED ===");
  try {
    const app = document.getElementById('app');
    if (!app) {
      console.error("DOM element #app missing");
      return;
    }
    console.log("App element present: ", !!app);
    if (state.currentView === 'login') app.innerHTML = renderLogin();
    else if (state.currentView === 'public_login') app.innerHTML = renderPublicLogin();
    else app.innerHTML = renderAppLayout(getContentForView());
    console.log("=== RENDER FINISHED ===");
  } catch (e) {
    console.error("=== EXPLOSION IN RENDER ===", e);
    document.body.innerHTML = "<div style='padding:2rem;color:red;background:white;'><h2>Erreur fatale dans render()</h2><pre>" + e.stack + "</pre></div>";
  }
}

function getContentForView() {
  switch (state.currentView) {
    case 'dashboard': return Permissions.isPublic() ? renderPublicDashboard() : renderDashboard();
    case 'theme': return Permissions.isPublic() ? '' : renderThemeView();
    case 'history': return Permissions.isPublic() ? '' : renderHistoryView();
    case 'subject': return Permissions.isPublic() ? '' : renderSubjectView();
    case 'council': return Permissions.isPublic() ? '' : renderCouncilManagement();
    case 'users': return renderUsersManagement();
    case 'rag_ia': return renderRagIaView();
    case 'scraper': return renderScraperView();
    case 'options': return renderOptionsView();
    case 'superadmin': return renderSuperAdminDashboard();
    default: return `<h2>Vue manquante</h2><button class="btn btn-primary" onclick="navigate('dashboard')">Retour</button>`;
  }
}

// --- VIEWS ---
function renderLogin() {
  return `
    <div class="auth-wrapper"><div class="auth-card">
      <div style="font-size:3rem; color:var(--primary); margin-bottom:1rem; text-align:center;"><span class="material-icons-round" style="font-size:inherit;">account_balance</span></div>
      <h2 style="margin-bottom:0.5rem; text-align:center;">EluConnect</h2><p style="color:var(--text-muted); margin-bottom:2rem; text-align:center;">Portail Collaboratif et Administratif</p>
      <form style="display:flex; flex-direction:column; gap:1rem;" onsubmit="handleLogin(event)">
        <input type="text" id="login-user" placeholder="Nom d'utilisateur" style="padding:0.8rem; border-radius:8px; border:1px solid #cbd5e1; font-size:1rem;" value="admin" autocomplete="username">
        <input type="password" id="login-pass" placeholder="Mot de passe" style="padding:0.8rem; border-radius:8px; border:1px solid #cbd5e1; font-size:1rem;" value="" autocomplete="current-password">
        <button type="submit" class="btn btn-primary" style="justify-content:center; padding:1rem; width:100%;">Connexion</button>
        
        <hr style="border:0; border-top:1px solid #ddd; margin:0.5rem 0">
        <button type="button" class="btn btn-outline" onclick="navigate('public_login')" style="justify-content:center; width:100%;"><span class="material-icons-round" style="margin-right:0.5rem;">public</span> Connexion en tant que citoyen</button>
      </form>
    </div></div>
  `;
}

function renderPublicLogin() {
  return `
    <div class="auth-wrapper"><div class="auth-card">
      <h2 style="margin-bottom:1rem; text-align:center;">Accès Citoyen</h2>
      <p style="color:var(--text-muted); margin-bottom:2rem; text-align:center;">Participez aux consultations publiques.</p>
      <div style="display:flex; flex-direction:column; gap:1rem;">
        <input type="text" id="pub-nom" placeholder="Nom" style="padding:0.8rem; border-radius:8px; border:1px solid #cbd5e1;">
        <input type="text" id="pub-prenom" placeholder="Prénom" style="padding:0.8rem; border-radius:8px; border:1px solid #cbd5e1;">
        
        <div style="background:#f1f5f9; padding:1rem; border-radius:8px; text-align:center; display:flex; gap:1rem; align-items:center;">
            <b style="font-size:1.2rem; letter-spacing:3px;">Q7T2X</b>
            <input type="text" id="pub-captcha" placeholder="Recopier Captcha" style="flex:1; padding:0.5rem; border-radius:4px; border:1px solid #cbd5e1;">
        </div>

        <button class="btn btn-primary" onclick="handlePublicLogin()" style="justify-content:center; padding:1rem; width:100%;">Accéder aux consultations</button>
        <button class="btn btn-outline" onclick="navigate('login')" style="justify-content:center; width:100%;">Retour</button>
      </div>
    </div></div>
  `;
}

function renderAppLayout(content) {
  const isP = Permissions.isPublic();
  const u = state.user || { username: 'Citoyen', role: 'Visiteur' };

  return `
    <header class="glass-header"><div class="brand" onclick="navigate('dashboard')" style="cursor:pointer"><span class="material-icons-round" style="color:var(--primary);">account_balance</span> <span>EluConnect</span></div>
      <div style="display:flex; align-items:center; gap:0.5rem">
        ${!isP ? `<button class="btn btn-icon" onclick="navigate('scraper')" title="Scraping & Fonds Documentaire"><span class="material-icons-round">cloud_download</span></button>` : ''}
        ${!isP ? `<button class="btn btn-icon" onclick="navigate('rag_ia')" title="RAG IA"><span class="material-icons-round">smart_toy</span></button>` : ''}
        ${Permissions.canManageUsers(u) && u.role !== ROLES.SUPERADMIN ? `<button class="btn btn-icon" onclick="navigate('users')" title="Administration Droits"><span class="material-icons-round">manage_accounts</span></button>` : ''}
        ${(!isP && Permissions.canManageCouncil(u)) && u.role !== ROLES.SUPERADMIN ? `<button class="btn btn-icon" onclick="navigate('council')" title="Conseils"><span class="material-icons-round">calendar_month</span></button>` : ''}
        ${u.role === ROLES.SUPERADMIN ? `<button class="btn btn-icon" onclick="navigate('superadmin')" title="Console SuperAdmin"><span class="material-icons-round" style="color:#f59e0b;">admin_panel_settings</span></button>` : ''}
        <div style="text-align:right; margin-left:1rem; margin-right:0.5rem;"><div style="font-size:0.75rem; font-weight:800; text-transform:uppercase;">${u.username}</div><div class="role-badge role-${isP ? 'elu' : u.role.toLowerCase()}" style="margin:0; padding:0.1rem 0.4rem; font-size:0.65rem;">${u.role}</div></div>
        ${!isP ? `<button class="btn btn-icon" onclick="promptChangePassword()" title="Changer de mot de passe"><span class="material-icons-round">vpn_key</span></button>` : ''}
        ${!isP ? `<button class="btn btn-icon" onclick="navigate('options')" title="Options Système"><span class="material-icons-round">settings</span></button>` : ''}
        <button class="btn btn-icon" onclick="logout()"><span class="material-icons-round">logout</span></button>
      </div>
    </header>
    <main class="main-content">${content}</main>${state.activeDocId ? renderDocViewer() : ''}
  `;
}

// --- DASHBOARD ---
function renderPublicDashboard() {
  const pubVotes = state.subjects.filter(s => s.vote && s.vote.target === 'public');

  return `
    <div class="view-header">
      <h2>Consultations Citoyennes</h2><p style="color:var(--text-muted);">Espace dédié pour prendre connaissance et voter sur les projets communaux.</p>
    </div>
    <div style="display:flex; flex-direction:column; gap:1.5rem; max-width:800px; margin:0 auto;">
      ${pubVotes.map(s => {
    const hasVoted = state.publicVotedStatus[s.id];
    const tTheme = state.themes.find(t => t.id === s.themeId);
    const totalPts = s.vote.counts.reduce((a, b) => a + b, 0);
    return `
          <div style="background:white; border:2px solid var(--primary); border-radius:12px; overflow:hidden;">
            <div style="background:var(--primary); color:white; padding:1.5rem;">
              <div style="font-size:0.8rem; opacity:0.8; margin-bottom:0.5rem; text-transform:uppercase;">Thème : ${tTheme ? tTheme.title : 'Commune'}</div>
              <h3 style="margin:0; font-size:1.2rem;">${s.title}</h3>
            </div>
            <div style="padding:1.5rem;">
              <p style="font-size:1.1rem; font-weight:600; margin-bottom:1.5rem;">${s.vote.question}</p>
              <div style="display:flex; flex-direction:column; gap:0.8rem;">
                ${!hasVoted ?
        s.vote.options.map((opt, idx) => `<button class="btn btn-outline" onclick="submitPublicVote(${s.id}, ${idx})" style="justify-content:flex-start; padding:1rem;"><span>${opt}</span></button>`).join('')
        : s.vote.options.map((opt, idx) => {
          const pct = totalPts > 0 ? Math.round((s.vote.counts[idx] / totalPts) * 100) : 0;
          return `<div style="background:#f1f5f9; padding:1rem; border-radius:8px;"><div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.5rem;"><span style="font-weight:600; color:var(--text-main);">${opt}</span><span style="font-size:0.85rem; color:var(--primary); font-weight:bold;">${pct}%</span></div><div style="height:6px; background:#e2e8f0; border-radius:3px; overflow:hidden;"><div style="height:100%; width:${pct}%; background:var(--primary);"></div></div></div>`;
        }).join('')
      }
              </div>
              ${hasVoted ? '<div style="margin-top:1.5rem; font-size:0.85rem; color:#10b981; text-align:center;"><span class="material-icons-round" style="font-size:1rem; vertical-align:middle;">check_circle</span> Votre vote a été comptabilisé.</div>' : ''}
            </div>
          </div>
        `;
  }).join('')}
      ${pubVotes.length === 0 ? '<div style="text-align:center; background:white; padding:3rem; border-radius:12px; border:1px solid #e2e8f0;">Aucune consultation citoyenne en cours.</div>' : ''}
    </div>
  `;
}

function renderSuperAdminDashboard() {
  const collectivites = [...new Set(state.users.map(u => u.collectivite_id).filter(Boolean))];

  return `
    <div class="view-header">
      <h2 style="display:flex; align-items:center; gap:0.5rem;"><span class="material-icons-round" style="color:#f59e0b; font-size:2.5rem; filter:drop-shadow(0 4px 3px rgb(0 0 0 / 0.07));">admin_panel_settings</span>Console SuperAdmin</h2>
      <p style="color:var(--text-muted); font-size:1.05rem;">Administration centrale du modèle Multi-Collectivités (SaaS).</p>
    </div>
    
    <div style="display:grid; grid-template-columns: 1fr 1fr; gap:2rem;">
        <div class="card" style="border:1px solid #e2e8f0; padding:2rem; box-shadow:0 4px 6px -1px rgba(0,0,0,0.05);">
            <h3 style="margin:0 0 1rem 0; color:var(--text-main); display:flex; align-items:center; gap:0.5rem;"><span class="material-icons-round" style="color:#8b5cf6;">domain_add</span> Rattacher une nouvelle Collectivité</h3>
            <p style="font-size:0.9rem; color:#64748b; margin-bottom:1.5rem;">Ceci créera un profil ADMIN pour cette collectivité. Toutes les données créées par cet admin et ses utilisateurs seront cloisonnées sur son ID.</p>
            
            <div style="display:flex; flex-direction:column; gap:1rem;">
               <input type="text" id="sa_col_id" placeholder="ID Collectivité (ex: dunieres_43220)" style="padding:0.8rem; border-radius:8px; border:1px solid #cbd5e1; font-size:0.95rem;">
               <input type="email" id="sa_admin_mail" placeholder="Email de l'Admin rattaché" style="padding:0.8rem; border-radius:8px; border:1px solid #cbd5e1; font-size:0.95rem;">
               <input type="text" id="sa_admin_name" placeholder="Nom complet" style="padding:0.8rem; border-radius:8px; border:1px solid #cbd5e1; font-size:0.95rem;">
               <input type="password" id="sa_admin_pass" placeholder="Mot de passe temporaire" style="padding:0.8rem; border-radius:8px; border:1px solid #cbd5e1; font-size:0.95rem;">
               <button class="btn btn-primary" onclick="createCollectiviteAdmin()" style="justify-content:center;"><span class="material-icons-round">person_add</span> Créer Compte Administrateur</button>
            </div>
        </div>
        
        <div class="card" style="border:1px solid #e2e8f0; padding:2rem; box-shadow:0 4px 6px -1px rgba(0,0,0,0.05);">
            <h3 style="margin:0 0 1rem 0; color:var(--text-main); display:flex; align-items:center; gap:0.5rem;"><span class="material-icons-round" style="color:#0ea5e9;">manage_search</span> Accès global complet</h3>
            <p style="font-size:0.9rem; color:#64748b; margin-bottom:1.5rem;">Vous êtes en profil SuperAdmin "Mode Global". Vous avez donc accès sans restriction à toutes les données en simultané. Servez-vous du menu des rôles pour filtrer en direct par collectivité.</p>
            <button class="btn btn-outline" style="width:100%; justify-content:center;" onclick="navigate('users')"><span class="material-icons-round">manage_accounts</span> Gérer les utilisateurs et filtrer</button>
        </div>
    </div>
  `;
}

function renderDashboard() {
  const themes = state.themes.filter(t => !t.isArchived);
  const u = state.user;
  const canManage = u && [ROLES.ADMIN, ROLES.MAIRE, ROLES.SUPERADMIN].includes(u.role);

  return `
    <div class="view-header" style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:1rem;">
      <div><h2>Commissions & Thèmes</h2><p style="color:var(--text-muted);">Gérez les dossiers relatifs à la commune.</p></div>
      <div style="display:flex; gap:0.5rem;">
        ${canManage ? `<button class="btn btn-outline" onclick="promptCreateTheme()"><span class="material-icons-round">add_circle</span> Créer Thème</button>` : ''}
      </div>
    </div>
    <div class="card-grid">
      ${themes.map(t => {
    const subsCount = state.subjects.filter(s => s.themeId === t.id && Permissions.canSeeSubject(s, state.user)).length;
    return `
      <div class="card" style="display:flex; flex-direction:column; justify-content:space-between; position:relative;">
        <div style="display:flex; justify-content:space-between; align-items:start;">
            <h3 style="margin-bottom:0.2rem; flex:1; cursor:pointer;" onclick="openTheme('${t.id}')">${sanitizeHTML(t.title)}</h3>
        </div>
        ${state.user.role === ROLES.SUPERADMIN ? `<div style="font-size:0.75rem; color:#8b5cf6; font-weight:bold; margin-bottom:0.5rem; background:#ede9fe; display:inline-block; padding:0.1rem 0.4rem; border-radius:4px; width:fit-content;">🌍 ${t.collectivite_id || 'Globale (Aucune)'}</div>` : ''}
        <p class="card-desc" style="flex:1; cursor:pointer;" onclick="openTheme('${t.id}')">${sanitizeHTML(t.desc)}</p>
        <div style="margin-top:1rem; display:flex; justify-content:space-between; align-items:center;">
            <span style="font-size:0.75rem; color:var(--text-muted); background:#f1f5f9; padding:0.2rem 0.5rem; border-radius:4px;">${subsCount} dossier(s)</span>
            ${Permissions.canManageTheme(t, state.user) ? `<button class="btn btn-icon" style="color:#ef4444; padding:0; width:28px; height:28px;" onclick="deleteTheme(event, '${t.id}')" title="Supprimer ce Thème"><span class="material-icons-round" style="font-size:1.1rem;">delete_outline</span></button>` : ''}
        </div>
      </div>`;
  }).join('')}
    </div>
  `;
}

function renderThemeView() {
  const t = state.themes.find(x => x.id === state.activeThemeId);
  const subs = state.subjects.filter(s => s.themeId === t.id && Permissions.canSeeSubject(s, state.user));
  const canManage = Permissions.canManageTheme(t, state.user);

  return `
    <div class="view-header" style="display:flex; justify-content:space-between; align-items:center;">
      <div style="display:flex; align-items:center; gap:1rem;"><button class="btn btn-icon" onclick="navigate('dashboard')"><span class="material-icons-round">arrow_back</span></button><h2>${sanitizeHTML(t.title)}</h2></div>
      <div style="display:flex; gap:0.5rem;">
        <button class="btn btn-outline" onclick="navigate('history')" style="color:#64748b; border-color:#cbd5e1;"><span class="material-icons-round">history</span> Historique</button>
        ${canManage ? `<button class="btn btn-primary" onclick="promptCreateSubject(${t.id})"><span class="material-icons-round">add</span> Nouveau Dossier</button>` : ''}
      </div>
    </div>
    
    <div class="card-grid" style="grid-template-columns:1fr; max-width:800px;">
      ${subs.map(s => {
    return `
          <div class="card" style="padding:1.5rem; display:flex; justify-content:space-between; align-items:center; border:1px solid #e2e8f0; cursor:pointer;" onclick="openSubject(${s.id})">
            <div style="flex:1;">
               <h3 style="margin:0 0 0.5rem 0; display:flex; align-items:center; gap:0.5rem;">
                 ${sanitizeHTML(s.title)} 
                 ${s.isConfidential ? '<span class="material-icons-round" style="color:#ef4444; font-size:1rem;" title="Confidentiel">lock</span>' : ''}
               </h3>
               <p class="card-desc" style="margin:0;">${sanitizeHTML(s.desc)}</p>
            </div>
            ${canManage ? `<button class="btn btn-icon" onclick="deleteSubject(event, ${s.id})" style="color:#ef4444;"><span class="material-icons-round">delete</span></button>` : ''}
            <span class="material-icons-round" style="color:var(--text-muted); margin-left:1rem;">chevron_right</span>
          </div>
        `;
  }).join('')}
      ${subs.length === 0 ? '<div style="padding:3rem; text-align:center; background:#f8fafc; border-radius:12px; color:#64748b; border:1px dashed #cbd5e1;">Aucun dossier dans cette commission pour le moment.</div>' : ''}
    </div>
  `;
}

function renderSubjectView() {
  const s = state.subjects.find(x => x.id === state.activeSubjectId);
  const msgs = state.messages.filter(m => m.type === 'subject' && m.targetId === s.id);
  const canManage = Permissions.canManageSubject(s, state.user);
  const canAddToAgenda = Permissions.canAddToAgenda(s, state.user);

  let voteHtml = '';
  if (s.vote) {
    const isPublic = s.vote.target === 'public';
    const totalPts = s.vote.counts.reduce((a, b) => a + b, 0);
    const hasVoted = s.vote.voters && s.vote.voters.includes(state.user.id);

    if (s.vote.target === 'elu' && Permissions.canVote(s, state.user) && !hasVoted) {
      voteHtml = `
         <div style="background:#e0e7ff; border:1px solid #c7d2fe; border-radius:12px; padding:1.5rem; margin-bottom:2rem;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1rem;">
              <h3 style="margin:0; display:flex; align-items:center; gap:0.5rem; color:#4f46e5;"><span class="material-icons-round">how_to_vote</span> Vote Interne Décisionnel</h3>
            </div>
            <p style="font-size:1.1rem; font-weight:600; margin-bottom:1.5rem;">${s.vote.question}</p>
            <div style="display:flex; flex-direction:column; gap:0.8rem;">
               ${s.vote.options.map((opt, idx) => `<button class="btn btn-primary" onclick="submitEluVote(${s.id}, ${idx})" style="justify-content:flex-start; padding:0.8rem 1rem; background:white; color:#4f46e5; border:1px solid #a5b4fc;">${opt}</button>`).join('')}
            </div>
         </div>
       `;
    } else {
      voteHtml = `
         <div style="background:${isPublic ? '#f0fdf4' : '#f8fafc'}; border:1px solid ${isPublic ? '#bbf7d0' : '#e2e8f0'}; border-radius:12px; padding:1.5rem; margin-bottom:2rem;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1rem;">
              <h3 style="margin:0; display:flex; align-items:center; gap:0.5rem; color:${isPublic ? '#166534' : 'var(--text-main)'};"><span class="material-icons-round">${isPublic ? 'public' : 'how_to_vote'}</span> ${isPublic ? 'Consultation Citoyenne' : 'Résultats Vote Décisionnel'}</h3>
            </div>
            <p style="font-size:1.05rem; font-weight:600; margin-bottom:1.5rem;">${s.vote.question}</p>
            <div style="display:flex; flex-direction:column; gap:0.6rem;">
               ${s.vote.options.map((opt, idx) => {
        const pct = totalPts > 0 ? Math.round((s.vote.counts[idx] / totalPts) * 100) : 0;
        return `<div style="position:relative; background:white; border-radius:6px; overflow:hidden; padding:0.8rem; border:1px solid ${isPublic ? '#dcfce7' : '#e2e8f0'};"><div style="position:absolute; top:0; left:0; bottom:0; width:${pct}%; background:${isPublic ? '#22c55e' : 'var(--primary)'}; opacity:0.1; z-index:0;"></div><div style="position:relative; z-index:1; display:flex; justify-content:space-between; align-items:center;"><span style="font-weight:600; color:var(--text-main); font-size:0.9rem;">${opt}</span><span style="font-size:0.85rem; color:var(--text-muted); font-weight:bold;">${pct}% (${s.vote.counts[idx]})</span></div></div>`;
      }).join('')}
            </div>
         </div>
       `;
    }
  }

  return `
    <div class="view-header" style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:1rem;">
      <div style="display:flex; align-items:center; gap:1rem;"><button class="btn btn-icon" onclick="openTheme(${s.themeId})"><span class="material-icons-round">arrow_back</span></button><div><h2 style="display:flex; align-items:center; gap:0.5rem;">${sanitizeHTML(s.title)}</h2></div></div>
      <div style="display:flex; gap:0.5rem;">
        ${canManage && !s.vote ? `<button class="btn btn-outline" style="border-color:var(--primary); color:var(--primary);" onclick="promptCreateVote(${s.id})"><span class="material-icons-round">how_to_vote</span> Créer Sondage/Vote</button>` : ''}
        ${canAddToAgenda && !s.councilDate ? `<button class="btn btn-primary" onclick="addToCouncil(${s.id})">Ordre du Jour Conseil</button>` : ''}
      </div>
    </div>
    
    <div style="display:grid; grid-template-columns: 1fr 350px; gap:2rem;">
      <div style="display:flex; flex-direction:column; gap:2rem;">
        ${voteHtml}
        
        <!-- DOCUMENTS (avec OCR) -->
        <div style="background:white; border:1px solid #e2e8f0; padding:1.5rem; border-radius:12px;">
           <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1.5rem;">
             <h3 style="margin:0;"><span class="material-icons-round" style="color:var(--text-muted); vertical-align:middle;">folder</span> Documents Informatiques</h3>
             ${state.user.role !== ROLES.TECHNICIEN ? `<label class="btn btn-outline btn-sm" style="cursor:pointer; border-color:var(--primary); color:var(--primary);"><input type="file" id="fileOCR" accept="image/*, .png, .jpg, .jpeg, .pdf, .txt, .csv, .xls, .xlsx" style="display:none" onchange="handleDocUpload(event, ${s.id})" multiple>Importer Document</label>` : ''}
           </div>
           
           <div id="ocr-loader" style="display:none; padding:1rem; background:#f8fafc; border-radius:8px; border:1px solid #cbd5e1; text-align:center; color:#475569; margin-bottom:1rem;">
                <div class="spinner" style="margin:0 auto 0.5rem auto; border-top-color:var(--primary); width:20px; height:20px; border-width:2px;"></div>
                <div style="font-size:0.85rem;" id="ocr-progress">Extraction du texte en cours... cela peut prendre quelques secondes.</div>
           </div>

           <div style="display:grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap:1rem;">
             ${(s.docs || []).map(d => `
                <div class="card" style="padding:1rem; border:1px solid #e2e8f0; display:flex; justify-content:space-between; align-items:center; gap:0.8rem; border-radius:8px;">
                     <div onclick="openDoc(${d.id})" style="display:flex; align-items:center; gap:0.5rem; cursor:pointer; flex:1; overflow:hidden;">
                        <span class="material-icons-round" style="color:#ef4444; font-size:2rem;">description</span>
                        <div style="font-size:0.85rem; font-weight:500; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="${sanitizeHTML(d.title)}">${sanitizeHTML(d.title)}</div>
                     </div>
                     ${canManage ? `<button class="btn btn-icon" onclick="deleteDocument(${s.id}, ${d.id})" style="color:#ef4444; padding:0;"><span class="material-icons-round" style="font-size:1.2rem;">delete</span></button>` : ''}
                </div>
              `).join('')}
             ${(!s.docs || s.docs.length === 0) ? '<div style="grid-column:1/-1; color:#94a3b8; font-size:0.85rem; text-align:center;">Aucun document. (Les fichiers importés seront transformés en texte indexable).</div>' : ''}
           </div>
        </div>
      </div>
      
      <!-- CHAT DOSSIER -->
      <div style="background:white; border:1px solid #e2e8f0; border-radius:12px; display:flex; flex-direction:column; height: calc(100vh - 200px); min-height:500px;">
        <div style="padding:1rem; border-bottom:1px solid #e2e8f0; background:#f8fafc; border-radius:12px 12px 0 0;"><h3 style="font-size:1rem; margin:0;"><span class="material-icons-round" style="font-size:1.2rem; color:var(--primary); vertical-align:middle;">forum</span> Fil D'information</h3></div>
        <div id="thread-chat-subj" style="flex:1; overflow-y:auto; padding:1.5rem 1rem; display:flex; flex-direction:column; gap:1rem;">
          ${msgs.map(m => `<div style="display:flex; flex-direction:column; gap:0.2rem; ${m.sender === state.user.username ? 'align-items:flex-end;' : 'align-items:flex-start;'}"><span style="font-size:0.7rem; color:#94a3b8; margin:0 0.5rem;">${sanitizeHTML(m.sender)}</span><div style="background:${m.sender === state.user.username ? 'var(--primary)' : '#f1f5f9'}; color:${m.sender === state.user.username ? 'white' : 'var(--text-main)'}; padding:0.6rem 1rem; border-radius:16px; font-size:0.85rem; max-width:85%;">${sanitizeHTML(m.text)}</div></div>`).join('') || '<div style="text-align:center; color:#94a3b8; margin-top:2rem;">Historique vide.</div>'}
        </div>
        <div style="padding:1rem; border-top:1px solid #e2e8f0; display:flex; gap:0.5rem;">
          <input id="smsg" style="flex:1; border:1px solid #cbd5e1; border-radius:24px; padding:0.6rem 1rem; font-size:0.85rem;" placeholder="Partager une note...">
          <button class="btn btn-primary btn-icon" onclick="sendMsg('subject', ${s.id}, 'smsg')" style="border-radius:50%; width:40px; height:40px; display:flex; align-items:center; justify-content:center;"><span class="material-icons-round">send</span></button>
        </div>
      </div>
    </div>
  `;
}

function renderHistoryView() {
  const t = state.themes.find(x => x.id === state.activeThemeId);
  const logs = state.historyLogs.filter(h => h.themeId === t.id).sort((a, b) => new Date(b.date) - new Date(a.date));

  return `
    <div class="view-header" style="display:flex; align-items:center; gap:1rem;">
       <button class="btn btn-icon" onclick="navigate('theme')"><span class="material-icons-round">arrow_back</span></button>
       <h2>Historique des actions - ${t.title}</h2>
    </div>
    
    <div style="background:white; border-radius:12px; border:1px solid #e2e8f0; max-width:900px;">
       <table style="width:100%; border-collapse:collapse; text-align:left;">
         <thead style="background:#f8fafc; border-bottom:1px solid #e2e8f0;">
            <tr>
               <th style="padding:1rem; font-weight:600; color:#475569; font-size:0.85rem;">Date</th>
               <th style="padding:1rem; font-weight:600; color:#475569; font-size:0.85rem;">Utilisateur</th>
               <th style="padding:1rem; font-weight:600; color:#475569; font-size:0.85rem;">Action</th>
               <th style="padding:1rem; font-weight:600; color:#475569; font-size:0.85rem;">Description détaillée</th>
            </tr>
         </thead>
         <tbody>
            ${logs.map(l => {
    const dt = new Date(l.date);
    const isDel = l.action.includes('SUPPRESSION');
    return `<tr style="border-bottom:1px solid #f1f5f9;">
                 <td style="padding:1rem; font-size:0.85rem; color:#64748b;">${dt.toLocaleDateString()} ${dt.toLocaleTimeString()}</td>
                 <td style="padding:1rem; font-size:0.85rem; font-weight:600; color:var(--text-main);">${l.user}</td>
                 <td style="padding:1rem; font-size:0.8rem;"><span style="background:${isDel ? '#fee2e2' : '#e0e7ff'}; color:${isDel ? '#ef4444' : '#4f46e5'}; padding:0.2rem 0.5rem; border-radius:4px; font-weight:bold;">${l.action}</span></td>
                 <td style="padding:1rem; font-size:0.85rem; color:#334155;">${l.description}</td>
               </tr>`;
  }).join('')}
            ${logs.length === 0 ? '<tr><td colspan="4" style="padding:2rem; text-align:center; color:#94a3b8; font-style:italic;">Aucune action enregistrée sur ce thème pour le moment.</td></tr>' : ''}
         </tbody>
       </table>
    </div>
  `;
}

function renderDocViewer() {
  const d = state.subjects.flatMap(x => x.docs || []).find(x => x.id === state.activeDocId);
  return `<div style="position:fixed; inset:0; background:rgba(15, 23, 42, 0.85); z-index:2000; display:flex; justify-content:center; align-items:center; padding:2rem;">
     <div style="background:white; width:100%; max-width:900px; height:85vh; border-radius:12px; display:flex; flex-direction:column; box-shadow:0 25px 50px -12px rgba(0,0,0,0.5);">
       <div style="display:flex; justify-content:space-between; align-items:center; padding:1.5rem; border-bottom:1px solid #e2e8f0; background:#f8fafc; border-radius:12px 12px 0 0;">
         <h3 style="margin:0; display:flex; align-items:center; gap:0.5rem;"><span class="material-icons-round" style="color:#ef4444;">description</span> ${sanitizeHTML(d.title)}</h3>
         <div style="display:flex; gap:0.5rem;">
           ${d.fileUrl ? `<a href="${d.fileUrl}" target="_blank" class="btn btn-outline btn-sm"><span class="material-icons-round" style="font-size:1rem; margin-right:0.3rem;">download</span>Télécharger Original</a>` : ''}
           <button class="btn btn-icon" onclick="closeDoc()"><span class="material-icons-round">close</span></button>
         </div>
       </div>
       <div style="flex:1; padding:2.5rem; overflow-y:auto; line-height:1.7; color:#334155; font-size:0.95rem; white-space:pre-wrap; font-family:Georgia, serif;">${sanitizeHTML(d.content)}</div>
     </div>
  </div>`;
}

function renderCouncilManagement() {
  return `<div class="view-header"><h2>Agendas des Conseils Communaux</h2></div><div class="council-list" style="max-width:800px;">
  ${state.councils.map(c => {
    const dt = new Date(c.date);
    const ag = (c.agenda || []).map(item => {
      if (typeof item === 'object') return item;
      return state.subjects.find(s => s.id === item);
    }).filter(Boolean);
    const canManageAg = state.user && [ROLES.ADMIN, ROLES.MAIRE].includes(state.user.role);
    return `
      <div style="background:white; border:1px solid #e2e8f0; border-radius:12px; margin-bottom:1rem; padding:1.5rem;">
        <h3 style="margin:0 0 1rem 0;">Séance du ${dt.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })} à ${dt.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</h3>
        <h4 style="margin:0 0 1rem 0; padding-bottom:0.5rem; border-bottom:1px solid #f1f5f9; font-size:0.9rem; color:var(--text-muted); text-transform:uppercase; display:flex; justify-content:space-between; align-items:center;">
           <span>Ordre du jour</span>
           ${canManageAg ? `<button class="btn btn-outline btn-sm" onclick="promptAddCouncilItem(${c.id})" style="padding:0.3rem 0.6rem; font-size:0.75rem;"><span class="material-icons-round" style="font-size:1rem; margin-right:0.3rem;">add</span>Point Libre</button>` : ''}
        </h4>
        <ul style="margin:0; padding-left:0; display:flex; flex-direction:column; gap:0.5rem; color:var(--text-main); font-size:0.9rem; list-style:none;">
           ${ag.map(s => `
            <li style="display:flex; justify-content:space-between; align-items:flex-start; background:#f8fafc; padding:0.8rem; border-radius:8px; border:1px solid #e2e8f0;">
                <div style="flex:1;">
                   <b style="line-height:1.4;">${sanitizeHTML(s.title)}</b>
                   ${s.isManual ? '<span style="font-size:0.75rem; color:#8b5cf6; background:#ede9fe; padding:0.1rem 0.4rem; border-radius:4px; margin-left:0.5rem; vertical-align:middle;">Point Libre</span>' : '<span style="font-size:0.75rem; color:#0ea5e9; background:#e0f2fe; padding:0.1rem 0.4rem; border-radius:4px; margin-left:0.5rem; vertical-align:middle;">Dossier Commission</span>'}
                </div>
                ${canManageAg ? `
                <div style="display:flex; gap:0.5rem; margin-left:1rem;">
                   ${s.isManual ? `<button class="btn btn-icon" style="padding:0; width:28px; height:28px; color:#64748b; background:white; border:1px solid #cbd5e1;" onclick="editCouncilItem(${c.id}, '${s.id}')"><span class="material-icons-round" style="font-size:1.1rem;">edit</span></button>` : ''}
                   <button class="btn btn-icon" style="padding:0; width:28px; height:28px; color:#ef4444; background:white; border:1px solid #fecaca;" onclick="removeCouncilItem(${c.id}, '${typeof s.id === 'object' ? s.id : s.id}')" title="Retirer de l'ordre du jour"><span class="material-icons-round" style="font-size:1.1rem;">close</span></button>
                </div>` : ''}
            </li>`).join('')}
           ${ag.length === 0 ? '<li style="color:#94a3b8; font-style:italic; text-align:center; padding:1rem;">Aucun point à l\'ordre du jour.</li>' : ''}
        </ul>
      </div>`;
  }).join('')}
  <div style="background:#f8fafc; border:1px dashed #cbd5e1; border-radius:12px; padding:1.5rem; display:flex; gap:1rem; align-items:center;">
      <input type="datetime-local" id="new-council-dt" style="padding:0.6rem; border:1px solid #cbd5e1; border-radius:6px; font-size:0.9rem;">
      <button class="btn btn-primary" onclick="addCouncilDate()">Créer Conseil</button>
  </div>
  </div>`;
}

function renderUsersManagement() {
  const displayedUsers = (state.user.role === ROLES.SUPERADMIN && state.uiFilterUsers) 
      ? state.users.filter(u => u.collectivite_id === state.uiFilterUsers) 
      : state.users;

  return `
    <div class="view-header" style="display:flex; justify-content:space-between; align-items:flex-start; flex-wrap:wrap; gap:1rem;">
      <div style="flex:1;">
        <h2 style="margin:0 0 0.5rem 0;">Administration : Utilisateurs et Accès</h2>
        <p style="color:var(--text-muted); margin:0;">Gestion des profils de la base de données Supabase.</p>
      </div>
      ${state.user.role === ROLES.SUPERADMIN ? `
      <div>
        <select onchange="state.uiFilterUsers = this.value; window.render();" style="padding:0.6rem 1rem; border-radius:8px; border:1px solid #cbd5e1; font-weight:600; outline:none; background:white; color:var(--primary); font-size:0.95rem; cursor:pointer;">
           <option value="">🌍 Toutes les collectivités</option>
           ${[...new Set(state.users.map(u => u.collectivite_id).filter(Boolean))].map(c => `<option value="${c}" ${state.uiFilterUsers === c ? 'selected' : ''}>📌 ${c}</option>`).join('')}
        </select>
      </div>
      ` : ''}
    </div>
  <div style="display:grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap:1.5rem;">
  ${displayedUsers.map(u => {
    return `
    <div class="card" style="border:1px solid #e2e8f0; display:flex; flex-direction:column;">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1rem;">
         <b style="font-size:1.1rem;">${u.username}</b>
         ${(state.user.role === ROLES.SUPERADMIN || state.user.role === ROLES.ADMIN || (state.user.role === ROLES.MAIRE && u.role !== ROLES.ADMIN)) && u.id !== state.user.id ? `
         <select onchange="changeUserRole('${u.id}', this.value)" style="font-size:0.75rem; padding:0.1rem; border-radius:4px; border:1px solid #cbd5e1; background:white;">
            ${Object.values(ROLES).map(r => `<option value="${r}" ${r === u.role ? 'selected' : ''}>${r}</option>`).join('')}
         </select>` : `<span class="role-badge role-${u.role.toLowerCase()}" style="margin:0; font-size:0.75rem;">${u.role}</span>`}
      </div>
      <div style="font-size:0.85rem; color:var(--text-muted); margin-bottom:1rem; flex:1;">Email : ${u.email} ${state.user.role === ROLES.SUPERADMIN ? `<div style="margin-top:0.3rem;"><span style="font-size:0.75rem; color:#8b5cf6; background:#ede9fe; padding:0.1rem 0.4rem; border-radius:4px;">Collectivité: ${u.collectivite_id || 'Global (SA)'}</span></div>` : ''}</div>
      ${[ROLES.ADJOINT, ROLES.DELEGUE].includes(u.role) ? `
      <div style="background:#f8fafc; padding:1rem; border-radius:8px;">
         <div style="font-size:0.8rem; font-weight:600; color:var(--text-muted); margin-bottom:0.5rem;">Thèmes Rattachés :</div>
         ${(u.attachedThemes || []).map(tid => {
      const t = state.themes.find(x => x.id === tid);
      return t ? `<div style="font-size:0.85rem; color:var(--text-main); margin-bottom:0.3rem; display:flex; justify-content:space-between;">• ${t.title} <span class="material-icons-round" style="font-size:1rem; color:#ef4444; cursor:pointer;" onclick="removeUserTheme('${u.id}', ${tid})">close</span></div>` : '';
    }).join('')}
         ${(!u.attachedThemes || u.attachedThemes.length === 0) ? '<div style="font-style:italic; font-size:0.8rem; color:#94a3b8; margin-bottom:1rem;">Aucun thème</div>' : ''}
         <div style="margin-top:0.5rem; display:flex; gap:0.5rem;">
            <select id="sel-thm-${u.id}" style="flex:1; padding:0.4rem; border-radius:4px; border:1px solid #cbd5e1; font-size:0.8rem; background:white;">
              ${state.themes.filter(th => !u.attachedThemes.includes(th.id)).map(th => `<option value="${th.id}">${th.title}</option>`).join('')}
            </select>
            <button class="btn btn-outline btn-sm" onclick="addUserTheme('${u.id}')">Ajouter</button>
         </div>
      </div>
      ` : ''}
      ${(state.user.role === ROLES.SUPERADMIN || state.user.role === ROLES.ADMIN || (state.user.role === ROLES.MAIRE && u.role !== ROLES.ADMIN)) && u.id !== state.user.id ? `
      <div style="margin-top:1rem; text-align:right;">
         <button class="btn btn-icon" onclick="deleteUser('${u.id}')" style="color:#ef4444;"><span class="material-icons-round">delete_forever</span></button>
      </div>` : ''}
    </div>`;
  }).join('')}
   <div class="card" style="border:1px dashed #cbd5e1; background:#f8fafc; display:flex; flex-direction:column; justify-content:center; align-items:center; color:#64748b; padding:2rem; cursor:pointer;" onclick="promptCreateUser()">
      <span class="material-icons-round" style="font-size:2rem; margin-bottom:0.5rem;">person_add</span>
      <b style="font-size:1rem;">Créer Utilisateur</b>
   </div>
   </div>`;
}

