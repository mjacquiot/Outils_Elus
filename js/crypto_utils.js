// --- MODULE DE SÉCURITÉ ZERO-KNOWLEDGE (WEB CRYPTO API) ---
window.CryptoManager = {
    // ---- 1. GESTION DU CLOUD WALLET (Clés asymétriques RSA protégées par mot de passe) ----
    
    // Génère une clé AES-GCM à partir du mot de passe de connexion
    // Utilisé pour chiffrer/déchiffrer la clé privée stockée sur Supabase
    deriveVaultKey: async (password, saltBuffer) => {
        const enc = new TextEncoder();
        const keyMaterial = await crypto.subtle.importKey(
            "raw", enc.encode(password), { name: "PBKDF2" }, false, ["deriveBits", "deriveKey"]
        );
        return await crypto.subtle.deriveKey(
            {
                name: "PBKDF2",
                salt: saltBuffer,
                iterations: 100000,
                hash: "SHA-256"
            },
            keyMaterial,
            { name: "AES-GCM", length: 256 },
            true,
            ["encrypt", "decrypt"]
        );
    },

    // Génère la paire de clés propre à l'utilisateur
    generateUserKeyPair: async () => {
        return await crypto.subtle.generateKey(
            {
                name: "RSA-OAEP",
                modulusLength: 2048,
                publicExponent: new Uint8Array([1, 0, 1]),
                hash: "SHA-256",
            },
            true, // extractable
            ["encrypt", "decrypt"]
        );
    },

    // Chiffre la clé privée avec la vaultKey (pour la sauvegarde Cloud Supabase)
    encryptPrivateKey: async (privateKey, vaultKey) => {
        const jwkStr = await CryptoManager.exportKeyObj(privateKey);
        const encodedData = new TextEncoder().encode(jwkStr);
        const iv = crypto.getRandomValues(new Uint8Array(12));
        const encrypted = await crypto.subtle.encrypt(
            { name: "AES-GCM", iv: iv }, vaultKey, encodedData
        );
        return {
            cipher: btoa(String.fromCharCode(...new Uint8Array(encrypted))),
            iv: btoa(String.fromCharCode(...iv))
        };
    },

    // Déchiffre la clé privée depuis le nuage vers l'appareil local
    decryptPrivateKey: async (cipherBase64, ivBase64, vaultKey) => {
        const cipherBuffer = new Uint8Array(atob(cipherBase64).split("").map(c => c.charCodeAt(0)));
        const ivBuffer = new Uint8Array(atob(ivBase64).split("").map(c => c.charCodeAt(0)));
        const decrypted = await crypto.subtle.decrypt(
            { name: "AES-GCM", iv: ivBuffer }, vaultKey, cipherBuffer
        );
        const jwkStr = new TextDecoder().decode(decrypted);
        return await CryptoManager.importPrivateKey(jwkStr);
    },

    // ---- 2. GESTION DE LA CLÉ DE COLLECTIVITÉ ----

    // Génère la clé de collectivité (Symmetric AES-GCM) partagée
    generateCollectivityKey: async () => {
        return await crypto.subtle.generateKey(
            { name: "AES-GCM", length: 256 },
            true,
            ["encrypt", "decrypt"]
        );
    },

    // Chiffre la Clé de Collectivité AES avec la Clé Publique RSA d'un utilisateur
    encryptCollectivityKeyForUser: async (aesKey, userPublicKey) => {
        const aesJwk = await crypto.subtle.exportKey("raw", aesKey);
        const encrypted = await crypto.subtle.encrypt(
            { name: "RSA-OAEP" },
            userPublicKey,
            aesJwk
        );
        return btoa(String.fromCharCode(...new Uint8Array(encrypted))); // Base64
    },

    // Déchiffre la Clé de Collectivité depuis Supabase avec la Clé Privée RSA locale
    decryptCollectivityKey: async (encryptedBase64, userPrivateKey) => {
        const encryptedBuffer = new Uint8Array(atob(encryptedBase64).split("").map(c => c.charCodeAt(0)));
        const decryptedRaw = await crypto.subtle.decrypt(
            { name: "RSA-OAEP" },
            userPrivateKey,
            encryptedBuffer
        );
        return await crypto.subtle.importKey("raw", decryptedRaw, { name: "AES-GCM" }, true, ["encrypt", "decrypt"]);
    },

    // ---- 3. GESTION DU DICTIONNAIRE ZERO-KNOWLEDGE ----

    encryptDictionaryEntry: async (dataObj, aesKey) => {
        const iv = crypto.getRandomValues(new Uint8Array(12));
        const encodedData = new TextEncoder().encode(JSON.stringify(dataObj));
        const encrypted = await crypto.subtle.encrypt(
            { name: "AES-GCM", iv: iv }, aesKey, encodedData
        );
        return {
            cipher: btoa(String.fromCharCode(...new Uint8Array(encrypted))),
            iv: btoa(String.fromCharCode(...iv))
        };
    },

    decryptDictionaryEntry: async (cipherBase64, ivBase64, aesKey) => {
        const cipherBuffer = new Uint8Array(atob(cipherBase64).split("").map(c => c.charCodeAt(0)));
        const ivBuffer = new Uint8Array(atob(ivBase64).split("").map(c => c.charCodeAt(0)));
        const decrypted = await crypto.subtle.decrypt(
            { name: "AES-GCM", iv: ivBuffer }, aesKey, cipherBuffer
        );
        return JSON.parse(new TextDecoder().decode(decrypted));
    },
    
    // Utilitaire Hash SHA-256 (Pour indexer le nom réel sur Supabase à l'aveugle sans révéler le vrai nom)
    hashName: async (name) => {
        const buffer = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(name.trim().toLowerCase()));
        return Array.from(new Uint8Array(buffer)).map(b => b.toString(16).padStart(2, '0')).join('');
    },

    // ---- UTILITAIRES D'IMPORT / EXPORT ----

    exportKeyObj: async (key) => {
        const format = key.type === "private" || key.type === "public" ? "jwk" : "raw";
        const exported = await crypto.subtle.exportKey(format, key);
        return format === "jwk" ? JSON.stringify(exported) : btoa(String.fromCharCode(...new Uint8Array(exported)));
    },

    importPublicKey: async (jwkStr) => {
        return await crypto.subtle.importKey(
            "jwk", JSON.parse(jwkStr), { name: "RSA-OAEP", hash: "SHA-256" }, true, ["encrypt"]
        );
    },
    
    importPrivateKey: async (jwkStr) => {
        return await crypto.subtle.importKey(
            "jwk", JSON.parse(jwkStr), { name: "RSA-OAEP", hash: "SHA-256" }, true, ["decrypt"]
        );
    },

    importAESKey: async (rawBase64) => {
         const buffer = new Uint8Array(atob(rawBase64).split("").map(c => c.charCodeAt(0)));
         return await crypto.subtle.importKey(
            "raw", buffer, { name: "AES-GCM" }, true, ["encrypt", "decrypt"]
        );
    }
};