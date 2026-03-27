/**
 * EluConnect - Plateforme Élus & Techniciens
 * Version Finale (Abonnements, Votes, Droits & RAG)
 */

// --- CONFIG ---
const ROLES = { ADMIN: 'admin', MAIRE: 'maire', ADJOINT: 'adjoint', TECHNICIEN: 'technicien', ELU: 'elu' };
const MONTH_NAMES = ["Jan", "Fév", "Mar", "Avr", "Mai", "Juin", "Juil", "Août", "Sept", "Oct", "Nov", "Déc"];
const APP_DATE = new Date("2026-03-23T16:00:00"); 

// --- MOCK DATA ---
let state = {
  user: null, 
  currentView: 'login', 
  activeThemeId: null,
  activeSubjectId: null,
  activeDocId: null,
  expandedCouncilId: null,
  publicVotedStatus: {}, // Simuler le traçage du public: { subjectId: true }
  
  themes: [
    { id: 1, title: 'Enfance & Jeunesse', desc: 'Gestion des crèches, centres de loisirs et écoles.', referentId: 3, isArchived: false, docs: [{ id: 10, title: "Délibérations_2024.txt", content: "Historique..." }] },
    { id: 2, title: 'Urbanisme & Travaux', desc: 'Aménagements, voirie, PLU.', referentId: 4, isArchived: false, docs: [] },
    { id: 3, title: 'Finance & RH', desc: 'Gestion interne et budgétaire.', referentId: 2, isArchived: false, docs: [{ id: 30, title: "Politique_RH.txt", content: "Règles..." }] }
  ],
  
  subjects: [
    { 
      id: 101, themeId: 1, title: 'Tarif Cantine 2026', desc: 'Révision de la tarification.', isConfidential: false, councilDate: null, 
      docs: [{ id: 11, title: "Analyse_Tarifs_ALSH.txt", content: "Détails financiers..." }], 
      vote: { target: 'public', question: "Pour ou contre la tarification quotient ?", options: ["Pour", "Contre", "Indécis"], counts: [156, 42, 12], voters: [2, 3], endDate: "2026-04-01T23:59" } 
    },
    { 
      id: 102, themeId: 1, title: 'Rénovation École Jaurès', desc: 'Consultation interne équipe.', isConfidential: false, councilDate: null, docs: [], 
      vote: { target: 'elu', question: "Lancer les travaux cet été ou l'été prochain ?", options: ["Cet été", "Prochain", "Annuler"], counts: [4, 1, 0], voters: [1, 2, 3, 4, 5], endDate: "2026-03-20T23:59" } 
    },
    { id: 301, themeId: 3, title: 'Attribution des primes RH', desc: 'Confidentiel RH.', isConfidential: true, docs: [{ id: 31, title: "Bilan_annuel.txt", content: "Évaluations..." }], vote: null }
  ],

  councils: [
    { id: 1, date: '2026-04-12T20:00', agenda: [101] },
    { id: 2, date: '2026-05-15T18:30', agenda: [] }
  ],

  messages: [
    { id: 1, type: 'theme', targetId: 1, sender: 'M. le Maire', text: 'Bienvenue sur la commission Enfance.', date: '2026-03-20T10:00' },
    { id: 2, type: 'subject', targetId: 101, sender: 'Adjointe Enfance', text: 'Voici notre premier dossier sur les tarifs.', date: '2026-03-21T09:30' }
  ], 
  
  ragGroups: [], 
  
  gantt: {
    101: [
      { id: 1, task: "Consultation parents", start: "2026-01-10", end: "2026-02-15", status: "done" },
      { id: 3, task: "Proposition grille", start: "2026-03-20", end: "2026-04-10", status: "active" }
    ]
  },

  users: [
    { id: 1, name: 'Adeline Admin', role: ROLES.ADMIN, subs: { themes: [], subjects: [] } },
    { id: 2, name: 'M. le Maire', role: ROLES.MAIRE, subs: { themes: [], subjects: [] } },
    { id: 3, name: 'Adjointe Enfance', role: ROLES.ADJOINT, subs: { themes: [1], subjects: [101] } },
    { id: 4, name: 'Technicien Urb', role: ROLES.TECHNICIEN, subs: { themes: [], subjects: [] } },
    { id: 5, name: 'Élu Durant', role: ROLES.ELU, subs: { themes: [], subjects: [] } }
  ]
};

// --- PERMISSIONS ---
const Permissions = {
  isPublic: () => !state.user,
  canSeeSubject: (s, u) => {
    if (!u) return false; 
    if (u.role === ROLES.ADMIN || u.role === ROLES.MAIRE) return true;
    if (u.role === ROLES.TECHNICIEN && s.isConfidential) return false;
    return true; 
  },
  canManageCouncil: (u) => u && [ROLES.ADMIN, ROLES.MAIRE, ROLES.TECHNICIEN].includes(u.role),
  canAddToAgenda: (u) => u && [ROLES.ADMIN, ROLES.MAIRE, ROLES.ADJOINT].includes(u.role),
  canEditTheme: (t, u) => {
    if (!u) return false;
    return [ROLES.ADMIN, ROLES.MAIRE].includes(u.role) || t.referentId === u.id;
  },
  canEditSubject: (s, u) => {
    if (!u) return false;
    if ([ROLES.ADMIN, ROLES.MAIRE].includes(u.role)) return true;
    const t = state.themes.find(x => x.id === s.themeId);
    return t && t.referentId === u.id; 
  },
  canManageUsers: (u) => u && [ROLES.ADMIN, ROLES.MAIRE].includes(u.role)
};

// --- RENDER ENGINE ---
function render() {
  const app = document.getElementById('app');
  if (state.currentView === 'login') app.innerHTML = renderLogin();
  else app.innerHTML = renderAppLayout(getContentForView());
}

