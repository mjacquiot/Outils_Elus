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
