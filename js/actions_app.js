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

window.promptPreAuthorize = async () => {
  const email = prompt("Email de l'utilisateur à pré-autoriser :");
  if (!email || !email.includes('@')) return alert("Email invalide.");
  const fullName = prompt("Nom complet de l'utilisateur (optionnel) :") || '';

  const roleChoices = Object.values(ROLES).filter(r => r !== ROLES.SUPERADMIN);
  const roleStr = prompt(`Rôle à attribuer (${roleChoices.join(', ')}) :`, ROLES.ELU);
  const role = roleChoices.includes(roleStr) ? roleStr : ROLES.ELU;

  const colId = state.user.role === ROLES.SUPERADMIN
    ? (prompt('ID Collectivité :') || state.user.collectivite_id)
    : state.user.collectivite_id;

  if (!colId) return alert('Collectivité manquante.');

  try {
    const { error } = await supabaseClient.from('allowed_registrations').insert({
      email: email.toLowerCase().trim(),
      role: role,
      collectivite_id: colId,
      full_name: fullName || null,
      created_by: state.user.id
    });

    if (error) {
      if (error.code === '23505') return alert('Cet email est déjà pré-autorisé.');
      throw error;
    }

    alert(`L'utilisateur ${email} est maintenant pré-autorisé avec le rôle "${role}" pour la collectivité "${colId}".\n\nIl pourra créer son compte depuis la page de connexion.`);
    await loadPendingRegistrations();
    render();
  } catch (err) {
    console.error(err);
    alert('Erreur : ' + err.message);
  }
};

window.revokePreAuth = async (regId) => {
  if (!confirm('Révoquer cette pré-autorisation ?')) return;
  await supabaseClient.from('allowed_registrations').delete().eq('id', regId);
  await loadPendingRegistrations();
  render();
};

window.loadPendingRegistrations = async () => {
  try {
    let query = supabaseClient.from('allowed_registrations').select('*').is('used_at', null);
    if (state.user.role !== ROLES.SUPERADMIN && state.user.collectivite_id) {
      query = query.eq('collectivite_id', state.user.collectivite_id);
    }
    const { data } = await query;
    state.pendingRegistrations = data || [];
  } catch(e) {
    console.warn('Impossible de charger les pré-autorisations:', e);
    state.pendingRegistrations = [];
  }
};

