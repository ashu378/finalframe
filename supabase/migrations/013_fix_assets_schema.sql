-- Migration 013: Fix Phase 6 Schema Mismatches

-- 1. Reset Studio Assets
DROP TABLE IF EXISTS studio_assets CASCADE;

-- Re-create Asset Type if not exists
DO $$ BEGIN
    CREATE TYPE asset_type AS ENUM ('image', 'video', 'audio');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

CREATE TABLE studio_assets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    studio_id UUID NOT NULL REFERENCES studios(id),
    name TEXT NOT NULL,
    url TEXT NOT NULL,
    type asset_type NOT NULL,
    size BIGINT NOT NULL,
    mime_type TEXT,
    tags TEXT[] DEFAULT '{}',
    folder_path TEXT DEFAULT '/',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_studio_assets_studio_id ON studio_assets(studio_id);
CREATE INDEX idx_studio_assets_type ON studio_assets(type);

ALTER TABLE studio_assets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view assets in their studio" ON studio_assets
    FOR SELECT
    USING (studio_id IN (
        SELECT id FROM studios WHERE user_id = auth.uid()
    ));

CREATE POLICY "Users can insert assets into their studio" ON studio_assets
    FOR INSERT
    WITH CHECK (studio_id IN (
        SELECT id FROM studios WHERE user_id = auth.uid()
    ));

CREATE POLICY "Users can delete assets in their studio" ON studio_assets
    FOR DELETE
    USING (studio_id IN (
        SELECT id FROM studios WHERE user_id = auth.uid()
    ));
