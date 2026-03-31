/**
 * EluConnect - Plateforme Élus & Techniciens
 * Version Finale (Abonnements, Votes, Droits, Tesseract, Supabase)
 */

// --- DEBUG TRACER ---
console.log("=== APP.JS STARTING ===");

// --- CONFIG SUPABASE ---
const supabaseUrl = 'https://cwppjhzjpbucyiwtncmt.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN3cHBqaHpqcGJ1Y3lpd3RuY210Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ2MTQ5NDQsImV4cCI6MjA5MDE5MDk0NH0.pe-JWUtpPs_sfI1OUrej7m3Fu2Km3QzB1Rh8qmHhd5w';
let supabaseClient;
try {
  supabaseClient = window.supabase ? window.supabase.createClient(supabaseUrl, supabaseKey) : null;
} catch (e) {
  console.error("Supabase init error:", e);
}

const ROLES = { SUPERADMIN: 'superadmin', ADMIN: 'admin', MAIRE: 'maire', ADJOINT: 'adjoint', DELEGUE: 'delegue', TECHNICIEN: 'technicien', ELU: 'elu' };
const MONTH_NAMES = ["Jan", "Fév", "Mar", "Avr", "Mai", "Juin", "Juil", "Août", "Sept", "Oct", "Nov", "Déc"];
const APP_DATE = new Date("2026-03-23T16:00:00");

// --- SANITIZE HTML (XSS PROTECTION) ---
const sanitizeHTML = (str) => {
  if (typeof str !== 'string') return str;
  return str.replace(/[&<>'"]/g, tag => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    "'": '&#39;',
    '"': '&quot;'
  }[tag] || tag)
  );
};

// --- STATE ---
let state = {
  user: null, // {id, username, email, role, collectivite_id, attachedThemes: []}
  currentView: 'login',
  activeThemeId: null,
  activeSubjectId: null,
  activeDocId: null,
  expandedCouncilId: null,
  publicVotedStatus: {},

  themes: [],
  subjects: [],
  councils: [],
  messages: [],
  gantt: {},
  historyLogs: [],
  users: [],

  tempRagDocs: [],
  aiChat: [],
  aiChatViewMode: 'clear',
  apiConfig: {
    active: localStorage.getItem('rag_api_active') || 'none',
    keys: {
      free: localStorage.getItem('rag_api_free') || '',
      mamouth: localStorage.getItem('rag_api_mamouth') || '',
      pro: localStorage.getItem('rag_api_pro') || ''
    }
  }
};

// --- INITIALIZATION & SYNC ---
async function syncFromSupabase() {
  if (!supabaseClient) return;
  try {
    // 1. Mise à jour du profil de l'utilisateur courant pour obtenir sa collectivité
    if (state.user && state.user.id) {
      const { data: pData } = await supabaseClient.from('profiles').select('*').eq('id', state.user.id).single();
      if (pData) {
        state.user.role = pData.role;
        state.user.collectivite_id = pData.collectivite_id || null;
        state.user.username = pData.username;
        state.user.attachedThemes = pData.attached_themes || [];
      }
    }

    // 2. Construction des requêtes avec filtrage de cloisonnement (Multi-Tenancy)
    let queryThemes = supabaseClient.from('themes').select('*').eq('is_archived', false);
    let querySubjects = supabaseClient.from('subjects').select('*');
    let queryCouncils = supabaseClient.from('councils').select('*');
    let queryMessages = supabaseClient.from('messages').select('*');
    let queryDocuments = supabaseClient.from('documents').select('*');
    let queryProfiles = supabaseClient.from('profiles').select('*');

    // Le SUPERADMIN n'a pas de filtre global (ou peut choisir). Tous les autres sont cloîtrés.
    if (state.user && state.user.role !== ROLES.SUPERADMIN && state.user.collectivite_id) {
      queryThemes = queryThemes.eq('collectivite_id', state.user.collectivite_id);
      querySubjects = querySubjects.eq('collectivite_id', state.user.collectivite_id);
      queryCouncils = queryCouncils.eq('collectivite_id', state.user.collectivite_id);
      queryProfiles = queryProfiles.eq('collectivite_id', state.user.collectivite_id);
      // Note : les documents et messages n'ont pas forcément collectivite_id dans la table actuellement,
      // donc on les filtrera localement en fonction des sujets correspondants pour ne pas faire crasher la BDD s'ils n'ont pas la colonne.
    }

    const [
      { data: profiles },
      { data: themes },
      { data: subjects },
      { data: councils },
      { data: messages },
      { data: documents }
    ] = await Promise.all([
      queryProfiles, queryThemes, querySubjects, queryCouncils, queryMessages, queryDocuments
    ]);

    state.users = profiles || [];
    state.themes = (themes || []).map(t => ({ id: t.id, title: t.title, desc: t.description, isArchived: t.is_archived, collectivite_id: t.collectivite_id }));

    const allSubjects = (subjects || []).map(s => ({
      id: s.id, themeId: s.theme_id, title: s.title, desc: s.description, isConfidential: s.is_confidential,
      councilDate: s.council_date, vote: s.vote, docs: [], collectivite_id: s.collectivite_id
    }));

    // Filtrage des documents et messages orphelins (sécurité supplémentaire front-end)
    const validSubjectIds = new Set(allSubjects.map(s => s.id));
    const allDocs = (documents || []).filter(d => validSubjectIds.has(d.subject_id)).map(d => ({
      id: d.id, subject_id: d.subject_id, title: d.title, content: d.content, fileUrl: d.file_url
    }));

    allSubjects.forEach(s => { s.docs = allDocs.filter(d => d.subject_id === s.id); });
    state.subjects = allSubjects;

    state.councils = (councils || []).map(c => ({ id: c.id, date: c.date_seance, agenda: c.agenda || [], collectivite_id: c.collectivite_id }));
    state.messages = (messages || []).map(m => ({ id: m.id, type: m.type, targetId: m.target_id, sender: m.sender, text: m.text }));

  } catch (err) {
    console.error("Erreur de synchro Supabase:", err);
  }
}

// L'historique devient temporaire/client-side pour l'instant
function logHistory(themeId, action, description) {
  state.historyLogs.push({
    id: Date.now(),
    themeId,
    action,
    description,
    user: state.user ? state.user.username : 'Système',
    date: new Date().toISOString()
  });
}