function getContentForView() {
  switch(state.currentView) {
    case 'dashboard': return renderDashboard();
    case 'theme': return Permissions.isPublic() ? renderPublicThemeView() : renderThemeView();
    case 'subject': return Permissions.isPublic() ? renderDashboard() : renderSubjectView();
    case 'rag': return renderRAGView();
    case 'council': return renderCouncilManagement();
    case 'users': return renderUsersManagement();
    default: return `<h2>Vue manquante</h2><button class="btn btn-primary" onclick="navigate('dashboard')">Retour</button>`;
  }
}

// --- VIEWS ---
function renderLogin() {
  return `
    <div class="auth-wrapper"><div class="auth-card">
      <div style="font-size:3rem; color:var(--primary); margin-bottom:1rem; text-align:center;"><span class="material-icons-round" style="font-size:inherit;">account_balance</span></div>
      <h2 style="margin-bottom:0.5rem; text-align:center;">EluConnect</h2><p style="color:var(--text-muted); margin-bottom:2rem; text-align:center;">Portail Collaboratif</p>
      <div style="display:flex; flex-direction:column; gap:0.8rem;">
        ${state.users.map(u => `<button class="btn btn-primary" onclick="loginAs(${u.id})" style="justify-content:space-between; padding:1.2rem; width:100%;"><span>${u.name}</span><span class="role-badge role-${u.role}">${u.role}</span></button>`).join('')}
        <hr style="border:0; border-top:1px solid #ddd; margin:0.5rem 0">
        <button class="btn btn-outline" onclick="loginPublic()" style="justify-content:center; width:100%;"><span class="material-icons-round" style="margin-right:0.5rem;">public</span> Espace Citoyen</button>
      </div>
    </div></div>
  `;
}

function renderAppLayout(content) {
  const isP = Permissions.isPublic();
  const u = state.user || { name: 'Citoyen', role: 'Visiteur' };
  return `
    <header class="glass-header"><div class="brand" onclick="navigate('dashboard')" style="cursor:pointer"><span class="material-icons-round" style="color:var(--primary);">account_balance</span> <span>EluConnect</span></div>
      <div style="display:flex; align-items:center; gap:0.5rem">
        ${Permissions.canManageUsers(u) ? `<button class="btn btn-icon" onclick="navigate('users')" title="Droits"><span class="material-icons-round">manage_accounts</span></button>` : ''}
        ${!isP ? `<button class="btn btn-icon" onclick="navigate('rag')" title="IA"><span class="material-icons-round">psychology</span></button><button class="btn btn-icon" onclick="navigate('council')" title="Conseils"><span class="material-icons-round">calendar_month</span></button>` : ''}
        <div style="text-align:right; margin-left:1rem; margin-right:0.5rem;"><div style="font-size:0.75rem; font-weight:800;">${u.name}</div><div class="role-badge role-${isP ? 'elu' : u.role}" style="margin:0; padding:0.1rem 0.4rem; font-size:0.65rem;">${u.role}</div></div>
        <button class="btn btn-icon" onclick="logout()"><span class="material-icons-round">logout</span></button>
      </div>
    </header>
    <main class="main-content">${content}</main>${state.activeDocId ? renderDocViewer() : ''}
  `;
}

function renderDashboard() {
  const isP = Permissions.isPublic();
  const themes = state.themes.filter(t => !t.isArchived);
  
  return `
    <div class="view-header" style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:1rem;">
      <div><h2>${isP ? 'Consultations Citoyennes' : 'Commissions & Thèmes'}</h2><p style="color:var(--text-muted);">${isP ? 'Votez sur les décisions communales.' : 'Gérez vos commissions.'}</p></div>
      <div style="display:flex; gap:0.5rem;">
        ${Permissions.canManageUsers(state.user) ? `<button class="btn btn-outline" onclick="promptCreateTheme()"><span class="material-icons-round">add_circle</span> Créer Thème</button>` : ''}
        ${Permissions.canManageCouncil(state.user) ? `<div style="display:flex; align-items:center; gap:0.5rem; background:white; padding:0.5rem; border-radius:12px; border:1px solid #e2e8f0;"><input type="datetime-local" id="new-council-dt" style="padding:0.4rem; border:1px solid #cbd5e1; border-radius:6px; font-size:0.8rem;"><button class="btn btn-primary btn-sm" onclick="addCouncilDate()">Fixer Conseil</button></div>` : ''}
      </div>
    </div>
    <div class="card-grid">
      ${themes.map(t => {
        if (isP) {
          const pVotes = state.subjects.filter(s => s.themeId === t.id && s.vote && s.vote.target === 'public').length;
          if (pVotes === 0) return '';
          return `<div class="card" onclick="openTheme(${t.id})" style="border:2px solid var(--primary);"><div style="display:flex; justify-content:space-between; align-items:start;"><h3>${t.title}</h3><span class="badge-green" style="color:white; padding:0.2rem 0.5rem; border-radius:12px; font-size:0.7rem;">VOTE OUVERT</span></div><p class="card-desc">${t.desc}</p><div style="margin-top:1rem; font-size:0.8rem; color:var(--primary); font-weight:600;"><span class="material-icons-round" style="font-size:1rem; vertical-align:middle;">how_to_vote</span> ${pVotes} consultation(s)</div></div>`;
        } else {
          const subsCount = state.subjects.filter(s => s.themeId === t.id && Permissions.canSeeSubject(s, state.user)).length;
          const isSubbed = state.user && state.user.subs.themes.includes(t.id);
          const refUser = state.users.find(u => u.id === t.referentId);
          return `<div class="card" style="display:flex; flex-direction:column; justify-content:space-between;"><div onclick="openTheme(${t.id})" style="cursor:pointer; flex:1;"><div style="display:flex; justify-content:space-between; align-items:start;"><h3 style="margin-bottom:0.2rem;">${t.title}</h3></div><div style="font-size:0.7rem; color:var(--text-muted); margin-bottom:0.5rem;">Resp: <b>${refUser ? refUser.name : 'Aucun'}</b></div><p class="card-desc">${t.desc}</p><div style="margin-top:1rem; display:flex; gap:0.5rem;"><span style="font-size:0.75rem; color:var(--text-muted); background:#f1f5f9; padding:0.2rem 0.5rem; border-radius:4px;">${subsCount} dossier(s)</span></div></div><div style="margin-top:1rem; border-top:1px solid #e2e8f0; padding-top:0.5rem; text-align:right;"><button class="btn btn-icon" onclick="toggleSub('theme', ${t.id})" title="S'abonner"><span class="material-icons-round" style="color:${isSubbed?'#f59e0b':'#cbd5e1'}">${isSubbed?'notifications_active':'notifications_none'}</span></button></div></div>`;
        }
      }).join('')}
    </div>
  `;
}

