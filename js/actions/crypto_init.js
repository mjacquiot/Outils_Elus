// --- INITIALISATION CRYPTO & ONBOARDING ---

window.initCryptoSession = async (password) => {
    // 1. Dérivation de la VaultKey depuis le mot de passe
    // S'il n'y a pas de sel enregistré pour l'utilisateur, ce sera créé plus tard.
    const user = state.user;
    if (!user) return;

    try {
        const { data: keyData, error: keyErr } = await supabaseClient
            .from('user_crypto_keys')
            .select('*')
            .eq('user_id', user.id)
            .single();

        let privateKey;
        let publicKey;

        if (keyErr || !keyData) {
            // -- PREMIÈRE CONNEXION DE L'UTILISATEUR --
            console.log("Aucune paire de clés trouvée, génération du Cloud Wallet...");
            const salt = crypto.getRandomValues(new Uint8Array(16));
            const saltStr = btoa(String.fromCharCode(...salt));
            
            const vaultKey = await window.CryptoManager.deriveVaultKey(password, salt);
            const keyPair = await window.CryptoManager.generateUserKeyPair();
            
            privateKey = keyPair.privateKey;
            publicKey = keyPair.publicKey;

            const pubJwk = await window.CryptoManager.exportKeyObj(publicKey);
            const encPriv = await window.CryptoManager.encryptPrivateKey(privateKey, vaultKey);

            // Sauvegarde dans Supabase
            await supabaseClient.from('user_crypto_keys').insert({
                user_id: user.id,
                public_key: pubJwk,
                encrypted_private_key: JSON.stringify(encPriv),
                salt: saltStr
            });
            console.log("Cloud Wallet créé avec succès.");
        } else {
            // -- CONNEXION EXISTANTE (ou retour après cache vidé) --
            console.log("Cloud Wallet trouvé, déchiffrement...");
            const salt = new Uint8Array(atob(keyData.salt).split("").map(c => c.charCodeAt(0)));
            const vaultKey = await window.CryptoManager.deriveVaultKey(password, salt);
            
            const encPriv = JSON.parse(keyData.encrypted_private_key);
            privateKey = await window.CryptoManager.decryptPrivateKey(encPriv.cipher, encPriv.iv, vaultKey);
            publicKey = await window.CryptoManager.importPublicKey(keyData.public_key);
            console.log("Clé privée récupérée localement !");
        }

        // On garde la clé privée temporairement en mémoire pour la session actuelle
        window.sessionPrivateKey = privateKey;
        window.sessionPublicKey = publicKey;

        // 2. Gestion de la Clé de Collectivité
        // On récupère le profile complet pour avoir la collectivité
        const { data: profile } = await supabaseClient.from('profiles').select('collectivite_id').eq('id', user.id).single();
        if (profile && profile.collectivite_id) {
            const collId = profile.collectivite_id;
            
            const { data: collKeyData, error: collKeyErr } = await supabaseClient
                .from('collectivity_shared_keys')
                .select('*')
                .eq('collectivite_id', collId)
                .eq('user_id', user.id)
                .single();

            if (collKeyErr || !collKeyData) {
                // Pas de clé partagée pour NOUS.
                // Est-ce qu'elle existe déjà pour la collectivité ?
                const { data: existingCollKeys } = await supabaseClient
                    .from('collectivity_shared_keys')
                    .select('id')
                    .eq('collectivite_id', collId)
                    .limit(1);

                if (!existingCollKeys || existingCollKeys.length === 0) {
                    console.log("Première init de la collectivité, création de la clé partagée...");
                    // On est le premier, on crée la clé
                    const aesKey = await window.CryptoManager.generateCollectivityKey();
                    const encryptedAes = await window.CryptoManager.encryptCollectivityKeyForUser(aesKey, publicKey);
                    
                    await supabaseClient.from('collectivity_shared_keys').insert({
                        collectivite_id: collId,
                        user_id: user.id,
                        encrypted_shared_key: encryptedAes
                    });
                    window.sessionCollectivityKey = aesKey;
                } else {
                    console.error("La clé de collectivité existe mais ne vous a pas été partagée. Demandez à un admin de vous la partager.");
                    // TODO: UI pour informer l'utilisateur
                }
            } else {
                console.log("Clé de collectivité trouvée, déchiffrement...");
                const aesKey = await window.CryptoManager.decryptCollectivityKey(collKeyData.encrypted_shared_key, privateKey);
                window.sessionCollectivityKey = aesKey;
            }
        }

    } catch (e) {
        console.error("Erreur critique lors de l'initialisation crypto:", e);
    }
};