// --- PERMISSIONS ---
const Permissions = {
  isPublic: () => !state.user,

  // Maire : tout (sauf admin), Adjoint/Délégué : tout sur leurs thèmes rattachés.
  canManageTheme: (t, u) => {
    if (!u) return false;
    if (u.role === ROLES.SUPERADMIN || u.role === ROLES.ADMIN || u.role === ROLES.MAIRE) return true;
    if (u.role === ROLES.TECHNICIEN || u.role === ROLES.ELU) return false;
    return u.attachedThemes && u.attachedThemes.includes(t.id);
  },

  canManageSubject: (s, u) => {
    if (!u) return false;
    if (u.role === ROLES.SUPERADMIN || u.role === ROLES.ADMIN || u.role === ROLES.MAIRE) return true;
    if (u.role === ROLES.TECHNICIEN || u.role === ROLES.ELU) return false;
    return u.attachedThemes && u.attachedThemes.includes(s.themeId);
  },

  canSeeSubject: (s, u) => {
    if (!u) return false;
    if (u.role === ROLES.SUPERADMIN || u.role === ROLES.ADMIN || u.role === ROLES.MAIRE) return true;
    // Technicien ne voit pas si confidentiel
    if (u.role === ROLES.TECHNICIEN && s.isConfidential) return false;
    return true;
  },

  canVote: (s, u) => {
    if (!u) return false;
    if (u.role === ROLES.SUPERADMIN) return true;
    if (s.vote && s.vote.target === 'elu' && u.role !== ROLES.TECHNICIEN) return true;
    return false;
  },

  canManageUsers: (u) => u && (u.role === ROLES.SUPERADMIN || u.role === ROLES.ADMIN || u.role === ROLES.MAIRE),
  canAttachThemes: (u) => u && (u.role === ROLES.SUPERADMIN || u.role === ROLES.ADMIN || u.role === ROLES.MAIRE),

  canManageCouncil: (u) => u && [ROLES.SUPERADMIN, ROLES.ADMIN, ROLES.MAIRE, ROLES.ADJOINT, ROLES.DELEGUE].includes(u.role),
  canAddToAgenda: (s, u) => u && ([ROLES.SUPERADMIN, ROLES.ADMIN, ROLES.MAIRE].includes(u.role) || ([ROLES.ADJOINT, ROLES.DELEGUE].includes(u.role) && u.attachedThemes.includes(s.themeId)))
};

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
            <h3 style="margin:0 0 1rem 0; color:var(--text-main); display:flex; align-items:center; gap:0.5rem;"><span class="material-icons-round" style="color:#0ea5e9;">manage_search</span> Incarner une Collectivité</h3>
            <p style="font-size:0.9rem; color:#64748b; margin-bottom:1.5rem;">Filtrez toute votre vue actuelle pour voir la base de données spécifique à une collectivité.</p>
            
            <select id="sa_col_viewer" style="width:100%; padding:0.8rem; border-radius:8px; border:1px solid #cbd5e1; font-size:0.95rem; margin-bottom:1rem;">
                <option value="">-- Mode Global Silo (Tout voir) --</option>
                ${collectivites.map(c => `<option value="${c}" ${state.user.collectivite_id === c ? 'selected' : ''}>${c}</option>`).join('')}
            </select>
            
            <button class="btn btn-outline" style="width:100%; justify-content:center;" onclick="impersonateCollectivite()"><span class="material-icons-round">visibility</span> Filtrer l'application</button>
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
            <h3 style="margin-bottom:0.2rem; flex:1; cursor:pointer;" onclick="openTheme(${t.id})">${sanitizeHTML(t.title)}</h3>
        </div>
        <p class="card-desc" style="flex:1; cursor:pointer;" onclick="openTheme(${t.id})">${sanitizeHTML(t.desc)}</p>
        <div style="margin-top:1rem; display:flex; justify-content:space-between; align-items:center;">
            <span style="font-size:0.75rem; color:var(--text-muted); background:#f1f5f9; padding:0.2rem 0.5rem; border-radius:4px;">${subsCount} dossier(s)</span>
            ${Permissions.canManageTheme(t, state.user) ? `<button class="btn btn-icon" style="color:#ef4444; padding:0; width:28px; height:28px;" onclick="deleteTheme(event, ${t.id})" title="Supprimer ce Thème"><span class="material-icons-round" style="font-size:1.1rem;">delete_outline</span></button>` : ''}
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
  return `<div class="view-header"><h2>Administration : Utilisateurs et Accès</h2><p style="color:var(--text-muted);">Gestion des profils de la base de données Supabase.</p></div>
  <div style="display:grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap:1.5rem;">
  ${state.users.map(u => {
    return `
    <div class="card" style="border:1px solid #e2e8f0; display:flex; flex-direction:column;">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1rem;">
         <b style="font-size:1.1rem;">${u.username}</b>
         ${(state.user.role === ROLES.ADMIN || (state.user.role === ROLES.MAIRE && u.role !== ROLES.ADMIN)) && u.id !== state.user.id ? `
         <select onchange="changeUserRole('${u.id}', this.value)" style="font-size:0.75rem; padding:0.1rem; border-radius:4px; border:1px solid #cbd5e1; background:white;">
            ${Object.values(ROLES).map(r => `<option value="${r}" ${r === u.role ? 'selected' : ''}>${r}</option>`).join('')}
         </select>` : `<span class="role-badge role-${u.role.toLowerCase()}" style="margin:0; font-size:0.75rem;">${u.role}</span>`}
      </div>
      <div style="font-size:0.85rem; color:var(--text-muted); margin-bottom:1rem; flex:1;">Email : ${u.email}</div>
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
      ${(state.user.role === ROLES.ADMIN || (state.user.role === ROLES.MAIRE && u.role !== ROLES.ADMIN)) && u.id !== state.user.id ? `
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

// --- ACTIONS / UTILS ---
window.handleLogin = async (e) => {
  if (e) e.preventDefault();
  const userV = document.getElementById('login-user').value.trim();
  const passV = document.getElementById('login-pass').value;

  let email = userV;
  // Traduire le username 'admin' en 'admin@admin.com' si renseigné ainsi.
  if (userV === 'admin' && !userV.includes('@')) {
    email = 'admin@admin.com';
  }

  if (!email || !passV) {
    return alert("Veuillez remplir le nom d'utilisateur et de mot de passe.");
  }

  try {
    console.log("Supabase Auth Attempt with:", email);
    // Supabase sign in logic
    const { data, error } = await supabaseClient.auth.signInWithPassword({
      email: email,
      password: passV,
    });

    if (error) {
      console.error(error);
      alert("Authentification échouée : " + error.message);
    } else {
      // Real Supabase succes. Setup minimal user, then sync accurately captures role
      state.user = { id: data.user.id, email: data.user.email, username: data.user.email.split('@')[0], role: ROLES.ELU, attachedThemes: [] };
      await syncFromSupabase();
      state.currentView = 'dashboard';
      render();
    }
  } catch (e) {
    console.error(e);
    alert("Authentification échouée / Impossible de contacter le serveur.");
  }
};

window.handlePublicLogin = async () => {
  const nom = document.getElementById('pub-nom').value;
  const pre = document.getElementById('pub-prenom').value;
  const capt = document.getElementById('pub-captcha').value;

  if (!nom || !pre || capt !== 'Q7T2X') return alert('Informations ou captcha incorrects.');

  state.user = null; // Public user
  await syncFromSupabase();
  state.currentView = 'dashboard';
  render();
};

window.logout = async () => {
  if (supabaseClient) await supabaseClient.auth.signOut();
  state.user = null;
  state.currentView = 'login';
  render();
};
window.navigate = (view) => { state.currentView = view; render(); };
window.openTheme = (id) => { state.activeThemeId = id; state.currentView = 'theme'; render(); };
window.openSubject = (id) => { state.activeSubjectId = id; state.currentView = 'subject'; render(); };
window.openDoc = (id) => { state.activeDocId = id; render(); };
window.closeDoc = () => { state.activeDocId = null; render(); };

// --- SUPERADMIN FUNCTIONS ---
window.createCollectiviteAdmin = async () => {
  const colId = document.getElementById('sa_col_id').value.trim();
  const mail = document.getElementById('sa_admin_mail').value.trim();
  const name = document.getElementById('sa_admin_name').value.trim();
  const pass = document.getElementById('sa_admin_pass').value;

  if (!colId || !mail || !name || !pass) return alert("Veuillez remplir tous les champs.");

  const proceed = confirm("ATTENTION: Pour créer le compte dans la couche système d'authentification, vous allez être temporairement déconnecté (contrainte de sécurité standard). Souhaitez-vous continuer ?");
  if (!proceed) return;

  try {
    const { data, error } = await supabaseClient.auth.signUp({
      email: mail,
      password: pass,
      options: {
        data: {
          username: name,
          role: ROLES.ADMIN,
          collectivite_id: colId
        }
      }
    });

    if (error) {
      alert("Erreur de création : " + error.message);
    } else {
      // Tenter de forcer l'entrée dans public.profiles si le trigger Supabase ne le fait pas.
      if (data.user) {
        try {
          await supabaseClient.from('profiles').upsert({ id: data.user.id, email: mail, username: name, role: ROLES.ADMIN, collectivite_id: colId });
        } catch (e) { }
      }
      alert(`Compte Créé avec succès pour la collectivité "${colId}" !\n\nL'utilisateur peut maintenant se connecter avec :\nEmail : ${mail}\nMot de passe : ${pass}\n\nVous êtes maintenant déconnecté.`);
      await window.logout();
    }
  } catch (err) {
    console.error(err);
    alert("Une erreur inattendue est survenue.");
  }
};