function renderThemeView() {
  const t = state.themes.find(x => x.id === state.activeThemeId);
  const subs = state.subjects.filter(s => s.themeId === t.id && Permissions.canSeeSubject(s, state.user));
  const msgs = state.messages.filter(m => m.type === 'theme' && m.targetId === t.id);
  const canEdit = Permissions.canEditTheme(t, state.user);

  return `
    <div class="view-header" style="display:flex; justify-content:space-between; align-items:center;">
      <div style="display:flex; align-items:center; gap:1rem;"><button class="btn btn-icon" onclick="navigate('dashboard')"><span class="material-icons-round">arrow_back</span></button><h2>${t.title}</h2></div>
      ${canEdit ? `<button class="btn btn-primary" onclick="promptCreateSubject(${t.id})"><span class="material-icons-round">add</span> Dossier</button>` : ''}
    </div>
    <div style="display:grid; grid-template-columns: 1fr 350px; gap:2rem;">
      <div>
        <h3 style="margin-bottom:1rem;">Dossiers & Sujets</h3>
        <div class="card-grid" style="grid-template-columns:1fr;">
          ${subs.map(s => {
            const isSubbed = state.user && state.user.subs.subjects.includes(s.id);
            const pubVoteIcon = (s.vote && s.vote.target === 'public') ? '<span class="material-icons-round" style="font-size:1rem; color:#10b981;" title="Vote Citoyen">public</span>' : '';
            const eluVoteIcon = (s.vote && s.vote.target === 'elu') ? '<span class="material-icons-round" style="font-size:1rem; color:var(--primary);" title="Vote Interne">how_to_vote</span>' : '';
            return `<div class="card" style="padding:1rem; display:flex; justify-content:space-between; align-items:center;"><div onclick="openSubject(${s.id})" style="flex:1; cursor:pointer;"><h4 style="margin:0; display:flex; align-items:center; gap:0.5rem;">${s.title} ${s.isConfidential ? '🔒' : ''} ${pubVoteIcon} ${eluVoteIcon}</h4><p class="card-desc" style="margin:0; margin-top:0.25rem;">${s.desc}</p></div><div style="display:flex; align-items:center; gap:0.5rem;"><button class="btn btn-icon" onclick="toggleSub('subject', ${s.id})" title="Abonnement"><span class="material-icons-round" style="color:${isSubbed?'#f59e0b':'#cbd5e1'}; font-size:1rem;">${isSubbed?'notifications_active':'notifications_none'}</span></button><span class="material-icons-round" onclick="openSubject(${s.id})" style="color:var(--text-muted); cursor:pointer;">chevron_right</span></div></div>`;
          }).join('')}
          ${subs.length === 0 ? '<div style="padding:2rem; text-align:center; background:#f8fafc; border-radius:8px; color:#64748b;">Aucun dossier dans cette commission.</div>' : ''}
        </div>
      </div>
      <!-- CHAT THEME -->
      <div style="background:white; border:1px solid #e2e8f0; border-radius:12px; display:flex; flex-direction:column; height: calc(100vh - 200px); min-height:400px;"><div style="padding:1rem; border-bottom:1px solid #e2e8f0; background:#f8fafc; border-radius:12px 12px 0 0;"><h3 style="font-size:1rem; margin:0;"><span class="material-icons-round" style="font-size:1.2rem; color:var(--primary); vertical-align:middle;">forum</span> Fil Global</h3></div><div id="thread-chat" style="flex:1; overflow-y:auto; padding:1.5rem 1rem; display:flex; flex-direction:column; gap:1rem;">${msgs.map(m => `<div style="display:flex; flex-direction:column; gap:0.2rem; ${m.sender === state.user.name ? 'align-items:flex-end;' : 'align-items:flex-start;'}"><span style="font-size:0.7rem; color:#94a3b8; margin:0 0.5rem;">${m.sender}</span><div style="background:${m.sender === state.user.name ? 'var(--primary)' : '#f1f5f9'}; color:${m.sender === state.user.name ? 'white' : 'var(--text-main)'}; padding:0.6rem 1rem; border-radius:16px; font-size:0.85rem; max-width:85%;">${m.text}</div></div>`).join('') || '<div style="text-align:center; color:#94a3b8; margin-top:2rem;">Démarrez la conversation.</div>'}</div><div style="padding:1rem; border-top:1px solid #e2e8f0; display:flex; gap:0.5rem;"><input id="tmsg" style="flex:1; border:1px solid #cbd5e1; border-radius:24px; padding:0.6rem 1rem; font-size:0.85rem;" placeholder="Message..."><button class="btn btn-primary btn-icon" onclick="sendMsg('theme', ${t.id}, 'tmsg')" style="border-radius:50%; width:40px; height:40px; display:flex; align-items:center; justify-content:center;"><span class="material-icons-round">send</span></button></div></div>
    </div>
  `;
}

