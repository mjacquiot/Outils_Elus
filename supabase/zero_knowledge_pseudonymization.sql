-- Migration: Zero-Knowledge Pseudonymization Schema

-- Table 1 : Les clés asymétriques des utilisateurs (Cloud Wallet)
CREATE TABLE IF NOT EXISTS public.user_crypto_keys (
    user_id UUID REFERENCES auth.users(id) PRIMARY KEY,
    public_key TEXT NOT NULL,
    encrypted_private_key TEXT NOT NULL,
    salt TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
ALTER TABLE public.user_crypto_keys ENABLE ROW LEVEL SECURITY;

-- Politique : L'utilisateur ne peut lire, insérer et mettre à jour que sa propre clé
CREATE POLICY "Users can manage their own crypto keys" ON public.user_crypto_keys
    FOR ALL USING (auth.uid() = user_id);

-- Table 2 : La "Clé de Collectivité" partagée chiffrée
CREATE TABLE IF NOT EXISTS public.collectivity_shared_keys (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    collectivite_id TEXT NOT NULL,
    user_id UUID REFERENCES auth.users(id),
    encrypted_shared_key TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(collectivite_id, user_id)
);
ALTER TABLE public.collectivity_shared_keys ENABLE ROW LEVEL SECURITY;

-- Politique : Seuls les membres de la collectivité peuvent accéder aux clés partagées.
-- (Assumant l'existence d'une table profiles ou que l'auth.jwt contient collectivite_id)
CREATE POLICY "Users can access collectivity shared keys" ON public.collectivity_shared_keys
    FOR ALL USING (
       (SELECT collectivite_id FROM public.profiles WHERE profiles.id = auth.uid()) = collectivite_id
    );

-- Table 3 : Le Dictionnaire de pseudonymisation
CREATE TABLE IF NOT EXISTS public.pseudonymization_dict (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    collectivite_id TEXT NOT NULL,
    real_name_hash TEXT NOT NULL,
    encrypted_data TEXT NOT NULL,
    iv TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
ALTER TABLE public.pseudonymization_dict ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can access their collectivity dictionary" ON public.pseudonymization_dict
    FOR ALL USING (
       (SELECT collectivite_id FROM public.profiles WHERE profiles.id = auth.uid()) = collectivite_id
    );

-- Index pour la recherche rapide
CREATE INDEX IF NOT EXISTS idx_pseudo_dict_hash ON public.pseudonymization_dict(collectivite_id, real_name_hash);