window.impersonateCollectivite = async () => {
  const colId = document.getElementById('sa_col_viewer').value;
  state.user.collectivite_id = colId || null; // Si vide, on voit tout.
  await syncFromSupabase();
  render();
};

window.deleteTheme = async (e, tid) => {
  e.stopPropagation();
  if (confirm("ATTENTION: Êtes-vous sûr de vouloir archiver/supprimer ce thème et le faire disparaître du tableau de bord ?")) {
    await supabaseClient.from('themes').update({ is_archived: true }).eq('id', tid);
    renderDashboard();
    await syncFromSupabase();
    render();
  }
};

// --- SÉCURITÉ ---
window.promptChangePassword = async () => {
  const newPwd = prompt("Nouveau mot de passe (min 6 caractères) :");
  if (!newPwd) return;
  if (newPwd.length < 6) return alert("Le mot de passe doit faire au moins 6 caractères.");

  try {
    const { data, error } = await supabaseClient.auth.updateUser({ password: newPwd });
    if (error) alert("Erreur Supabase : " + error.message);
    else alert("Votre mot de passe a bien été modifié !");
  } catch (e) {
    alert("Une erreur inattendue s'est produite.");
    console.error(e);
  }
};

// --- CRÉATION / GESTION DES DONNÉES ---
window.promptCreateTheme = async () => {
  const title = prompt("Titre de la commission/thème :");
  if (!title) return;
  const desc = prompt("Description :");
  await supabaseClient.from('themes').insert({ title, description: desc || '', collectivite_id: state.user.collectivite_id });
  logHistory(null, 'CREATION_THEME', `Thème créé : ${title}`);
  await syncFromSupabase();
  render();
};

window.promptCreateSubject = async (themeId) => {
  const title = prompt("Titre du nouveau dossier :");
  if (!title) return;
  const desc = prompt("Description :");
  const isConf = confirm("Ce dossier est-il confidentiel (invisible aux techniciens) ?");
  await supabaseClient.from('subjects').insert({ theme_id: themeId, title, description: desc || '', is_confidential: isConf, collectivite_id: state.user.collectivite_id });
  logHistory(themeId, 'AJOUT_SUJET', `Sujet créé : ${title}`);
  await syncFromSupabase();
  render();
};

window.deleteSubject = async (e, sid) => {
  e.stopPropagation();
  if (confirm("Supprimer ce sujet définitivement ?")) {
    const s = state.subjects.find(x => x.id === sid);
    await supabaseClient.from('subjects').delete().eq('id', sid);
    logHistory(s.themeId, 'SUPPRESSION_SUJET', `Sujet détruit : ${s.title}`);
    await syncFromSupabase();
    render();
  }
}