function renderPublicThemeView() {
  const t = state.themes.find(x => x.id === state.activeThemeId);
  const vSubs = state.subjects.filter(s => s.themeId === t.id && s.vote && s.vote.target === 'public');

  return `
    <div class="view-header" style="display:flex; align-items:center; gap:1rem;"><button class="btn btn-icon" onclick="navigate('dashboard')"><span class="material-icons-round">arrow_back</span></button><h2>Consultations : ${t.title}</h2></div>
    <div style="max-width:800px; margin:0 auto; display:flex; flex-direction:column; gap:2rem;">
      <div style="background:white; padding:1.5rem; border-radius:12px; border:1px solid #e2e8f0;"><p style="color:var(--text-main); line-height:1.6;">${t.desc}</p></div>
      <div style="display:flex; flex-direction:column; gap:1.5rem;">
        ${vSubs.map(s => {
          const hasVoted = state.publicVotedStatus[s.id];
          const totalPts = s.vote.counts.reduce((a,b)=>a+b, 0);
          const endDate = new Date(s.vote.endDate);
          const isClosed = APP_DATE > endDate;

          return `
            <div style="background:white; border:2px solid var(--primary); border-radius:12px; overflow:hidden;">
              <div style="background:var(--primary); color:white; padding:1rem 1.5rem; display:flex; justify-content:space-between; align-items:center;">
                <h3 style="margin:0; font-size:1.1rem;">${s.title}</h3>
                ${isClosed ? '<span style="background:white; color:var(--primary); padding:0.2rem 0.5rem; border-radius:8px; font-size:0.7rem; font-weight:bold;">CLÔTURÉ</span>' : `<span style="font-size:0.75rem;">Jusqu'au ${endDate.toLocaleDateString('fr-FR')}</span>`}
              </div>
              <div style="padding:1.5rem;">
                <p style="font-size:1.1rem; font-weight:600; margin-bottom:1.5rem;">${s.vote.question}</p>
                <div style="display:flex; flex-direction:column; gap:0.8rem;">
                  ${(!hasVoted && !isClosed) ? 
                    s.vote.options.map((opt, idx) => `<button class="btn btn-outline" onclick="submitPublicVote(${s.id}, ${idx})" style="justify-content:flex-start; padding:1rem;"><span>${opt}</span></button>`).join('')
                    : 
                    s.vote.options.map((opt, idx) => {
                      const pct = totalPts > 0 ? Math.round((s.vote.counts[idx]/totalPts)*100) : 0;
                      return `<div style="position:relative; background:#f1f5f9; border-radius:8px; overflow:hidden; padding:1rem; border:1px solid #e2e8f0;"><div style="position:absolute; top:0; left:0; bottom:0; width:${pct}%; background:var(--primary); opacity:0.1; z-index:0;"></div><div style="position:relative; z-index:1; display:flex; justify-content:space-between; align-items:center;"><span style="font-weight:600; color:var(--text-main);">${opt}</span><span style="font-size:0.85rem; color:var(--primary); font-weight:bold;">${pct}% (${s.vote.counts[idx]} voix)</span></div></div>`;
                    }).join('')
                  }
                </div>
                ${hasVoted ? '<div style="margin-top:1.5rem; font-size:0.85rem; color:#10b981; text-align:center;"><span class="material-icons-round" style="font-size:1rem; vertical-align:middle;">check_circle</span> A voté. Résultats dévoilés.</div>' : ''}
              </div>
            </div>
          `;
        }).join('')}
      </div>
    </div>
  `;
}