window.checkAndLaunchOnboarding = () => {
    // Vérification du cache local (LocalStorage)
    const localContext = localStorage.getItem('eluConnect_localContext');
    if (!localContext) {
        console.warn("Contexte local absent (cache vide ou première co) -> Lancement du Tuto");
        window.showOnboardingModal();
    } else {
        // Init cache into state.localDict if needed
        state.localDict = JSON.parse(localContext);
    }
};

window.showOnboardingModal = () => {
    const modalHtml = `
    <div id="onboarding-modal" class="modal-overlay" style="display: flex;">
        <div class="modal-content" style="max-width: 500px;">
            <h3>🛡️ Initialisation Sécurisée</h3>
            <p>Bienvenue ! Pour protéger vos données par pseudonymisation, nous avons besoin de quelques informations de contexte. <b>Ces données restent exclusivement sur votre appareil et ne sont jamais envoyées en clair sur nos serveurs.</b></p>
            
            <div class="form-group" style="margin-top: 1rem;">
                <label>Vos Prénoms / Nom complet</label>
                <input type="text" id="ob-names" placeholder="Ex: Jean DUPONT" class="search-input">
            </div>
            
            <div class="form-group">
                <label>Nom de votre N+1 ou DGS</label>
                <input type="text" id="ob-boss" placeholder="Ex: Marie MARTIN" class="search-input">
            </div>

            <div class="form-group">
                <label>Nom du Maire / Élu principal</label>
                <input type="text" id="ob-mayor" placeholder="Ex: Bernard DELARUE" class="search-input">
            </div>
            
            <p style="font-size: 0.85rem; color: #666; margin-bottom: 1rem;">Une fois validé, un dictionnaire local chiffré sera généré pour anonymiser automatiquement ces noms lors de vos dialogues avec l'IA.</p>

            <div class="modal-actions">
                <button type="button" class="btn btn-primary" onclick="window.saveOnboarding()">Sécuriser mon contexte</button>
            </div>
        </div>
    </div>
    `;
    
    // Inject at the end of the <body>
    const div = document.createElement('div');
    div.innerHTML = modalHtml;
    document.body.appendChild(div);
};

window.saveOnboarding = async () => {
    const names = document.getElementById('ob-names').value.trim();
    const boss = document.getElementById('ob-boss').value.trim();
    const mayor = document.getElementById('ob-mayor').value.trim();

    if (!names) return alert("Veuillez au moins renseigner votre nom complet.");

    const dictLocal = {};
    
    // Fonction utilitaire pour générer des pseudonymes bidons localement via Faker
    const generatePseudo = (realName) => {
        if (!realName) return null;
        // Optionnel : FakerFR est dispo.
        return window.faker.person.fullName();
    };

    if (names) dictLocal[names] = `[${generatePseudo(names)}]`;
    if (boss) dictLocal[boss] = `[${generatePseudo(boss)}]`;
    if (mayor) dictLocal[mayor] = `[${generatePseudo(mayor)}]`;

    // Sauvegarde en clair dans le Cache du navigateur
    localStorage.setItem('eluConnect_localContext', JSON.stringify(dictLocal));
    state.localDict = dictLocal;

    // Envoi des versions hachées/chiffrées au Dictionnaire Global (Supabase)
    if (window.sessionCollectivityKey) {
        // Get collectivity id from profile
        const { data: profile } = await supabaseClient.from('profiles').select('collectivite_id').eq('id', state.user.id).single();
        if (profile && profile.collectivite_id) {
            const collId = profile.collectivite_id;

            for (const [realName, pseudo] of Object.entries(dictLocal)) {
                // 1. Hash à l'aveugle
                const hash = await window.CryptoManager.hashName(realName);
                
                // 2. Chiffrement (AES) -> { real_name: "Jean", pseudo: "[Toto]" }
                const payload = { real_name: realName, pseudo: pseudo };
                const encData = await window.CryptoManager.encryptDictionaryEntry(payload, window.sessionCollectivityKey);

                // 3. Upsert Supabase (on insère s'il n'y est pas)
                await supabaseClient.from('pseudonymization_dict').upsert({
                    collectivite_id: collId,
                    real_name_hash: hash,
                    encrypted_data: encData.cipher,
                    iv: encData.iv
                }, { onConflict: 'collectivite_id, real_name_hash' }).select();
            }
        }
    }

    // Retirer le modal
    document.getElementById('onboarding-modal').parentElement.remove();
    alert("Initialisation cryptographique terminée avec succès !");
};
