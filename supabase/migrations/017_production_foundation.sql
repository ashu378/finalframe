-- FinalFrame Production Foundation
-- Additive migration: preserves existing projects, scenes, render jobs, assets,
-- snapshots, exports, remixes, and credit ledger rows.

CREATE TABLE IF NOT EXISTS productions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL UNIQUE REFERENCES projects(id) ON DELETE CASCADE,
    workflow TEXT NOT NULL DEFAULT 'SOCIAL',
    requested_duration_seconds INTEGER NOT NULL DEFAULT 30 CHECK (requested_duration_seconds BETWEEN 1 AND 3600),
    language TEXT NOT NULL DEFAULT 'en',
    output_preset TEXT NOT NULL DEFAULT 'SOCIAL_VERTICAL',
    current_version_id UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS production_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    production_id UUID NOT NULL REFERENCES productions(id) ON DELETE CASCADE,
    version_number INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'DRAFT',
    source_plan_id UUID,
    approved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (production_id, version_number)
);

CREATE TABLE IF NOT EXISTS production_bibles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    production_version_id UUID NOT NULL UNIQUE REFERENCES production_versions(id) ON DELETE CASCADE,
    project_context JSONB NOT NULL DEFAULT '{}'::jsonb,
    characters JSONB NOT NULL DEFAULT '[]'::jsonb,
    locations JSONB NOT NULL DEFAULT '[]'::jsonb,
    products JSONB NOT NULL DEFAULT '[]'::jsonb,
    style JSONB NOT NULL DEFAULT '{}'::jsonb,
    story JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS director_plans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    production_id UUID NOT NULL REFERENCES productions(id) ON DELETE CASCADE,
    input JSONB NOT NULL DEFAULT '{}'::jsonb,
    plan JSONB NOT NULL DEFAULT '{}'::jsonb,
    estimate JSONB NOT NULL DEFAULT '{}'::jsonb,
    status TEXT NOT NULL DEFAULT 'DRAFT',
    questions JSONB NOT NULL DEFAULT '[]'::jsonb,
    approved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS production_sequences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    production_version_id UUID NOT NULL REFERENCES production_versions(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    order_index INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS production_scenes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sequence_id UUID NOT NULL REFERENCES production_sequences(id) ON DELETE CASCADE,
    legacy_scene_id UUID REFERENCES scenes(id) ON DELETE SET NULL,
    title TEXT NOT NULL,
    purpose TEXT NOT NULL DEFAULT '',
    visual_direction TEXT NOT NULL DEFAULT '',
    order_index INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS production_entities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    production_id UUID NOT NULL REFERENCES productions(id) ON DELETE CASCADE,
    entity_type TEXT NOT NULL CHECK (entity_type IN ('CHARACTER', 'LOCATION', 'PRODUCT', 'OBJECT', 'STYLE')),
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    continuity JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS production_assets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    production_id UUID NOT NULL REFERENCES productions(id) ON DELETE CASCADE,
    studio_asset_id UUID REFERENCES studio_assets(id) ON DELETE SET NULL,
    source TEXT NOT NULL DEFAULT 'USER_UPLOAD',
    roles TEXT[] NOT NULL DEFAULT '{}',
    intent TEXT,
    storage_path TEXT,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS production_shots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    scene_id UUID NOT NULL REFERENCES production_scenes(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    prompt TEXT NOT NULL DEFAULT '',
    duration_seconds NUMERIC(8,2) NOT NULL DEFAULT 4 CHECK (duration_seconds > 0),
    order_index INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'PLANNED',
    camera JSONB NOT NULL DEFAULT '{}'::jsonb,
    required_asset_ids UUID[] NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS shot_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    shot_id UUID NOT NULL REFERENCES production_shots(id) ON DELETE CASCADE,
    version_number INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'DRAFT',
    asset_id UUID REFERENCES production_assets(id) ON DELETE SET NULL,
    generation_job_id UUID,
    prompt_snapshot TEXT NOT NULL DEFAULT '',
    context_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (shot_id, version_number)
);

CREATE TABLE IF NOT EXISTS generation_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    production_id UUID NOT NULL REFERENCES productions(id) ON DELETE CASCADE,
    shot_id UUID REFERENCES production_shots(id) ON DELETE SET NULL,
    shot_version_id UUID REFERENCES shot_versions(id) ON DELETE SET NULL,
    modality TEXT NOT NULL,
    provider TEXT NOT NULL,
    model TEXT,
    provider_job_id TEXT,
    status TEXT NOT NULL DEFAULT 'QUEUED',
    request JSONB NOT NULL DEFAULT '{}'::jsonb,
    response JSONB,
    progress INTEGER NOT NULL DEFAULT 0 CHECK (progress BETWEEN 0 AND 100),
    estimated_cost INTEGER NOT NULL DEFAULT 0,
    actual_cost INTEGER,
    idempotency_key TEXT NOT NULL UNIQUE,
    attempt_count INTEGER NOT NULL DEFAULT 0,
    lease_owner TEXT,
    lease_expires_at TIMESTAMPTZ,
    error_code TEXT,
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE shot_versions
    ADD CONSTRAINT shot_versions_generation_job_fk
    FOREIGN KEY (generation_job_id) REFERENCES generation_jobs(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS price_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    operation TEXT NOT NULL,
    quality_tier TEXT NOT NULL DEFAULT 'STANDARD',
    provider TEXT,
    model TEXT,
    unit TEXT NOT NULL DEFAULT 'operation',
    credits_per_unit INTEGER NOT NULL CHECK (credits_per_unit >= 0),
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS credit_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    studio_id UUID NOT NULL REFERENCES studios(id) ON DELETE CASCADE,
    delta INTEGER NOT NULL,
    transaction_type TEXT NOT NULL,
    source TEXT NOT NULL DEFAULT 'SYSTEM',
    reference_id UUID,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS credit_reservations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    studio_id UUID NOT NULL REFERENCES studios(id) ON DELETE CASCADE,
    generation_job_id UUID REFERENCES generation_jobs(id) ON DELETE SET NULL,
    amount INTEGER NOT NULL CHECK (amount > 0),
    status TEXT NOT NULL DEFAULT 'RESERVED',
    idempotency_key TEXT NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    committed_at TIMESTAMPTZ,
    released_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS assembly_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    production_id UUID NOT NULL REFERENCES productions(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'QUEUED',
    manifest JSONB NOT NULL DEFAULT '{}'::jsonb,
    output_asset_id UUID REFERENCES production_assets(id) ON DELETE SET NULL,
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_productions_project_id ON productions(project_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_production_assets_unique_source ON production_assets(production_id, studio_asset_id) WHERE studio_asset_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_production_versions_production ON production_versions(production_id, version_number);
CREATE INDEX IF NOT EXISTS idx_sequences_version_order ON production_sequences(production_version_id, order_index);
CREATE INDEX IF NOT EXISTS idx_scenes_sequence_order ON production_scenes(sequence_id, order_index);
CREATE INDEX IF NOT EXISTS idx_shots_scene_order ON production_shots(scene_id, order_index);
CREATE INDEX IF NOT EXISTS idx_generation_jobs_status ON generation_jobs(status, lease_expires_at);
CREATE INDEX IF NOT EXISTS idx_generation_jobs_production ON generation_jobs(production_id);
CREATE INDEX IF NOT EXISTS idx_credit_transactions_studio ON credit_transactions(studio_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_credit_reservations_studio ON credit_reservations(studio_id, status);

ALTER TABLE productions ENABLE ROW LEVEL SECURITY;
ALTER TABLE production_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE production_bibles ENABLE ROW LEVEL SECURITY;
ALTER TABLE director_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE production_sequences ENABLE ROW LEVEL SECURITY;
ALTER TABLE production_scenes ENABLE ROW LEVEL SECURITY;
ALTER TABLE production_entities ENABLE ROW LEVEL SECURITY;
ALTER TABLE production_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE production_shots ENABLE ROW LEVEL SECURITY;
ALTER TABLE shot_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE generation_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE credit_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE credit_reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE assembly_jobs ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION finalframe_user_owns_project(p_project_id UUID)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT EXISTS (
        SELECT 1 FROM projects p
        JOIN studios s ON s.id = p.studio_id
        WHERE p.id = p_project_id AND s.user_id = auth.uid()
    );
$$;

CREATE OR REPLACE FUNCTION finalframe_user_owns_production(p_production_id UUID)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT EXISTS (
        SELECT 1 FROM productions pr
        JOIN projects p ON p.id = pr.project_id
        JOIN studios s ON s.id = p.studio_id
        WHERE pr.id = p_production_id AND s.user_id = auth.uid()
    );
$$;

CREATE POLICY "production_owner_select" ON productions FOR SELECT USING (finalframe_user_owns_project(project_id));
CREATE POLICY "production_owner_write" ON productions FOR ALL USING (finalframe_user_owns_project(project_id)) WITH CHECK (finalframe_user_owns_project(project_id));
CREATE POLICY "production_version_owner" ON production_versions FOR ALL USING (finalframe_user_owns_production(production_id)) WITH CHECK (finalframe_user_owns_production(production_id));
CREATE POLICY "production_bible_owner" ON production_bibles FOR ALL USING (EXISTS (SELECT 1 FROM production_versions v WHERE v.id = production_version_id AND finalframe_user_owns_production(v.production_id))) WITH CHECK (EXISTS (SELECT 1 FROM production_versions v WHERE v.id = production_version_id AND finalframe_user_owns_production(v.production_id)));
CREATE POLICY "director_plan_owner" ON director_plans FOR ALL USING (finalframe_user_owns_production(production_id)) WITH CHECK (finalframe_user_owns_production(production_id));
CREATE POLICY "sequence_owner" ON production_sequences FOR ALL USING (EXISTS (SELECT 1 FROM production_versions v WHERE v.id = production_version_id AND finalframe_user_owns_production(v.production_id))) WITH CHECK (EXISTS (SELECT 1 FROM production_versions v WHERE v.id = production_version_id AND finalframe_user_owns_production(v.production_id)));
CREATE POLICY "scene_owner" ON production_scenes FOR ALL USING (EXISTS (SELECT 1 FROM production_sequences q JOIN production_versions v ON v.id = q.production_version_id WHERE q.id = sequence_id AND finalframe_user_owns_production(v.production_id))) WITH CHECK (EXISTS (SELECT 1 FROM production_sequences q JOIN production_versions v ON v.id = q.production_version_id WHERE q.id = sequence_id AND finalframe_user_owns_production(v.production_id)));
CREATE POLICY "entity_owner" ON production_entities FOR ALL USING (finalframe_user_owns_production(production_id)) WITH CHECK (finalframe_user_owns_production(production_id));
CREATE POLICY "asset_owner" ON production_assets FOR ALL USING (finalframe_user_owns_production(production_id)) WITH CHECK (finalframe_user_owns_production(production_id));
CREATE POLICY "shot_owner" ON production_shots FOR ALL USING (EXISTS (SELECT 1 FROM production_scenes c JOIN production_sequences q ON q.id = c.sequence_id JOIN production_versions v ON v.id = q.production_version_id WHERE c.id = scene_id AND finalframe_user_owns_production(v.production_id))) WITH CHECK (EXISTS (SELECT 1 FROM production_scenes c JOIN production_sequences q ON q.id = c.sequence_id JOIN production_versions v ON v.id = q.production_version_id WHERE c.id = scene_id AND finalframe_user_owns_production(v.production_id)));
CREATE POLICY "shot_version_owner" ON shot_versions FOR ALL USING (EXISTS (SELECT 1 FROM production_shots s JOIN production_scenes c ON c.id = s.scene_id JOIN production_sequences q ON q.id = c.sequence_id JOIN production_versions v ON v.id = q.production_version_id WHERE s.id = shot_id AND finalframe_user_owns_production(v.production_id))) WITH CHECK (EXISTS (SELECT 1 FROM production_shots s JOIN production_scenes c ON c.id = s.scene_id JOIN production_sequences q ON q.id = c.sequence_id JOIN production_versions v ON v.id = q.production_version_id WHERE s.id = shot_id AND finalframe_user_owns_production(v.production_id)));
CREATE POLICY "generation_job_owner" ON generation_jobs FOR ALL USING (finalframe_user_owns_production(production_id)) WITH CHECK (finalframe_user_owns_production(production_id));
CREATE POLICY "credit_transaction_owner" ON credit_transactions FOR SELECT USING (EXISTS (SELECT 1 FROM studios s WHERE s.id = studio_id AND s.user_id = auth.uid()));
CREATE POLICY "credit_reservation_owner" ON credit_reservations FOR SELECT USING (EXISTS (SELECT 1 FROM studios s WHERE s.id = studio_id AND s.user_id = auth.uid()));
CREATE POLICY "assembly_owner" ON assembly_jobs FOR ALL USING (finalframe_user_owns_production(production_id)) WITH CHECK (finalframe_user_owns_production(production_id));

INSERT INTO price_rules (operation, quality_tier, provider, unit, credits_per_unit, metadata)
SELECT * FROM (VALUES
    ('PLAN', 'STANDARD', 'openrouter', 'request', 1, '{"configurable":true}'::jsonb),
    ('VIDEO', 'ECONOMY', 'runway', 'second', 8, '{"configurable":true}'::jsonb),
    ('VIDEO', 'STANDARD', 'runway', 'second', 16, '{"configurable":true}'::jsonb),
    ('VIDEO', 'PREMIUM', 'runway', 'second', 32, '{"configurable":true}'::jsonb),
    ('TRANSCRIPTION', 'STANDARD', 'openrouter', 'minute', 4, '{"configurable":true}'::jsonb),
    ('CAPTIONS', 'STANDARD', 'SYSTEM', 'production', 2, '{"configurable":true}'::jsonb),
    ('ASSEMBLY', 'STANDARD', 'SYSTEM', 'production', 3, '{"configurable":true}'::jsonb)
) AS defaults(operation, quality_tier, provider, unit, credits_per_unit, metadata)
WHERE NOT EXISTS (SELECT 1 FROM price_rules);

CREATE TABLE IF NOT EXISTS payment_purchases (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    studio_id UUID NOT NULL REFERENCES studios(id) ON DELETE CASCADE,
    provider TEXT NOT NULL,
    provider_checkout_id TEXT,
    provider_charge_id TEXT,
    amount NUMERIC(14,2) NOT NULL,
    currency TEXT NOT NULL,
    credits INTEGER NOT NULL CHECK (credits > 0),
    status TEXT NOT NULL DEFAULT 'PENDING',
    reference TEXT NOT NULL UNIQUE,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS payment_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider TEXT NOT NULL,
    provider_event_id TEXT NOT NULL,
    event_type TEXT NOT NULL,
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    processed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (provider, provider_event_id)
);

CREATE INDEX IF NOT EXISTS idx_payment_purchases_studio ON payment_purchases(studio_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payment_events_provider_event ON payment_events(provider, provider_event_id);

ALTER TABLE payment_purchases ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "payment_purchase_owner" ON payment_purchases FOR SELECT USING (EXISTS (SELECT 1 FROM studios s WHERE s.id = studio_id AND s.user_id = auth.uid()));
CREATE POLICY "payment_purchase_create" ON payment_purchases FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM studios s WHERE s.id = studio_id AND s.user_id = auth.uid()));