window.promptCreateUser = async () => {
  const email = prompt("Email du nouvel utilisateur (ou identifiant) :");
  if (!email) return;
  const password = prompt("Mot de passe temporaire pour cet utilisateur (min 6 caractères) :");
  if (!password || password.length < 6) return alert("Mot de passe trop court ou manquant.");

  const proceed = confirm("ATTENTION : Pour des raisons de sécurité imposées par Supabase, vous allez être déconnecté juste après la création pour laisser la place au nouveau compte.\n\nÊtes-vous sûr de vouloir créer ce compte maintenant ?");
  if (!proceed) return;

  try {
    const { data, error } = await supabaseClient.auth.signUp({
      email: email,
      password: password,
      options: {
        data: {
          username: email.split('@')[0],
          role: ROLES.ELU,
          collectivite_id: state.user.collectivite_id
        }
      }
    });

    if (error) {
      alert("Erreur Supabase : " + error.message);
    } else {
      if (data.user) {
        try {
          await supabaseClient.from('profiles').upsert({ id: data.user.id, email: email, username: email.split('@')[0], role: ROLES.ELU, collectivite_id: state.user.collectivite_id });
        } catch (e) { }
      }
      alert(`Compte ${email} créé pour cette collectivité !\nLe mot de passe temporaire est : ${password}\n\nVous êtes maintenant déconnecté. Veuillez vous reconnecter.`);
      await window.logout();
    }
  } catch (err) {
    console.error(err);
    alert("Une erreur inattendue est survenue.");
  }
}

window.addUserTheme = async (uid) => {
  const sel = document.getElementById('sel-thm-' + uid);
  if (sel && sel.value) {
    const u = state.users.find(x => x.id === uid);
    const newThemes = [...(u.attached_themes || []), parseInt(sel.value)];
    await supabaseClient.from('profiles').update({ attached_themes: newThemes }).eq('id', uid);
    await syncFromSupabase();
    render();
  }
}

window.removeUserTheme = async (uid, tid) => {
  const u = state.users.find(x => x.id === uid);
  const newThemes = (u.attached_themes || []).filter(x => x !== tid);
  await supabaseClient.from('profiles').update({ attached_themes: newThemes }).eq('id', uid);
  await syncFromSupabase();
  render();
}

window.deleteUser = (uid) => {
  alert("Pour des raisons de sécurité, la suppression complète d'un utilisateur doit être effectuée via le tableau de bord Supabase (Menu Authentication).");
}

window.changeUserRole = async (uid, newRole) => {
  const u = state.users.find(x => x.id === uid);
  if (u) {
    let updateData = { role: newRole };
    if (![ROLES.ADJOINT, ROLES.DELEGUE].includes(newRole)) updateData.attached_themes = [];
    await supabaseClient.from('profiles').update(updateData).eq('id', uid);
    await syncFromSupabase();
    render();
  }
}

window.addCouncilDate = async () => {
  const val = document.getElementById('new-council-dt').value;
  if (val) {
    await supabaseClient.from('councils').insert({ date_seance: val, agenda: [], collectivite_id: state.user.collectivite_id });
    await syncFromSupabase();
    state.councils.sort((a, b) => new Date(a.date) - new Date(b.date));
    render();
  } else {
    alert("Date manquante.");
  }
};

window.addToCouncil = async (sid) => {
  const nextC = state.councils.find(c => (new Date(c.date) - APP_DATE) / (1000 * 60 * 60 * 24) >= 0);
  if (!nextC) return alert("Aucun conseil programmé disponible.");
  if (confirm(`Inscrire à l'ordre du jour du ${new Date(nextC.date).toLocaleDateString()} ?`)) {
    await supabaseClient.from('subjects').update({ council_date: nextC.date }).eq('id', sid);
    const newAgenda = [...(nextC.agenda || []), sid];
    await supabaseClient.from('councils').update({ agenda: newAgenda }).eq('id', nextC.id);
    await syncFromSupabase();
    render();
  }
};

window.promptAddCouncilItem = async (cid) => {
  const title = prompt("Titre du point libre à l'ordre du jour :");
  if (title) {
    const c = state.councils.find(x => x.id === cid);
    const newAgenda = [...(c.agenda || []), { id: 'm_' + Date.now(), title: title, isManual: true }];
    await supabaseClient.from('councils').update({ agenda: newAgenda }).eq('id', cid);
    await syncFromSupabase();
    render();
  }
};

window.editCouncilItem = async (cid, itemId) => {
  const c = state.councils.find(x => x.id === cid);
  const it = c.agenda.find(x => x.id === itemId);
  if (it) {
    const n = prompt("Modifier le titre du point libre :", it.title);
    if (n) {
      const newAgenda = c.agenda.map(x => (x.id === itemId ? { ...x, title: n } : x));
      await supabaseClient.from('councils').update({ agenda: newAgenda }).eq('id', cid);
      await syncFromSupabase();
      render();
    }
  }
};

window.removeCouncilItem = async (cid, itemIdRaw) => {
  if (confirm("Retirer ce point de l'ordre du jour ?")) {
    const c = state.councils.find(x => x.id === cid);
    const parsedId = String(itemIdRaw).startsWith('m_') ? String(itemIdRaw) : Number(itemIdRaw);

    const newAgenda = c.agenda.filter(x => {
      if (typeof x === 'object') return x.id !== parsedId;
      return x !== parsedId;
    });

    await supabaseClient.from('councils').update({ agenda: newAgenda }).eq('id', cid);
    if (typeof parsedId === 'number') {
      await supabaseClient.from('subjects').update({ council_date: null }).eq('id', parsedId);
    }
    await syncFromSupabase();
    render();
  }
};

window.sendMsg = async (type, targetId, inputId) => {
  const i = document.getElementById(inputId);
  const text = i.value;
  if (!text) return;
  await supabaseClient.from('messages').insert({ type, target_id: targetId, sender: state.user.username, text });
  i.value = '';
  await syncFromSupabase();
  render();
  setTimeout(() => {
    const c = document.getElementById('thread-chat-subj');
    if (c) c.scrollTop = c.scrollHeight;
  }, 50);
};

