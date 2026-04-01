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
  uiFilterUsers: null,
  pendingRegistrations: [],
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
      const { data: pData, error: pErr } = await supabaseClient.from('profiles').select('*').eq('id', state.user.id).single();
      if (pErr) console.error("Erreur critique sur la lecture du Profil RLS:", pErr);
      if (pData) {
        state.user.role = pData.role;
        if (state.user.role !== ROLES.SUPERADMIN) {
           state.user.collectivite_id = pData.collectivite_id || null;
        }
        state.user.username = pData.username;
        state.user.attachedThemes = pData.attached_themes || [];
      }
    }

    // Détermination de la collectivité ciblée (pour SuperAdmin il voit tout en global tout le temps)
    let targetCol = state.user ? state.user.collectivite_id : null;
    if (state.user && state.user.role === ROLES.SUPERADMIN) {
        targetCol = null;
    }

    // 2. Construction des requêtes avec filtrage de cloisonnement (Multi-Tenancy)
    let queryThemes = supabaseClient.from('themes').select('*').eq('is_archived', false);
    let querySubjects = supabaseClient.from('subjects').select('*');
    let queryCouncils = supabaseClient.from('councils').select('*');
    let queryMessages = supabaseClient.from('messages').select('*');
    let queryDocuments = supabaseClient.from('documents').select('*');
    let queryProfiles = supabaseClient.from('profiles').select('*');

    // Le SUPERADMIN n'a pas de filtre global si targetCol est null.
    if (targetCol) {
      queryThemes = queryThemes.eq('collectivite_id', targetCol);
      querySubjects = querySubjects.eq('collectivite_id', targetCol);
      queryCouncils = queryCouncils.eq('collectivite_id', targetCol);
      queryProfiles = queryProfiles.eq('collectivite_id', targetCol);
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

  // Charger les pré-autorisations en attente (pour les admins)
  if (state.user && Permissions.canManageUsers(state.user)) {
    try { await window.loadPendingRegistrations(); } catch(e) { /* table peut ne pas exister encore */ }
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

