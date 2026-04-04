-- Migration: Configuration RBAC Dynamique

CREATE TABLE IF NOT EXISTS public.collectivity_roles_config (
    collectivite_id TEXT PRIMARY KEY,
    permissions JSONB NOT NULL DEFAULT '{}'::jsonb,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE public.collectivity_roles_config ENABLE ROW LEVEL SECURITY;

-- Les utilisateurs peuvent lire la configuration de leur propre collectivité
CREATE POLICY "Users can read own collectivity config" ON public.collectivity_roles_config
    FOR SELECT USING (
        collectivite_id = (SELECT collectivite_id FROM public.profiles WHERE profiles.id = auth.uid())
        OR 
        (SELECT role FROM public.profiles WHERE profiles.id = auth.uid()) = 'superadmin'
    );

-- Seuls les administrateurs et superadmins peuvent modifier la config
CREATE POLICY "Admins and SuperAdmins can write config" ON public.collectivity_roles_config
    FOR ALL USING (
        (SELECT role FROM public.profiles WHERE profiles.id = auth.uid()) = 'superadmin'
        OR
        (
            (SELECT role FROM public.profiles WHERE profiles.id = auth.uid()) = 'admin'
            AND 
            collectivite_id = (SELECT collectivite_id FROM public.profiles WHERE profiles.id = auth.uid())
        )
    );