// --- DOCUMENT UPLOAD & PARSING ---
window.handleDocUpload = async (e, sid) => {
  const files = e.target.files;
  if (!files.length) return;

  const s = state.subjects.find(x => x.id === sid);
  if (!s.docs) s.docs = [];

  const loader = document.getElementById('ocr-loader');
  const textInfo = document.getElementById('ocr-progress');
  loader.style.display = 'block';

  for (let f of files) {
    textInfo.innerText = "Analyse de " + f.name + "...";
    try {
      let textContent = "";
      const ext = f.name.split('.').pop().toLowerCase();

      if (['png', 'jpg', 'jpeg'].includes(ext) || f.type.startsWith('image/')) {
        if (typeof Tesseract === 'undefined') throw new Error("Tesseract non chargé");
        const result = await Tesseract.recognize(f, 'fra', {
          logger: m => { if (m.status === "recognizing text") textInfo.innerText = "Extraction Image OCR : " + Math.round(m.progress * 100) + "%"; }
        });
        textContent = result.data.text;
      } else if (ext === 'txt' || ext === 'csv') {
        textContent = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = ev => resolve(ev.target.result);
          reader.onerror = reject;
          reader.readAsText(f);
        });
      } else if (ext === 'pdf') {
        if (typeof pdfjsLib === 'undefined') throw new Error("PDF.js non chargé");
        const arrayBuffer = await f.arrayBuffer();
        const pdf = await pdfjsLib.getDocument(arrayBuffer).promise;
        let fullText = "";
        for (let i = 1; i <= pdf.numPages; i++) {
          textInfo.innerText = `Extraction PDF : Page ${i}/${pdf.numPages}`;
          const page = await pdf.getPage(i);
          const content = await page.getTextContent();
          const pageText = content.items.map(item => item.str).join(" ");

          if (pageText.trim().length < 20) {
            textInfo.innerText = `OCR de secours (Scan PDF) : Page ${i}/${pdf.numPages} en cours...`;
            const viewport = page.getViewport({ scale: 1.5 });
            const canvas = document.createElement("canvas");
            canvas.width = viewport.width;
            canvas.height = viewport.height;
            const renderContext = { canvasContext: canvas.getContext("2d"), viewport: viewport };
            await page.render(renderContext).promise;
            const imgData = canvas.toDataURL("image/jpeg");
            if (typeof Tesseract !== 'undefined') {
              const result = await Tesseract.recognize(imgData, 'fra', {
                logger: m => { if (m.status === "recognizing text") textInfo.innerText = `OCR Page ${i} : ${Math.round(m.progress * 100)}%`; }
              });
              fullText += result.data.text + "\n";
            }
          } else {
            fullText += pageText + "\n";
          }
        }
        textContent = fullText;
      } else if (['xls', 'xlsx'].includes(ext)) {
        if (typeof XLSX === 'undefined') throw new Error("SheetJS non chargé");
        const arrayBuffer = await f.arrayBuffer();
        const workbook = XLSX.read(arrayBuffer, { type: 'array' });
        let fullText = "";
        workbook.SheetNames.forEach(sheetName => {
          fullText += `--- FEUILLE : ${sheetName} ---\n`;
          const csv = XLSX.utils.sheet_to_csv(workbook.Sheets[sheetName]);
          fullText += csv + "\n\n";
        });
        textContent = fullText;
      } else {
        throw new Error("Format non supporté : " + ext);
      }

      // Supabase Storage upload (Origin File <= 5MB)
      let fileUrl = null;
      if (f.size <= 5 * 1024 * 1024) {
        try {
          const uniquePath = `docs/${Date.now()}_${Math.random().toString(36).substring(7)}_${f.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
          const { data: uploadData, error: uploadErr } = await supabaseClient.storage.from('documents_files').upload(uniquePath, f);
          if (!uploadErr && uploadData) {
            const { data: urlData } = supabaseClient.storage.from('documents_files').getPublicUrl(uploadData.path);
            fileUrl = urlData.publicUrl;
          } else {
            console.warn("Upload Storage échoué", uploadErr);
          }
        } catch (err) {
          console.warn("Erreur Storage upload:", err);
        }
      } else {
        console.warn("Le fichier " + f.name + " (" + (f.size / 1024 / 1024).toFixed(1) + "Mo) dépasse 5Mo, il ne sera uploadé que sous forme de texte.");
      }

      await supabaseClient.from('documents').insert({ subject_id: sid, title: "[Importé] " + f.name, content: textContent || "Aucun texte identifié.", file_url: fileUrl });
      logHistory(s.themeId, 'AJOUT_DOCUMENT', `Document importé et transcrit : ${f.name}`);
    } catch (err) {
      console.error(err);
      alert("Erreur lors de la lecture du fichier " + f.name + " : " + err.message);
    }
  }
  loader.style.display = 'none';
  await syncFromSupabase();
  render();
};

window.deleteDocument = async (sid, did) => {
  if (confirm("Supprimer ce document définitivement ?")) {
    await supabaseClient.from('documents').delete().eq('id', did);
    await syncFromSupabase();
    render();
  }
}

// --- VOTES ---
window.promptCreateVote = async (sid) => {
  const q = prompt("Question du vote (ex: Êtes-vous pour ce projet ?) :");
  if (!q) return;
  const rawOpts = prompt("Réponses possibles, séparées par une virgule (ex: Oui, Non, Peut-être) :");
  if (!rawOpts) return;
  const opts = rawOpts.split(',').map(o => o.trim()).filter(Boolean);
  if (opts.length < 2) return alert("Il faut au minimum 2 options.");

  const target = confirm("Ce vote est-il à destination des ÉLUS en interne ?\n(OK = Élus en interne, Annuler = Vote Public Citoyen)");

  const newVote = { target: target ? 'elu' : 'public', question: q, options: opts, counts: new Array(opts.length).fill(0), voters: [] };
  await supabaseClient.from('subjects').update({ vote: newVote }).eq('id', sid);
  await syncFromSupabase();
  render();
};

window.submitEluVote = async (subjectId, optionIndex) => {
  if (!state.user) return;
  if (confirm("Confirmer ce vote ? (définitif)")) {
    const s = state.subjects.find(x => x.id === subjectId);
    let updatedVote = JSON.parse(JSON.stringify(s.vote));
    updatedVote.counts[optionIndex]++;
    updatedVote.voters.push(state.user.id);
    await supabaseClient.from('subjects').update({ vote: updatedVote }).eq('id', subjectId);
    await syncFromSupabase();
    render();
  }
};

window.submitPublicVote = async (subjectId, optionIndex) => {
  const answer = prompt("Vérification : Combien font 3 + 4 ?\nVeuillez taper le chiffre :");
  if (answer && answer.trim() === "7") {
    const s = state.subjects.find(x => x.id === subjectId);
    let updatedVote = JSON.parse(JSON.stringify(s.vote));
    updatedVote.counts[optionIndex]++;

    const { error } = await supabaseClient.from('subjects').update({ vote: updatedVote }).eq('id', subjectId);
    if (error) {
      alert("Échec de l'enregistrement (seuls les membres authentifiés peuvent modifier les compteurs avec la RLS actuelle).");
    } else {
      state.publicVotedStatus[subjectId] = true;
      alert("Votre vote a bien été pris en compte. Merci de votre participation !");
    }
    await syncFromSupabase();
    render();
  } else {
    alert("Vérification échouée.");
  }
};
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
                   <div style="margin-bottom:1rem;">
                     <label style="display:flex; align-items:center; gap:0.5rem; cursor:pointer;">
                        <input type="checkbox" onchange="toggleRagDocsByArray(this, [${themeDocsIds.join(',')}])">
                        <span style="font-weight:600; color:var(--primary);">${sanitizeHTML(t.theme.title)}</span>
                     </label>
                     ${t.subjects.map(s => {
      const subjDocsIds = s.docs.map(d => d.id);
      return `
                        <div style="margin-left:1.5rem; margin-top:0.4rem;">
                           <label style="display:flex; align-items:center; gap:0.5rem; cursor:pointer;">
                              <input type="checkbox" onchange="toggleRagDocsByArray(this, [${subjDocsIds.join(',')}])">
                              <span style="font-weight:500; font-size:0.85rem; color:#475569;">↳ ${sanitizeHTML(s.subject.title)}</span>
                           </label>
                           <div style="margin-left:1.5rem; display:flex; flex-direction:column; gap:0.4rem; margin-top:0.4rem;">
                              ${s.docs.map(d => `
                                <label style="display:flex; align-items:center; gap:0.5rem; cursor:pointer;">
                                   <input type="checkbox" class="rag-doc-cb" id="rag-cb-${d.id}" value="${d.id}" data-title="${sanitizeHTML(d.title)}">
                                   <span style="font-size:0.85rem; color:var(--text-main);">${sanitizeHTML(d.title)}</span>
                                </label>
                              `).join('')}
                           </div>
                        </div>
                     `}).join('')}
                   </div>
                `}).join('')}

                 <!-- DOCUMENTS ÉPHÉMÈRES -->
                 <div style="margin-top:2rem; padding-top:1rem; border-top:1px dashed #cbd5e1;">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.8rem;">
                       <div style="font-weight:600; font-size:0.95rem; color:#8b5cf6;"><span class="material-icons-round" style="font-size:1.1rem; vertical-align:middle;">attach_file</span> Documents Importés (Éphémères)</div>
                       <div style="display:flex; gap:0.5rem;">
                           <label class="btn btn-outline btn-sm" style="cursor:pointer; padding:0.2rem 0.5rem; font-size:0.75rem;"><input type="file" id="ragTempDocs" accept=".pdf,.txt,.csv,.xls,.xlsx,.png,.jpg" multiple webkitdirectory style="display:none" onchange="handleTempRagUpload(event)">Importer Dossier/Fichiers</label>
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
                <div onclick="switchRagMode('auto')" style="flex:1; padding:1rem; text-align:center; font-weight:600; cursor:pointer; color:${state.aiChatMode === 'auto' ? '#ef4444' : '#64748b'}; background:${state.aiChatMode === 'auto' ? 'white' : 'transparent'}; border-bottom:${state.aiChatMode === 'auto' ? '2px solid #ef4444' : '1px solid transparent'};"><span class="material-icons-round" style="vertical-align:middle; font-size:1.1rem; margin-right:0.3rem;">smart_toy</span> Mode Auto (Chat API)</div>
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
                <textarea id="rag_compiled" style="width:100%; height:120px; padding:1rem; border-radius:8px; border:1px solid #a7f3d0; background:#f0fdf4; margin-bottom:0.5rem; font-family:inherit; font-size:0.85rem;" readonly></textarea>
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

