// --- ACTIONS / UTILS ---
window.handleLogin = async (e) => {
  if (e) e.preventDefault();
  const userV = document.getElementById('login-user').value.trim();
  const passV = document.getElementById('login-pass').value;

  let email = userV;
  if (!email.includes('@')) {
    email = email + '@admin.com';
  }

  if (!email || !passV) {
    return alert("Veuillez remplir le nom d'utilisateur et de mot de passe.");
  }

  try {
    console.log("Supabase Auth Attempt with:", email);
    const { data, error } = await supabaseClient.auth.signInWithPassword({
      email: email,
      password: passV,
    });

    if (error) {
      console.error(error);
      alert("Authentification échouée : " + error.message);
    } else {
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

// --- AUTO-INSCRIPTION ---
window.checkRegistrationEligibility = async () => {
  const email = document.getElementById('reg-email').value.trim().toLowerCase();
  if (!email || !email.includes('@')) return alert("Veuillez entrer une adresse email valide.");
  const errDiv = document.getElementById('register-error');
  errDiv.style.display = 'none';

  try {
    const { data, error } = await supabaseClient.from('allowed_registrations')
      .select('*').eq('email', email).is('used_at', null).limit(1);

    if (error) throw error;
    if (!data || data.length === 0) {
      errDiv.style.display = 'block';
      errDiv.innerHTML = '<span class="material-icons-round" style="font-size:1.2rem; vertical-align:middle;">block</span> Cet email n\'est pas pré-autorisé. Contactez votre administrateur pour obtenir une invitation.';
      return;
    }

    const reg = data[0];
    window._pendingReg = reg;
    document.getElementById('register-step1').style.display = 'none';
    document.getElementById('register-step2').style.display = 'flex';
    document.getElementById('reg-auth-info').innerText = `Autorisé ! Collectivité: ${reg.collectivite_id} — Rôle: ${reg.role}`;
    if (reg.full_name) document.getElementById('reg-fullname').value = reg.full_name;
  } catch (err) {
    console.error(err);
    errDiv.style.display = 'block';
    errDiv.innerText = 'Erreur de vérification : ' + err.message;
  }
};

window.handleSelfRegister = async () => {
  const reg = window._pendingReg;
  if (!reg) return alert('Erreur: aucune pré-autorisation trouvée. Recommencez.');
  const email = document.getElementById('reg-email').value.trim().toLowerCase();
  const fullName = document.getElementById('reg-fullname').value.trim();
  const pwd = document.getElementById('reg-password').value;
  const pwd2 = document.getElementById('reg-password2').value;
  const errDiv = document.getElementById('register-error');
  errDiv.style.display = 'none';

  if (!fullName) return alert('Veuillez renseigner votre nom complet.');
  if (!pwd || pwd.length < 6) return alert('Le mot de passe doit faire au moins 6 caractères.');
  if (pwd !== pwd2) return alert('Les mots de passe ne correspondent pas.');

  try {
    const { data, error } = await supabaseClient.auth.signUp({
      email: email,
      password: pwd,
      options: {
        data: {
          username: fullName,
          role: reg.role,
          collectivite_id: reg.collectivite_id
        }
      }
    });

    if (error) throw error;

    // Marquer la pré-autorisation comme utilisée
    await supabaseClient.from('allowed_registrations').update({ used_at: new Date().toISOString() }).eq('id', reg.id);

    alert('Compte créé avec succès ! Vous pouvez maintenant vous connecter avec votre email et mot de passe.');
    window._pendingReg = null;
    navigate('login');
  } catch (err) {
    console.error(err);
    errDiv.style.display = 'block';
    errDiv.innerText = 'Erreur de création : ' + err.message;
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
window.openTheme = (id) => { state.activeThemeId = isNaN(id) ? id : Number(id); state.currentView = 'theme'; render(); };
window.openSubject = (id) => { state.activeSubjectId = isNaN(id) ? id : Number(id); state.currentView = 'subject'; render(); };
window.openDoc = (id) => { state.activeDocId = isNaN(id) ? id : Number(id); render(); };
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
      if (data.user) {
        try {
          // Attendre 400ms pour laisser le trigger Supabase créer la ligne par défaut dans la BDD
          await new Promise(r => setTimeout(r, 400));
          // Forcer la MAJ avec la bonne collectivité via un update explicite
          const { error: pErr } = await supabaseClient.from('profiles')
               .update({ role: ROLES.ADMIN, collectivite_id: colId })
               .eq('id', data.user.id);
          
          if (pErr) {
             console.warn("Update échoué, tentative d'insertion manuelle.", pErr);
             await supabaseClient.from('profiles').insert({ id: data.user.id, email: mail, username: name, role: ROLES.ADMIN, collectivite_id: colId });
          }
        } catch (e) { 
           console.error("Échec critique de l'affectation du profil:", e);
        }
      }
      alert(`Compte Créé avec succès pour la collectivité "${colId}" !\n\nL'utilisateur peut maintenant se connecter avec :\nEmail : ${mail}\nMot de passe : ${pass}\n\nVous êtes maintenant déconnecté.`);
      await window.logout();
    }
  } catch (err) {
    console.error(err);
    alert("Une erreur inattendue est survenue.");
  }
};
// L'impersonation directe disparait, remplacée par le target global
window.impersonateCollectivite = async () => {
  render();
};

window.deleteTheme = async (e, tid) => {
  e.stopPropagation();
  if (confirm("ATTENTION: Êtes-vous sûr de vouloir archiver/supprimer ce thème et le faire disparaître du tableau de bord ?")) {
    const { error } = await supabaseClient.from('themes').update({ is_archived: true }).eq('id', tid);
    if (error) {
       console.error(error);
       alert("Erreur base de données (RLS) : Impossible de supprimer ce thème. Vérifiez vos droits Supabase. Message: " + error.message);
    }
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