// --- VUE SUJET (Elus/Admin/Techniciens) ---
function renderSubjectView() {
  const s = state.subjects.find(x => x.id === state.activeSubjectId);
  const msgs = state.messages.filter(m => m.type === 'subject' && m.targetId === s.id);
  const ganttItems = state.gantt[s.id] || [];
  const canEdit = Permissions.canEditSubject(s, state.user);

  let voteHtml = '';
  if (s.vote) {
    const isPublic = s.vote.target === 'public';
    // Pour un vote interne, on masque les résultats tant qu'ils n'ont pas voté ou que le vote n'est pas clos.
    const isClosed = APP_DATE > new Date(s.vote.endDate);
    const hasVoted = s.vote.voters.includes(state.user.id);
    const totalPts = s.vote.counts.reduce((a,b)=>a+b, 0);

    // Les admins peuvent consulter les votes publics directement sur la vue du sujet ou supprimer (on cache pour le proto).
    // Si c'est un vote interne pour les élus, et qu'ils n'ont pas encore voté (et qu'il n'est pas clot):
    if (!isPublic && !hasVoted && !isClosed) {
       voteHtml = `
         <div style="background:#e0e7ff; border:1px solid #c7d2fe; border-radius:12px; padding:1.5rem; margin-bottom:2rem;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1rem;">
              <h3 style="margin:0; display:flex; align-items:center; gap:0.5rem; color:#4f46e5;"><span class="material-icons-round">how_to_vote</span> Vote Interne Décisionnel</h3>
              <span style="font-size:0.75rem; color:#6366f1; font-weight:bold;">S'achève le ${new Date(s.vote.endDate).toLocaleDateString()}</span>
            </div>
            <p style="font-size:1.1rem; font-weight:600; margin-bottom:1.5rem;">${s.vote.question}</p>
            <div style="display:flex; flex-direction:column; gap:0.8rem;">
               ${s.vote.options.map((opt, idx) => `<button class="btn btn-primary" onclick="submitEluVote(${s.id}, ${idx})" style="justify-content:flex-start; padding:0.8rem 1rem; background:white; color:#4f46e5; border:1px solid #a5b4fc;">${opt}</button>`).join('')}
            </div>
         </div>
       `;
    } else {
       // Résultats visibles (car on a voté, ou le vote est clos, ou c'est un vote public affiché pour info)
       voteHtml = `
         <div style="background:${isPublic ? '#f0fdf4' : '#f8fafc'}; border:1px solid ${isPublic ? '#bbf7d0' : '#e2e8f0'}; border-radius:12px; padding:1.5rem; margin-bottom:2rem;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1rem;">
              <h3 style="margin:0; display:flex; align-items:center; gap:0.5rem; color:${isPublic ? '#166534' : 'var(--text-main)'};"><span class="material-icons-round">${isPublic ? 'public' : 'how_to_vote'}</span> ${isPublic ? 'Consultation Citoyenne' : 'Résultats Vote Décisionnel'}</h3>
              <span style="font-size:0.75rem; color:var(--text-muted); font-weight:bold;">${isClosed ? 'CLÔTURÉ' : `S'achève le ${new Date(s.vote.endDate).toLocaleDateString()}`}</span>
            </div>
            <p style="font-size:1.05rem; font-weight:600; margin-bottom:1.5rem;">${s.vote.question}</p>
            <div style="display:flex; flex-direction:column; gap:0.6rem;">
               ${s.vote.options.map((opt, idx) => {
                 const pct = totalPts > 0 ? Math.round((s.vote.counts[idx]/totalPts)*100) : 0;
                 return `<div style="position:relative; background:white; border-radius:6px; overflow:hidden; padding:0.8rem; border:1px solid ${isPublic ? '#dcfce7' : '#e2e8f0'};"><div style="position:absolute; top:0; left:0; bottom:0; width:${pct}%; background:${isPublic ? '#22c55e' : 'var(--primary)'}; opacity:0.1; z-index:0;"></div><div style="position:relative; z-index:1; display:flex; justify-content:space-between; align-items:center;"><span style="font-weight:600; color:var(--text-main); font-size:0.9rem;">${opt}</span><span style="font-size:0.85rem; color:var(--text-muted); font-weight:bold;">${pct}% (${s.vote.counts[idx]})</span></div></div>`;
               }).join('')}
            </div>
            ${hasVoted ? '<div style="margin-top:1rem; font-size:0.8rem; color:var(--text-muted); text-align:center;">Vous avez participé à ce vote.</div>' : ''}
         </div>
       `;
    }
  }

  return `
    <div class="view-header" style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:1rem;">
      <div style="display:flex; align-items:center; gap:1rem;"><button class="btn btn-icon" onclick="openTheme(${s.themeId})"><span class="material-icons-round">arrow_back</span></button><div><h2 style="display:flex; align-items:center; gap:0.5rem;">${s.title}</h2>${s.councilDate ? `<div style="margin-top:0.3rem;"><span class="tag-public" style="border-radius:12px; padding:0.2rem 0.6rem; font-size:0.75rem;"><span class="material-icons-round" style="font-size:0.9rem; vertical-align:middle;">event</span> Conseil ${new Date(s.councilDate).toLocaleDateString('fr-FR')}</span></div>` : ''}</div></div>
      <div style="display:flex; gap:0.5rem;">
        ${canEdit && !s.vote ? `<button class="btn btn-outline" style="border-color:var(--primary); color:var(--primary);" onclick="promptCreateVote(${s.id})"><span class="material-icons-round">how_to_vote</span> Créer Sondage/Vote</button>` : ''}
        ${Permissions.canAddToAgenda(state.user) && !s.councilDate ? `<button class="btn btn-primary" onclick="addToCouncil(${s.id})">Ordre du Jour</button>` : ''}
      </div>
    </div>
    
    <div style="display:grid; grid-template-columns: 1fr 350px; gap:2rem;">
      <div style="display:flex; flex-direction:column; gap:2rem;">
        ${voteHtml}
        
        <!-- DOCUMENTS -->
        <div style="background:white; border:1px solid #e2e8f0; padding:1.5rem; border-radius:12px;"><div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1.5rem;"><h3 style="margin:0;"><span class="material-icons-round" style="color:var(--text-muted); vertical-align:middle;">folder</span> Documents</h3>${canEdit ? `<label class="btn btn-outline btn-sm" style="cursor:pointer; border-color:var(--primary); color:var(--primary);"><input type="file" style="display:none" onchange="handleFileUpload(event, ${s.id})" multiple>Importer</label>` : ''}</div><div style="display:grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap:1rem;">${s.docs.map(d => `<div class="card" onclick="openDoc(${d.id})" style="padding:1rem; border:1px solid #e2e8f0; display:flex; align-items:center; gap:0.8rem; border-radius:8px;"><span class="material-icons-round" style="color:#ef4444; font-size:2rem;">description</span><div style="font-size:0.85rem; font-weight:500; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="${d.title}">${d.title}</div></div>`).join('')}${s.docs.length === 0 ? '<div style="grid-column:1/-1; color:#94a3b8; font-size:0.85rem; text-align:center;">Dossier sans document.</div>' : ''}</div></div>

        <!-- GANTT -->
        <div class="gantt-wrapper" style="border:1px solid #e2e8f0;"><h3 style="margin:0 0 1.5rem 0;"><span class="material-icons-round" style="color:var(--text-muted); vertical-align:middle;">timeline</span> Calendrier</h3>${canEdit ? `<div style="background:#f1f5f9; padding:1rem; border-radius:8px; display:flex; flex-wrap:wrap; gap:0.8rem; align-items:center; margin-bottom:1.5rem; border:1px dashed #cbd5e1;"><input type="text" id="gtask" placeholder="Etape" style="flex:1; padding:0.4rem; border:1px solid #cbd5e1; border-radius:6px; font-size:0.8rem;"><input type="date" id="gstart" style="padding:0.4rem; border:1px solid #cbd5e1; border-radius:6px; font-size:0.8rem;"><input type="date" id="gend" style="padding:0.4rem; border:1px solid #cbd5e1; border-radius:6px; font-size:0.8rem;"><button class="btn btn-primary btn-sm" onclick="addGanttStep(${s.id})">Ajouter</button></div>` : ''}<div class="gantt-header">${MONTH_NAMES.map(m => `<div class="gantt-month">${m}</div>`).join('')}</div><div class="gantt-body"><div class="gantt-today-line" style="left:${getGanttPos(APP_DATE)}%"></div>${ganttItems.map(g => renderGanttRow(g)).join('')}${ganttItems.length === 0 ? '<div style="text-align:center; padding:2rem; color:#94a3b8; font-size:0.85rem;">Aucune étape planifiée.</div>':''}</div></div>
      </div>
      
      <!-- CHAT DOSSIER -->
      <div style="background:white; border:1px solid #e2e8f0; border-radius:12px; display:flex; flex-direction:column; height: calc(100vh - 200px); min-height:500px;"><div style="padding:1rem; border-bottom:1px solid #e2e8f0; background:#f8fafc; border-radius:12px 12px 0 0;"><h3 style="font-size:1rem; margin:0;"><span class="material-icons-round" style="font-size:1.2rem; color:var(--primary); vertical-align:middle;">lock</span> Travail de bureau</h3></div><div id="thread-chat-subj" style="flex:1; overflow-y:auto; padding:1.5rem 1rem; display:flex; flex-direction:column; gap:1rem;">${msgs.map(m => `<div style="display:flex; flex-direction:column; gap:0.2rem; ${m.sender === state.user.name ? 'align-items:flex-end;' : 'align-items:flex-start;'}"><span style="font-size:0.7rem; color:#94a3b8; margin:0 0.5rem;">${m.sender}</span><div style="background:${m.sender === state.user.name ? 'var(--primary)' : '#f1f5f9'}; color:${m.sender === state.user.name ? 'white' : 'var(--text-main)'}; padding:0.6rem 1rem; border-radius:16px; font-size:0.85rem; max-width:85%;">${m.text}</div></div>`).join('') || '<div style="text-align:center; color:#94a3b8; margin-top:2rem;">Historique vide.</div>'}</div><div style="padding:1rem; border-top:1px solid #e2e8f0; display:flex; gap:0.5rem;"><input id="smsg" style="flex:1; border:1px solid #cbd5e1; border-radius:24px; padding:0.6rem 1rem; font-size:0.85rem;" placeholder="Note interne..."><button class="btn btn-primary btn-icon" onclick="sendMsg('subject', ${s.id}, 'smsg')" style="border-radius:50%; width:40px; height:40px; display:flex; align-items:center; justify-content:center;"><span class="material-icons-round">send</span></button></div></div>
    </div>
  `;
}

// ... Les autres vues ... (RAG/DocViewer/Users)
function renderDocViewer() {
  const d = [...state.themes, ...state.subjects].flatMap(x => x.docs || []).find(x => x.id === state.activeDocId);
  return `<div style="position:fixed; inset:0; background:rgba(15, 23, 42, 0.85); z-index:2000; display:flex; justify-content:center; align-items:center; padding:2rem;"><div style="background:white; width:100%; max-width:900px; height:85vh; border-radius:12px; display:flex; flex-direction:column; box-shadow:0 25px 50px -12px rgba(0,0,0,0.5);"><div style="display:flex; justify-content:space-between; align-items:center; padding:1.5rem; border-bottom:1px solid #e2e8f0; background:#f8fafc; border-radius:12px 12px 0 0;"><h3 style="margin:0; display:flex; align-items:center; gap:0.5rem;"><span class="material-icons-round" style="color:#ef4444;">description</span> ${d.title}</h3><button class="btn btn-icon" onclick="closeDoc()"><span class="material-icons-round">close</span></button></div><div style="flex:1; padding:2.5rem; overflow-y:auto; line-height:1.7; color:#334155; font-size:0.95rem; white-space:pre-wrap; font-family:Georgia, serif;">${d.content}</div></div></div>`;
}
function renderRAGView() {
  const getSubjGroup = (sid) => `subject-${sid}`;
  const getCouncilGroup = () => `councils`;
  return `<div class="view-header"><h2>Assistant IA (RAG)</h2><p style="color:var(--text-muted);">Sélectionnez les ensembles documentaires complets pour encadrer la recherche.</p></div><div style="display:grid; grid-template-columns: 320px 1fr; gap:2rem; height:calc(100vh - 200px); min-height:500px;"><div class="rag-sidebar" style="border-radius:12px; border:1px solid #e2e8f0; padding:1rem; overflow-y:auto;"><div style="margin-bottom:1.5rem; padding-bottom:1rem; border-bottom:1px solid #e2e8f0;"><div class="rag-doc-item" onclick="toggleRagGroup('${getCouncilGroup()}')" style="padding:0.8rem; background:${state.ragGroups.includes(getCouncilGroup())?'#e0e7ff':'#f8fafc'}; border:1px solid ${state.ragGroups.includes(getCouncilGroup())?'var(--primary)':'#cbd5e1'}; border-radius:8px;"><input type="checkbox" ${state.ragGroups.includes(getCouncilGroup())?'checked':''} onclick="event.stopPropagation()"> <span class="material-icons-round" style="color:var(--primary);">account_balance</span> <b style="font-size:0.85rem;">Toutes les délibérations</b></div></div><h4 style="margin-bottom:1rem; color:var(--text-main); font-size:0.9rem; text-transform:uppercase;">Dossiers (Sujets Entiers)</h4>${state.themes.map(t => { const tSubs = state.subjects.filter(s=>s.themeId===t.id); if (tSubs.length === 0) return ''; return `<div style="margin-bottom:1.5rem;"><b style="color:var(--text-muted); font-size:0.8rem;">${t.title}</b><div style="display:flex; flex-direction:column; gap:0.4rem; margin-top:0.5rem;">${tSubs.map(s => { const gid = getSubjGroup(s.id); return `<div class="rag-doc-item" onclick="toggleRagGroup('${gid}')" style="border:1px solid ${state.ragGroups.includes(gid)?'var(--primary)':'transparent'}; background:${state.ragGroups.includes(gid)?'#e0e7ff':'white'};"><input type="checkbox" ${state.ragGroups.includes(gid)?'checked':''} onclick="event.stopPropagation()"> <span class="material-icons-round" style="font-size:1.1rem; color:${state.ragGroups.includes(gid)?'var(--primary)':'#94a3b8'};">folder</span> <span style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-size:0.85rem;">${s.title} (${s.docs.length} doc)</span></div>`; }).join('')}</div></div>`; }).join('')}</div><div style="background:white; border:1px solid #e2e8f0; border-radius:12px; padding:1.5rem; display:flex; flex-direction:column;"><h3 style="margin:0 0 1rem 0; display:flex; align-items:center; gap:0.5rem; font-size:1.1rem;"><span class="material-icons-round" style="color:var(--primary);">auto_awesome</span> Interface de Requête</h3><div style="flex:1; background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; display:flex; align-items:center; justify-content:center; flex-direction:column; gap:1rem;"><span class="material-icons-round" style="font-size:3rem; color:#cbd5e1;">manage_search</span><div style="color:#64748b; font-size:0.9rem; text-align:center; max-width:300px;">Sélectionnez des groupes à gauche.<br><br><b style="color:var(--primary);">${state.ragGroups.length}</b> groupe(s) ciblé(s).</div></div><div style="display:flex; gap:1rem; margin-top:1.5rem;"><input style="flex:1; padding:1rem 1.2rem; border-radius:24px; border:1px solid #cbd5e1; font-family:inherit; font-size:0.9rem;" placeholder="Message IA..."><button class="btn btn-primary" onclick="alert('En construction.')" style="border-radius:24px;">Envoyer</button></div></div></div>`;
}
function renderCouncilManagement() {
  return `<div class="view-header"><h2>Agendas des Conseils Municipaux</h2></div><div class="council-list" style="max-width:800px;">${state.councils.map(c => { const dt = new Date(c.date); const days = Math.round((dt - APP_DATE) / (1000*60*60*24)); const isExp = state.expandedCouncilId === c.id; const ag = c.agenda.map(sid => state.subjects.find(s => s.id === sid)).filter(Boolean); return `<div style="background:white; border:1px solid #e2e8f0; border-radius:12px; margin-bottom:1rem;"><div class="council-card" onclick="toggleCouncilAgenda(${c.id})" style="border:none; border-radius:0; background:${days < 0 ? '#f8fafc' : 'white'};"><div style="display:flex; flex-direction:column; gap:0.3rem;"><b style="font-size:1.1rem;">Séance : ${dt.toLocaleDateString('fr-FR', {weekday:'long', day:'numeric', month:'long'})} à ${dt.toLocaleTimeString('fr-FR', {hour:'2-digit', minute:'2-digit'})}</b><span style="font-size:0.8rem; color:${days < 15 ? (days < 0 ? '#94a3b8' : '#ef4444') : '#10b981'}; font-weight:600;">${days < 0 ? 'Clôturée' : 'Dans '+days+'j'}</span></div><div style="display:flex; align-items:center; gap:1rem;"><span style="font-size:0.85rem; color:var(--text-muted); background:#f1f5f9; padding:0.3rem 0.6rem; border-radius:16px;">${c.agenda.length} point(s) inscrits</span><span class="material-icons-round" style="color:var(--text-muted); transition:transform 0.2s; transform:${isExp ? 'rotate(90deg)':'rotate(0deg)'};">chevron_right</span></div></div>${isExp ? `<div style="border-top:1px solid #e2e8f0; background:#f8fafc; padding:1.5rem;"><h4 style="margin:0 0 1rem 0; font-size:0.9rem; color:var(--text-muted); text-transform:uppercase;">Ordre du jour</h4><ul style="margin:0; padding-left:1.5rem; display:flex; flex-direction:column; gap:0.5rem; color:var(--text-main); font-size:0.9rem;">${ag.map(s => `<li><b>${s.title}</b></li>`).join('')}${ag.length === 0 ? '<li style="list-style:none; color:#94a3b8; font-style:italic; margin-left:-1.5rem;">Aucun dossier.</li>' : ''}</ul></div>` : ''}</div>`; }).join('')}</div>`;
}
function renderUsersManagement() { return `<div class="view-header"><h2>Administration : Droits et Rôles</h2></div><div style="display:grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap:1.5rem;">${state.users.map(u => { const refs = state.themes.filter(t => t.referentId === u.id); return `<div class="card" style="border:1px solid #e2e8f0;"><div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1rem;"><b style="font-size:1.1rem;">${u.name}</b><select onchange="updateUserRole(${u.id}, this.value)" style="padding:0.3rem; border-radius:4px; border:1px solid #cbd5e1; font-size:0.8rem; background:white;">${Object.values(ROLES).map(r => `<option value="${r}" ${u.role === r ? 'selected' : ''}>${r.toUpperCase()}</option>`).join('')}</select></div><div style="background:#f8fafc; padding:1rem; border-radius:8px;"><div style="font-size:0.8rem; font-weight:600; color:var(--text-muted); margin-bottom:0.5rem;">Thèmes en responsabilité :</div>${refs.map(t => `<div style="font-size:0.85rem; color:var(--text-main); margin-bottom:0.3rem;">• ${t.title}</div>`).join('')}${refs.length === 0 ? '<div style="font-style:italic; font-size:0.8rem; color:#94a3b8;">Aucun thème</div>' : ''}<div style="margin-top:1rem;"><select onchange="assignReferent(this.value, ${u.id})" style="width:100%; padding:0.4rem; border-radius:4px; border:1px solid #cbd5e1; font-size:0.8rem; background:white;"><option value="">-- Assigner un thème --</option>${state.themes.filter(t => t.referentId !== u.id).map(t => `<option value="${t.id}">${t.title}</option>`).join('')}</select></div></div></div>`;}).join('')}</div>`; }

// --- ACTIONS & UTILS ---
window.loginAs = (id) => { state.user = state.users.find(u => u.id === id); state.currentView = 'dashboard'; render(); };
window.loginPublic = () => { state.user = null; state.currentView = 'dashboard'; render(); };
window.logout = () => { state.user = null; state.currentView = 'login'; render(); };
window.navigate = (view) => { state.currentView = view; render(); };
window.openTheme = (id) => { state.activeThemeId = id; state.currentView = 'theme'; render(); };
window.openSubject = (id) => { state.activeSubjectId = id; state.currentView = 'subject'; render(); };
window.openDoc = (id) => { state.activeDocId = id; render(); };
window.closeDoc = () => { state.activeDocId = null; render(); };
window.toggleCouncilAgenda = (id) => { state.expandedCouncilId = state.expandedCouncilId === id ? null : id; render(); };

// --- VOTES ---
window.promptCreateVote = (sid) => {
  const q = prompt("Question du vote (ex: Êtes-vous pour ce projet ?) :");
  if (!q) return;
  const rawOpts = prompt("Réponses possibles, séparées par une virgule (ex: Oui, Non, Peut-être) :");
  if (!rawOpts) return;
  const opts = rawOpts.split(',').map(o => o.trim()).filter(Boolean);
  if (opts.length < 2) return alert("Il faut au minimum 2 options.");
  
  const target = confirm("Ce vote est-il à destination des ÉLUS seulement ?\n(OK = Élus en interne, Annuler = Population)");
  
  // Date de fin (minimum 3 jours)
  let d = new Date(APP_DATE);
  d.setDate(d.getDate() + 3);
  
  const s = state.subjects.find(x => x.id === sid);
  s.vote = { target: target ? 'elu' : 'public', question: q, options: opts, counts: new Array(opts.length).fill(0), voters: [], endDate: d.toISOString() };
  render();
};

window.submitPublicVote = (subjectId, optionIndex) => {
  const answer = prompt("Vérification anti-robot : Combien font 3 + 4 ?\nVeuillez taper le chiffre :");
  if (answer && answer.trim() === "7") {
    const s = state.subjects.find(x => x.id === subjectId);
    s.vote.counts[optionIndex]++;
    state.publicVotedStatus[subjectId] = true;
    alert("Votre vote a bien été pris en compte. Merci de votre participation !");
    render();
  } else {
    alert("Vérification échouée. Vote annulé.");
  }
};

window.submitEluVote = (subjectId, optionIndex) => {
  if(!state.user) return;
  if(confirm("Confirmer ce choix ? (définitif)")) {
    const s = state.subjects.find(x => x.id === subjectId);
    s.vote.counts[optionIndex]++;
    s.vote.voters.push(state.user.id);
    render();
  }
};

// ... Abonnements, Gantt, OCR, etc. (Conservés existants) ...
window.toggleSub = (type, id) => { if (!state.user) return; const list = type === 'theme' ? state.user.subs.themes : state.user.subs.subjects; const idx = list.indexOf(id); if (idx > -1) list.splice(idx, 1); else list.push(id); render(); };
window.promptCreateTheme = () => { const title = prompt("Titre de la commission :"); if (!title) return; const desc = prompt("Description :"); state.themes.push({ id: Date.now(), title, desc: desc || '', referentId: state.user.id, isArchived: false, docs: [] }); render(); };
window.promptCreateSubject = (themeId) => { const title = prompt("Titre du nouveau dossier :"); if (!title) return; const desc = prompt("Description :"); const isConf = confirm("Confidentiel (invisible aux techniciens) ?"); state.subjects.push({ id: Date.now(), themeId, title, desc: desc || '', isConfidential: isConf, councilDate: null, docs: [], vote: null }); render(); };
window.updateUserRole = (uid, role) => { const u = state.users.find(x => x.id === uid); if(u) u.role = role; render(); };
window.assignReferent = (tid, uid) => { if(!tid) return; const t = state.themes.find(x => x.id === parseInt(tid)); if(t) t.referentId = uid; render(); };
window.addCouncilDate = () => { const val = document.getElementById('new-council-dt').value; if (val) { state.councils.push({ id: Date.now(), date: val, agenda: [] }); state.councils.sort((a,b) => new Date(a.date) - new Date(b.date)); render(); } else { alert("Date manquante."); } };
window.addToCouncil = (sid) => { const nextC = state.councils.find(c => (new Date(c.date) - APP_DATE) / (1000*60*60*24) >= 15); if (!nextC) return alert("Aucun conseil dispo (>15j)."); if (confirm(`Inscrire ?`)) { const s = state.subjects.find(x => x.id === sid); s.councilDate = nextC.date; nextC.agenda.push(sid); render(); } };
window.toggleRagGroup = (groupId) => { const idx = state.ragGroups.indexOf(groupId); if (idx > -1) state.ragGroups.splice(idx, 1); else state.ragGroups.push(groupId); render(); };
window.addGanttStep = (sid) => { const task = document.getElementById('gtask').value; const start = document.getElementById('gstart').value; const end = document.getElementById('gend').value; if (!task || !start || !end) return alert("Remplir tout."); if (!state.gantt[sid]) state.gantt[sid] = []; state.gantt[sid].push({ id: Date.now(), task, start, end, status: 'todo' }); render(); };
window.handleFileUpload = (e, sid) => { const files = e.target.files; if(!files.length) return; for (let f of files) { const r = new FileReader(); r.onload = (ev) => { const s = state.subjects.find(x => x.id === sid); s.docs.push({ id: Date.now() + Math.random(), title: f.name, content: ev.target.result || "Vide" }); render(); }; r.readAsText(f); } };
window.sendMsg = (type, targetId, inputId) => { const i = document.getElementById(inputId); const text = i.value; if (!text) return; state.messages.push({ id: Date.now(), type, targetId, sender: state.user.name, text, date: new Date().toISOString() }); i.value = ''; render(); setTimeout(() => { const c = document.getElementById(type === 'theme' ? 'thread-chat' : 'thread-chat-subj'); if (c) c.scrollTop = c.scrollHeight; }, 50); };

function getGanttPos(d) { const date = new Date(d); const s = new Date("2026-01-01"); return Math.max(0, Math.min(100, ((date - s) / (new Date("2026-12-31") - s)) * 100)); }
function renderGanttRow(g) { const l = getGanttPos(g.start), r = getGanttPos(g.end); return `<div class="gantt-row"><div class="gantt-label">${g.task}</div><div class="gantt-bar-wrap"><div class="gantt-bar" style="left:${l}%; width:${Math.max(2, r-l)}%; background:${g.status==='done'?'#cbd5e1':'var(--primary)'}"></div></div></div>`; }
function attachEvents() { document.querySelectorAll('input[type="text"]').forEach(i => { i.onkeypress = (e) => { if (e.key === 'Enter') { const b = i.parentElement.querySelector('button'); if(b) b.click(); } } }); }
document.addEventListener('DOMContentLoaded', () => { setTimeout(render, 300); });