// --- SCRAPER DOCUMENTAIRE ---
window.renderScraperView = () => {
  return `
    <div class="view-header">
      <h2 style="display:flex; align-items:center; gap:0.5rem;"><span class="material-icons-round" style="color:#0ea5e9; font-size:2.5rem; filter:drop-shadow(0 4px 3px rgb(0 0 0 / 0.07));">cloud_download</span>Scraping & Fonds Documentaire</h2>
      <p style="color:var(--text-muted); font-size:1.05rem;">Récupérez massivement des documents publics depuis un site web de mairie ou institution pour enrichir la base de connaissances.</p>
    </div>
    
    <div style="display:flex; flex-direction:column; gap:2rem; max-width:800px;">
        <div class="card" style="border:1px solid #e2e8f0; padding:2rem; box-shadow:0 4px 6px -1px rgba(0,0,0,0.05);">
            <h3 style="margin:0 0 1.5rem 0; font-size:1.2rem; color:var(--text-main); display:flex; align-items:center; gap:0.5rem;"><span class="material-icons-round" style="color:#8b5cf6;">search</span> Cibler une source</h3>
            
            <div style="display:flex; flex-direction:column; gap:1.5rem;">
               <div>
                  <label style="font-weight:600; font-size:0.95rem; margin-bottom:0.5rem; display:block; color:#334155;">URL du site internet (ex: https://www.paris.fr)</label>
                  <input type="url" id="scrap_url" placeholder="https://" style="width:100%; padding:0.8rem; border-radius:8px; border:1px solid #cbd5e1; font-size:1rem;">
               </div>
               
               <div style="text-align:center; position:relative; margin:1rem 0;">
                  <hr style="border:0; border-top:1px dashed #cbd5e1; margin:0;">
                  <span style="position:absolute; top:-10px; left:50%; transform:translateX(-50%); background:white; padding:0 1rem; color:#94a3b8; font-size:0.8rem; font-weight:bold;">ET</span>
               </div>
               
               <div>
                  <label style="font-weight:600; font-size:0.95rem; margin-bottom:0.5rem; display:block; color:#334155;">Recherche par Commune + Code Postal</label>
                  <input type="text" id="scrap_city" placeholder="ex: Lyon 69000 documents publics" style="width:100%; padding:0.8rem; border-radius:8px; border:1px solid #cbd5e1; font-size:1rem;">
               </div>
            </div>
            
            <div style="margin-top:2rem;">
               <button class="btn btn-primary" onclick="startScraping()" style="width:100%; justify-content:center; padding:1rem; font-size:1.1rem; background:linear-gradient(135deg, #0ea5e9 0%, #2563eb 100%);"><span class="material-icons-round" style="margin-right:0.5rem;">find_replace</span> Lancer l'exploration et l'extraction locale</button>
            </div>
            
            <div id="scrap_loader" style="display:none; text-align:center; margin-top:2rem; padding:1.5rem; background:#f0f9ff; border:1px solid #bae6fd; border-radius:8px;">
               <div class="spinner" style="width:30px;height:30px;border-top-color:#0284c7; border-width:3px; margin:0 auto 1rem auto;"></div>
               <div id="scrap_status" style="font-weight:600; color:#0369a1;">Connexion en cours via Proxy API...</div>
               <div id="scrap_details" style="font-size:0.85rem; color:#0284c7; margin-top:0.5rem;">Ceci peut prendre plusieurs minutes selon la taille du site.</div>
               <div id="scrap_progress_bar" style="height:6px; background:#e0f2fe; border-radius:3px; overflow:hidden; margin-top:1rem; width:100%;">
                   <div style="height:100%; width:0%; background:#0284c7; transition:width 0.3s;" id="scrap_progress_fill"></div>
               </div>
            </div>

            <div id="scrap_results" style="display:none; margin-top:2rem; padding:1.5rem; background:#f0fdf4; border:1px solid #bbf7d0; border-radius:8px;">
               <h4 style="margin:0 0 1rem 0; color:#166534; display:flex; align-items:center; gap:0.5rem;"><span class="material-icons-round">check_circle</span> Extraction terminée</h4>
               <p style="font-size:0.9rem; color:#15803d; margin-bottom:1rem;" id="scrap_results_text"></p>
               <button class="btn btn-primary" onclick="navigate('dashboard')" style="background:#16a34a; border-color:#15803d;">Aller voir le nouveau Thème créé</button>
            </div>
        </div>
    </div>
  `;
};

