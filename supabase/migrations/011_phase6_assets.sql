-- Migration 011: Phase 6 Asset Management

-- 1. Create Asset Type Enum
CREATE TYPE asset_type AS ENUM ('image', 'video', 'audio');

-- 2. Create Studio Assets Table
CREATE TABLE studio_assets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    studio_id UUID NOT NULL REFERENCES studios(id),
    name TEXT NOT NULL,
    url TEXT NOT NULL,
    type asset_type NOT NULL,
    size BIGINT NOT NULL, -- in bytes
    mime_type TEXT,
    tags TEXT[] DEFAULT '{}',
    folder_path TEXT DEFAULT '/',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Indexes
CREATE INDEX idx_studio_assets_studio_id ON studio_assets(studio_id);
CREATE INDEX idx_studio_assets_type ON studio_assets(type);

-- 4. RLS Policies (Assets)
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

-- Note: Actual File Storage policies for 'studio-assets' bucket 
-- are typically handled in the Storage API/Dashboard, but we can track metadata here.