window.importMassUsers = async (e) => {
  const file = e.target.files[0];
  if (!file) return;

  try {
    const text = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = ev => resolve(ev.target.result);
      reader.onerror = reject;
      reader.readAsText(file, 'windows-1252');
    });

    const lines = text.split('\n').filter(l => l.trim() !== '');
    if (lines.length < 2) throw new Error("Le fichier est vide ou manque d'en-tête (au moins 2 lignes).");

    const regsToCreate = [];
    
    // Convention: Col 0 = Nom, Col 1 = Prénom, Col 2 = Email, Col 3 (Opt) = Rôle
    for(let i = 1; i < lines.length; i++) {
        const cells = lines[i].split(/[,;]/).map(c => c.trim().replace(/^["']|["']$/g, ''));
        if (cells.length >= 3 && cells[2].includes('@')) {
            const nom = cells[0];
            const prenom = cells[1];
            const email = cells[2].toLowerCase().trim();
            let rawRole = cells[3] ? cells[3].toLowerCase() : 'elu';
            
            let r = ROLES.ELU;
            if (rawRole.includes('admin')) r = ROLES.ADMIN;
            else if (rawRole.includes('maire')) r = ROLES.MAIRE;
            else if (rawRole.includes('adjoint')) r = ROLES.ADJOINT;
            else if (rawRole.includes('delegue') || rawRole.includes('délégué')) r = ROLES.DELEGUE;
            else if (rawRole.includes('technicien') || rawRole.includes('tech')) r = ROLES.TECHNICIEN;

            regsToCreate.push({
               email: email,
               full_name: `${prenom} ${nom}`,
               role: r,
               collectivite_id: state.user.collectivite_id,
               created_by: state.user.id
            });
        }
    }

    if (regsToCreate.length === 0) return alert("Aucun utilisateur valide trouvé. Vérifiez que la colonne 3 contient bien des emails.");

    if (confirm(`${regsToCreate.length} pré-autorisations vont être créées pour la collectivité "${state.user.collectivite_id}".\n\nLes utilisateurs pourront s'inscrire eux-mêmes depuis la page de connexion avec leur email.\n\nConfirmer ?`)) {
        
        const { error } = await supabaseClient.from('allowed_registrations').insert(regsToCreate);
        if (error) {
           if (error.code === '23505') throw new Error("Certains emails sont déjà pré-autorisés.");
           throw error;
        }
        
        alert(`Succès ! ${regsToCreate.length} pré-autorisations créées.`);
        await loadPendingRegistrations();
        render();
    }

  } catch (err) {
    console.error(err);
    alert("Erreur d'import massif : " + err.message);
  } finally {
    e.target.value = '';
  }
};

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
                 <div style="position:relative;">
                    <textarea id="rag_compiled" onmouseup="handleRagSelection(event)" style="width:100%; height:120px; padding:1rem; border-radius:8px; border:1px solid #a7f3d0; background:#f0fdf4; margin-bottom:0.5rem; font-family:inherit; font-size:0.85rem;" readonly></textarea>
                    
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

// --- SCRAPER DOCUMENTAIRE ---
window.renderScraperView = () => {
  return `
    <div class="view-header">
      <h2 style="display:flex; align-items:center; gap:0.5rem;"><span class="material-icons-round" style="color:#0ea5e9; font-size:2.5rem; filter:drop-shadow(0 4px 3px rgb(0 0 0 / 0.07));">cloud_download</span>Scraping & Fonds Documentaire</h2>
      <p style="color:var(--text-muted); font-size:1.05rem;">Récupérez les documents PDF publics (PV de conseils, délibérations...) depuis le site internet d'une commune.</p>
    </div>
    
    <div style="display:flex; flex-direction:column; gap:2rem; max-width:800px;">
        <div class="card" style="border:1px solid #e2e8f0; padding:2rem; box-shadow:0 4px 6px -1px rgba(0,0,0,0.05);">
            <h3 style="margin:0 0 1.5rem 0; font-size:1.2rem; color:var(--text-main); display:flex; align-items:center; gap:0.5rem;"><span class="material-icons-round" style="color:#8b5cf6;">search</span> Cibler une source</h3>
            
            <div style="display:flex; flex-direction:column; gap:1.5rem;">
               <div>
                  <label style="font-weight:600; font-size:0.95rem; margin-bottom:0.5rem; display:block; color:#334155;">URL du site internet (ex: https://www.dunieres.fr)</label>
                  <input type="url" id="scrap_url" placeholder="https://" style="width:100%; padding:0.8rem; border-radius:8px; border:1px solid #cbd5e1; font-size:1rem;">
               </div>
               <div>
                  <label style="font-weight:600; font-size:0.95rem; margin-bottom:0.5rem; display:block; color:#334155;">Nom du dossier à créer (ex: Dunières 43220)</label>
                  <input type="text" id="scrap_city" placeholder="Nom de la commune" style="width:100%; padding:0.8rem; border-radius:8px; border:1px solid #cbd5e1; font-size:1rem;">
               </div>
               <div style="display:flex; gap:1rem; align-items:center;">
                  <label style="font-size:0.9rem; color:#475569; display:flex; align-items:center; gap:0.5rem;">
                    <input type="number" id="scrap_depth" value="2" min="1" max="4" style="width:60px; padding:0.5rem; border-radius:6px; border:1px solid #cbd5e1; text-align:center;">
                    Profondeur d'exploration (niveaux de sous-pages)
                  </label>
                  <label style="font-size:0.9rem; color:#475569; display:flex; align-items:center; gap:0.5rem;">
                    <input type="number" id="scrap_max" value="50" min="5" max="200" style="width:70px; padding:0.5rem; border-radius:6px; border:1px solid #cbd5e1; text-align:center;">
                    Max pages explorées
                  </label>
               </div>
            </div>
            
            <div style="margin-top:2rem;">
               <button class="btn btn-primary" onclick="startScraping()" style="width:100%; justify-content:center; padding:1rem; font-size:1.1rem; background:linear-gradient(135deg, #0ea5e9 0%, #2563eb 100%);"><span class="material-icons-round" style="margin-right:0.5rem;">find_replace</span> Lancer l'exploration récursive</button>
            </div>
            
            <div id="scrap_loader" style="display:none; text-align:center; margin-top:2rem; padding:1.5rem; background:#f0f9ff; border:1px solid #bae6fd; border-radius:8px;">
               <div class="spinner" style="width:30px;height:30px;border-top-color:#0284c7; border-width:3px; margin:0 auto 1rem auto;"></div>
               <div id="scrap_status" style="font-weight:600; color:#0369a1;">Connexion en cours...</div>
               <div id="scrap_details" style="font-size:0.85rem; color:#0284c7; margin-top:0.5rem;"></div>
               <div id="scrap_progress_bar" style="height:6px; background:#e0f2fe; border-radius:3px; overflow:hidden; margin-top:1rem; width:100%;">
                   <div style="height:100%; width:0%; background:#0284c7; transition:width 0.3s;" id="scrap_progress_fill"></div>
               </div>
               <div id="scrap_found_list" style="text-align:left; margin-top:1rem; max-height:200px; overflow-y:auto; font-size:0.8rem; color:#475569;"></div>
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

// Utilitaire proxy CORS - Approche multi-couches
window._fetchViaProxy = async (url) => {
  // Couche 1: Essai direct (certains sites ont des CORS permissifs)
  try {
    const resp = await fetch(url, { signal: AbortSignal.timeout(8000), mode: 'cors' });
    if (resp.ok) return await resp.text();
  } catch(e) { /* CORS bloqué, normal */ }

  // Couche 2: Supabase Edge Function (si déployée)
  if (typeof supabaseClient !== 'undefined') {
    try {
      const { data: { session } } = await supabaseClient.auth.getSession();
      const supaUrl = supabaseClient.supabaseUrl || state?.supabaseUrl;
      if (supaUrl) {
        const resp = await fetch(supaUrl + '/functions/v1/cors-proxy', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + (session?.access_token || ''),
          },
          body: JSON.stringify({ url }),
          signal: AbortSignal.timeout(20000)
        });
        if (resp.ok) return await resp.text();
      }
    } catch(e) { console.warn("Edge Function proxy failed:", e.message); }
  }

  // Couche 3: Proxys CORS publics avec fallback
  const proxies = [
    (u) => 'https://api.allorigins.win/raw?url=' + encodeURIComponent(u),
    (u) => 'https://corsproxy.io/?' + encodeURIComponent(u),
    (u) => 'https://api.codetabs.com/v1/proxy?quest=' + encodeURIComponent(u),
    (u) => 'https://proxy.cors.sh/' + u,
  ];
  for (const proxyFn of proxies) {
    try {
      const proxyUrl = proxyFn(url);
      const resp = await fetch(proxyUrl, { 
        signal: AbortSignal.timeout(12000),
        headers: { 'x-cors-api-key': 'temp_' + Date.now() } // certains proxys l'exigent
      });
      if (resp.ok) {
        const text = await resp.text();
        if (text && text.length > 100) return text; // Vérifier que c'est pas une page d'erreur
      }
    } catch(e) { continue; }
  }
  throw new Error("Tous les proxys CORS ont échoué pour: " + url);
};

window.startScraping = async () => {
  const urlInput = document.getElementById('scrap_url').value.trim();
  const cityInput = document.getElementById('scrap_city').value.trim();
  const maxDepth = parseInt(document.getElementById('scrap_depth').value) || 2;
  const maxPages = parseInt(document.getElementById('scrap_max').value) || 50;

  if (!urlInput) return alert("Veuillez remplir l'URL du site.");
  if (!cityInput) return alert("Veuillez donner un nom pour le dossier de la commune.");

  let baseUrl;
  try { baseUrl = new URL(urlInput); } catch(e) { return alert("URL invalide."); }
  const origin = baseUrl.origin;

  document.getElementById('scrap_loader').style.display = 'block';
  document.getElementById('scrap_results').style.display = 'none';
  const fill = document.getElementById('scrap_progress_fill');
  const status = document.getElementById('scrap_status');
  const details = document.getElementById('scrap_details');
  const foundList = document.getElementById('scrap_found_list');

  const visited = new Set();
  const pdfLinks = new Set();
  const queue = [{ url: urlInput, depth: 0 }];
  // Keywords that signal council-related pages
  const keywords = ['conseil', 'municipal', 'deliber', 'proces-verbal', 'compte-rendu', 'seance', 'pv', 'communaute', 'assembl'];

  try {
    // Phase 1: Recursive crawl
    while (queue.length > 0 && visited.size < maxPages) {
      const { url: currentUrl, depth } = queue.shift();
      const normalizedUrl = currentUrl.split('#')[0].split('?')[0];
      if (visited.has(normalizedUrl)) continue;
      visited.add(normalizedUrl);

      const progress = Math.min(70, (visited.size / maxPages) * 70);
      fill.style.width = progress + '%';
      status.innerText = `Exploration page ${visited.size}/${maxPages} (profondeur ${depth}/${maxDepth})`;
      details.innerText = currentUrl.substring(0, 80) + (currentUrl.length > 80 ? '...' : '');

      try {
        const html = await window._fetchViaProxy(currentUrl);

        // Extract all href links
        const hrefRegex = /href=["']([^"'#]+)["']/gi;
        let match;
        while ((match = hrefRegex.exec(html)) !== null) {
          let link = match[1].replace(/&amp;/g, '&').trim();
          
          // Resolve relative URLs
          if (link.startsWith('//')) link = baseUrl.protocol + link;
          else if (link.startsWith('/')) link = origin + link;
          else if (!link.startsWith('http')) link = currentUrl.replace(/[^/]*$/, '') + link;

          // Is it a PDF?
          if (link.toLowerCase().match(/\.pdf(\?.*)?$/)) {
            if (!pdfLinks.has(link)) {
              pdfLinks.add(link);
              foundList.innerHTML += `<div style="padding:0.2rem 0; border-bottom:1px solid #f1f5f9;">📄 ${link.split('/').pop().substring(0,50)}</div>`;
            }
            continue;
          }

          // Queue internal pages for deeper crawl
          if (depth < maxDepth && link.startsWith(origin) && !visited.has(link.split('#')[0].split('?')[0])) {
            const linkLower = link.toLowerCase();
            // Prioritize pages likely to contain council documents
            const isPriority = keywords.some(kw => linkLower.includes(kw));
            if (isPriority) {
              queue.unshift({ url: link, depth: depth + 1 }); // Priority: front of queue
            } else {
              queue.push({ url: link, depth: depth + 1 });
            }
          }
        }
      } catch(e) {
        console.warn("Échec exploration page:", currentUrl, e.message);
      }
    }

    const absPdfs = [...pdfLinks].slice(0, 30); // Max 30 PDFs

    fill.style.width = '75%';
    status.innerText = `${absPdfs.length} PDF trouvés sur ${visited.size} pages explorées. Extraction du texte...`;

    // Phase 2: Create theme & subject
    const themeTitle = "Fonds Documentaire - " + cityInput;
    const { data: themeData } = await supabaseClient.from('themes').insert({ title: themeTitle, description: "Scraping automatisé. Source: " + urlInput + " (" + visited.size + " pages explorées)", collectivite_id: state.user.collectivite_id }).select();
    const themeId = themeData?.[0]?.id || Date.now();

    const { data: subjData } = await supabaseClient.from('subjects').insert({ theme_id: themeId, title: "Archive Web - " + cityInput, description: absPdfs.length + " documents PDF aspirés", is_confidential: false, collectivite_id: state.user.collectivite_id }).select();
    const subjId = subjData?.[0]?.id || Date.now();

    // Phase 3: Download & extract text from PDFs
    for (let i = 0; i < absPdfs.length; i++) {
      const pdfUrl = absPdfs[i];
      fill.style.width = (75 + (i / absPdfs.length) * 20) + '%';
      details.innerText = `PDF ${i+1}/${absPdfs.length}: ${pdfUrl.split('/').pop().substring(0,40)}`;

      let textContent = "";
      try {
        const proxyUrl = 'https://api.allorigins.win/raw?url=' + encodeURIComponent(pdfUrl);
        const pdfResp = await fetch(proxyUrl, { signal: AbortSignal.timeout(30000) });
        if (!pdfResp.ok) throw new Error("HTTP " + pdfResp.status);

        const buf = await pdfResp.arrayBuffer();
        const pdf = await pdfjsLib.getDocument(buf).promise;

        for (let p = 1; p <= Math.min(pdf.numPages, 15); p++) {
          const page = await pdf.getPage(p);
          const t = await page.getTextContent();
          const pageText = t.items.map(it => it.str).join(" ");

          if (pageText.trim().length < 20 && typeof Tesseract !== 'undefined') {
            // OCR fallback for scanned pages
            const viewport = page.getViewport({ scale: 1.5 });
            const canvas = document.createElement("canvas");
            canvas.width = viewport.width; canvas.height = viewport.height;
            await page.render({ canvasContext: canvas.getContext("2d"), viewport }).promise;
            const result = await Tesseract.recognize(canvas.toDataURL("image/jpeg"), 'fra');
            textContent += result.data.text + "\n";
          } else {
            textContent += pageText + "\n";
          }
        }
        if (!textContent.trim()) textContent = "[PDF scanné sans texte extractible]";
      } catch(e) {
        textContent = `[Échec aspiration] Source : ${pdfUrl}\nRaison : ${e.message}`;
      }

      const pdfName = decodeURIComponent(pdfUrl.split('/').pop().split('?')[0]).substring(0, 60);
      await supabaseClient.from('documents').insert({ subject_id: subjId, title: "[Scrap] " + pdfName, content: textContent });
    }

    fill.style.width = '100%';
    document.getElementById('scrap_loader').style.display = 'none';
    document.getElementById('scrap_results').style.display = 'block';
    document.getElementById('scrap_results_text').innerText = `${absPdfs.length} documents PDF extraits depuis ${visited.size} pages explorées sur ${urlInput}.` + (absPdfs.length === 0 ? " Aucun PDF trouvé sur ce site. Vérifiez l'URL ou essayez une profondeur plus grande." : "");

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

window.importRagMcCsv = async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const btnIcon = e.target.nextElementSibling;
  const oldIcon = btnIcon.innerText;
  btnIcon.innerText = 'hourglass_empty';

  try {
    const text = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = ev => resolve(ev.target.result);
      reader.onerror = reject;
      // Force ansi/utf-8 compatibility since standard users use Excel French
      reader.readAsText(file, 'windows-1252'); // very common for French Excel CSV exports
    });

    // In case it was actually utf-8, windows-1252 could mess up accents.
    // A more thorough solution exists but for now it helps with Excel.
    
    const lines = text.split('\n').filter(l => l.trim() !== '');
    if (lines.length < 2) throw new Error("Le fichier est vide ou manque d'en-tête (au moins 2 lignes).");

    const entities = new Set();
    
    for(let i = 1; i < lines.length; i++) {
        // Split by , or ;
        const cells = lines[i].split(/[,;]/).map(c => c.trim().replace(/^["']|["']$/g, ''));
        
        cells.forEach(c => {
            if(c.length > 2 && !c.match(/^[0-9]+$/)) entities.add(c);
            // Also keep standard phone formats
            if(c.match(/^(?:(?:\+|00)33[\s.-]{0,3}(?:\(0\)[\s.-]{0,3})?|0)[1-9](?:(?:[\s.-]?\d{2}){4}|\d{2}(?:[\s.-]?\d{3}){2})$/)) entities.add(c);
        });

        // Often name/surname are in col 0 and 1
        if (cells.length >= 2 && cells[0].length > 1 && cells[1].length > 1) {
             entities.add(`${cells[0]} ${cells[1]}`);
             entities.add(`${cells[1]} ${cells[0]}`); // Reverse order
        }
    }

    const currentMcBox = document.getElementById('rag_mc');
    const existing = currentMcBox.value.split(',').map(x => x.trim()).filter(Boolean);
    const finalSet = new Set([...existing, ...entities]);
    currentMcBox.value = Array.from(finalSet).join(', ');

    alert(`Succès ! ${entities.size} entités ou combinaisons identifiées et ajoutées à la liste. N'oubliez pas de sauvegarder.`);

  } catch (err) {
    console.error(err);
    alert("Erreur de lecture CSV : " + err.message);
  } finally {
    btnIcon.innerText = oldIcon;
    e.target.value = '';
  }
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

window.handleRagSelection = (e) => {
   const textarea = e.target;
   const start = textarea.selectionStart;
   const end = textarea.selectionEnd;
   if (start !== end) {
       const selectedText = textarea.value.substring(start, end).trim();
       if (selectedText.length > 2) {
           window._ragSelectionTemp = selectedText;
           const popup = document.getElementById('rag_selection_popup');
           popup.style.display = 'block';
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

  const getFakeFor = (realStr, type, forcedFake = null) => {
    if (!realStr || realStr.length < 2) return realStr;
    if (map[realStr]) return map[realStr];
    
    if (forcedFake) {
       map[realStr] = forcedFake;
       return forcedFake;
    }

    let fake = "";
    if (type === 'Person') fake = window.faker.person.fullName();
    else if (type === 'Place') fake = window.faker.location.city();
    else if (type === 'Organization') fake = window.faker.company.name();
    else if (type === 'Email') fake = window.faker.internet.email();
    else if (type === 'Phone') {
        const randPhone = "06" + Math.floor(10000000 + Math.random() * 90000000);
        fake = randPhone;
    } else fake = window.faker.word.noun();

    map[realStr] = fake;
    return fake;
  };

  // 1. Mandatory Entités (Reverse engineering multi-words for double-sided matching)
  mandatoryEntities.forEach(ent => {
    const fake = getFakeFor(ent, 'Person'); // Use person as default for mandatory to have clean names
    const parts = ent.split(/[\s-]/).filter(Boolean);
    if (parts.length === 2) {
       // Si 2 parties, génère aussi l'inverse (ex: "DUPONT Jean" pour "Jean DUPONT")
       const reverseReal = parts[1] + ' ' + parts[0];
       // On assigne le MÊME fake pour l'inverse !
       const fakeParts = fake.split(/\s/);
       if (fakeParts.length >= 2) {
           const reverseFake = fakeParts[1] + ' ' + fakeParts[0];
           getFakeFor(reverseReal, 'Person', reverseFake);
       } else {
           getFakeFor(reverseReal, 'Person', fake);
       }
    }
  });

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
    const regex = new RegExp(`\\b${escapeRegExp(real)}\\b`, 'g'); // Mots entiers
    newText = newText.replace(regex, fake);
    // Remove split-join fallback which can cause horrible corruptions on partially matched strings,
    // regex \b handles words properly. If it fails, users can use forced csv lists.
    // If we wanted to keep split/join we would only do it for pure punctuation-less strings
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