window.startScraping = async () => {
  const urlInput = document.getElementById('scrap_url').value.trim();
  const cityInput = document.getElementById('scrap_city').value.trim();

  if (!urlInput || !cityInput) return alert("Veuillez remplir l'URL de la mairie ET la commune (Nom + Code Postal).");

  document.getElementById('scrap_loader').style.display = 'block';
  document.getElementById('scrap_results').style.display = 'none';
  const fill = document.getElementById('scrap_progress_fill');
  const status = document.getElementById('scrap_status');
  const details = document.getElementById('scrap_details');

  try {
    fill.style.width = '10%';
    status.innerText = "Recherche des ressources Web...";
    let absPdfs = [];

    // 1. Scrap site web Mairie
    fill.style.width = '20%';
    status.innerText = "Analyse de " + urlInput;
    details.innerText = "Recherche de documents PDF sur le site officiel de la commune...";
    try {
      // Utilisation de corsproxy brut (HTML) avec tolérance sur l'extension .pdf (ex: .pdf?v=2)
      const proxyUrl = 'https://corsproxy.io/?' + encodeURIComponent(urlInput);
      const resp = await fetch(proxyUrl);
      const html = await resp.text();

      const pdfMatches = [...new Set((html.match(/href=["']([^"']*\.pdf[^"']*)["']/gi) || []).map(s => {
        let inner = s.replace(/href=["']/i, '');
        return inner.substring(0, inner.length - 1);
      }))];

      pdfMatches.forEach(p => {
        let absLink = p;
        if (p.startsWith('//')) absLink = 'https:' + p;
        else if (p.startsWith('/')) {
          try { absLink = new URL(urlInput).origin + p; } catch (e) { absLink = urlInput + p; }
        }
        else if (!p.startsWith('http')) absLink = urlInput + (urlInput.endsWith('/') ? '' : '/') + p;
        absPdfs.push(absLink);
      });
    } catch (e) {
      console.warn("Échec de l'exploration du site de la mairie:", e);
    }

    // 2. Recherche documents d'état
    fill.style.width = '40%';
    status.innerText = "Recherche documents d'État...";
    details.innerText = "Recherche institutionnelle (Gouv, Légifrance) pour : " + cityInput;
    try {
      // Bing est généralement bien plus tolérant envers les proxys/scrapers grand public
      const query = encodeURIComponent(cityInput + ' filetype:pdf (site:gouv.fr OR site:legifrance.gouv.fr)');
      const searchUrl = 'https://corsproxy.io/?' + encodeURIComponent('https://www.bing.com/search?q=' + query);

      const sr = await fetch(searchUrl);
      const html = await sr.text();

      // Extraire tous les href du HTML Bing
      const matches = [...html.matchAll(/href=["']([^"']+)["']/gi)];
      matches.forEach(m => {
        let rawLink = m[1].replace(/&amp;/g, '&');
        if (rawLink.startsWith('/')) {
          rawLink = 'https://www.bing.com' + rawLink;
        } else if (!rawLink.startsWith('http')) {
          rawLink = 'https://' + rawLink;
        }
        if (rawLink.toLowerCase().includes('.pdf') && !rawLink.includes('bing.com/')) {
          absPdfs.push(rawLink);
        }
      });
    } catch (e) {
      console.warn("Échec recherche documents d'état:", e);
    }

    absPdfs = [...new Set(absPdfs)].slice(0, 15); // Limite à 15 au total pour des raisons de performance Frontend

    let warningText = "";
    if (absPdfs.length === 0) {
      warningText = " Aucun fichier public analysable n'a été trouvé. Le dossier documentaire a quand même été créé vide.";
      console.warn("Scraper: 0 document trouvé.");
    }

    fill.style.width = '70%';
    status.innerText = "Création du dossier documentaire (" + absPdfs.length + " fichiers trouvés)";

    // On crée un Theme spécifique
    const themeTitle = "Fonds Documentaire - " + cityInput;
    const { data: themeData } = await supabaseClient.from('themes').insert({ title: themeTitle, description: "Scraping automatisé. Source: " + urlInput + " & État", collectivite_id: state.user.collectivite_id }).select();
    const themeId = themeData[0]?.id || Date.now();

    // Un sujet général
    const { data: subjData } = await supabaseClient.from('subjects').insert({ theme_id: themeId, title: "Archive Web Automatique", description: "Documents aspirés", is_confidential: false, collectivite_id: state.user.collectivite_id }).select();
    const subjId = subjData[0]?.id || Date.now();

    for (let i = 0; i < absPdfs.length; i++) {
      details.innerText = `Traitement: ${absPdfs[i]} (${i + 1}/${absPdfs.length})`;
      fill.style.width = (70 + (i / absPdfs.length) * 20) + '%';

      let textContent = "";

      // Si on peut télécharger
      if (absPdfs[i].startsWith('http') && typeof pdfjsLib !== 'undefined') {
        try {
          // Utiliser allorigins en mode raw pour mieux passer les buffers binaires
          const cleanUrl = absPdfs[i].trim();
          const proxyUrlPdf = 'https://api.allorigins.win/raw?url=' + encodeURIComponent(cleanUrl);

          const pdfResp = await fetch(proxyUrlPdf);
          if (!pdfResp.ok) throw new Error("Le proxy a renvoyé une erreur HTTP " + pdfResp.status);

          const buf = await pdfResp.arrayBuffer();
          const pdf = await pdfjsLib.getDocument(buf).promise;

          for (let p = 1; p <= Math.min(pdf.numPages, 10); p++) { // Limite debug 10 pages max pour la démo
            const page = await pdf.getPage(p);
            const t = await page.getTextContent();
            textContent += t.items.map(it => it.str).join(" ") + "\\n";
          }
          if (!textContent.trim()) textContent = "[Le document PDF semble vide ou est composé uniquement d'images scannées sans texte]";
        } catch (e) {
          textContent = `[Echec de l'Aspiration Automatique]\n\nImpossible de lire le document source : ${absPdfs[i]}\n\nRaison technique : ${e.message}\n(Ce fichier est probablement protégé ou bloqué par les sécurités anti-scraping du site de la commune)`;
        }
      } else {
        textContent = "URL invalide ou moteur PDF introuvable : " + absPdfs[i];
      }

      await supabaseClient.from('documents').insert({ subject_id: subjId, title: "[Scrap] " + absPdfs[i].split('/').pop().substring(0, 30), content: textContent });
    }

    fill.style.width = '100%';
    status.innerText = "Terminé !";
    document.getElementById('scrap_loader').style.display = 'none';
    document.getElementById('scrap_results').style.display = 'block';
    document.getElementById('scrap_results_text').innerText = `Opération réussie. ${absPdfs.length} documents ont été extraits et ajoutés à "Fonds Documentaire".` + warningText;

    await syncFromSupabase();
    state.activeThemeId = themeId;
    render();

  } catch (err) {
    console.error(err);
    alert("Erreur lors du scraping : " + err.message);
    document.getElementById('scrap_loader').style.display = 'none';
  }
};

window.saveRagContext = async () => {
  const pc = document.getElementById('rag_pc').value;
  const mc = document.getElementById('rag_mc').value;

  localStorage.setItem('rag_pc', pc);
  localStorage.setItem('rag_mc', mc);

  if (state.user && state.user.id) {
    await supabaseClient.from('profiles').update({ personal_context: pc }).eq('id', state.user.id);
  }
  alert("Paramètres de contexte RAG mémorisés !");
};

window.saveApiKeys = async () => {
  const keyMamouth = document.getElementById('api_key_mamouth').value;
  const keyPro = document.getElementById('api_key_pro').value;
  const keyFree = document.getElementById('api_key_free').value;

  localStorage.setItem('rag_api_mamouth', keyMamouth);
  localStorage.setItem('rag_api_pro', keyPro);
  localStorage.setItem('rag_api_free', keyFree);

  state.apiConfig.keys.mamouth = keyMamouth;
  state.apiConfig.keys.pro = keyPro;
  state.apiConfig.keys.free = keyFree;

  alert("Clés API sauvegardées avec succès !");
};

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
    </div>
  `;
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

window.generateRagPrompt = async () => {
  const promptText = document.getElementById('rag_prompt').value;
  if (!promptText) return alert("Veuillez entrer une consigne (prompt) pour l'IA.");

  document.getElementById('rag-loader').style.display = 'block';
  document.getElementById('rag_result_container').style.display = 'none';

  setTimeout(async () => {
    const pc = document.getElementById('rag_pc').value;
    const mc = document.getElementById('rag_mc').value.split(',').map(s => s.trim()).filter(Boolean);

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

    const res = await pseudonymiseText(fullContext, mc);

    document.getElementById('rag_compiled').value = res.text;
    document.getElementById('rag-input-section').style.display = 'none';
    document.getElementById('rag_result_container').style.display = 'flex';
    document.getElementById('rag-loader').style.display = 'none';

    localStorage.setItem('rag_keys', JSON.stringify(res.map));
  }, 100); // Let UI update loader
};

window.copyRagPrompt = () => {
  const el = document.getElementById('rag_compiled');
  el.select();
  document.execCommand('copy');
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

window.pseudonymiseText = async (text, mandatoryEntities) => {
  let map = {};

  const getFakeFor = (realStr, type) => {
    if (!realStr || realStr.length < 2) return realStr;
    if (map[realStr]) return map[realStr];
    let fake = "";
    if (type === 'Person') fake = window.faker.person.fullName();
    else if (type === 'Place') fake = window.faker.location.city();
    else if (type === 'Organization') fake = window.faker.company.name();
    else if (type === 'Email') fake = window.faker.internet.email();
    else if (type === 'Phone') mask = "06" + Math.floor(10000000 + Math.random() * 90000000); // Faker phone sometimes weird in FR format
    else fake = window.faker.word.noun();

    if (!fake && type === 'Phone') fake = "06" + Math.floor(10000000 + Math.random() * 90000000);
    map[realStr] = fake;
    return fake;
  };

  // 1. Mandatory Entités
  mandatoryEntities.forEach(ent => getFakeFor(ent, 'Organization'));

  // 2. Extract with Regex (Emails & Phones FR)
  const emailRegex = /([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9._-]+)/gi;
  const emails = text.match(emailRegex) || [];
  emails.forEach(e => getFakeFor(e, 'Email'));

  const phoneRegex = /(?:(?:\+|00)33|0)\s*[1-9](?:[\s.-]*\d{2}){4}/g;
  const phones = text.match(phoneRegex) || [];
  phones.forEach(p => getFakeFor(p, 'Phone'));

  // 3. Extract NLP data (Noms, Lieux, Entreprises) via Compromise
  if (window.nlp) {
    const doc = window.nlp(text);
    doc.people().out('array').forEach(p => getFakeFor(p.trim(), 'Person'));
    doc.places().out('array').forEach(p => getFakeFor(p.trim(), 'Place'));
    doc.organizations().out('array').forEach(o => getFakeFor(o.trim(), 'Organization'));
  }

  // 4. Repasser sur le texte par ordre de longueur décroissant pour ne pas casser les mots imbriqués
  let newText = text;
  const sortedKeys = Object.keys(map).sort((a, b) => b.length - a.length);

  sortedKeys.forEach(real => {
    const fake = map[real];
    const escapeRegExp = (string) => string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`\\b${escapeRegExp(real)}\\b`, 'g'); // Mots entiers si possible
    // Fallback on simple replace globally if word boundary misses due to accents
    newText = newText.replace(regex, fake);
    newText = newText.split(real).join(fake); // brut force replace for accents and punctuation weirdness
  });

  return { text: newText, map: map };
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
