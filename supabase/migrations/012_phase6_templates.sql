-- Migration 012: Phase 6 Templates

-- 1. Create Template Category Enum
CREATE TYPE template_category AS ENUM ('social_ad', 'explainer', 'ugc', 'custom');

-- 2. Create Templates Table
CREATE TABLE templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    studio_id UUID REFERENCES studios(id), -- Null for system templates
    name TEXT NOT NULL,
    description TEXT,
    thumbnail_url TEXT,
    blueprint_data JSONB NOT NULL, -- Stores the project snapshot (layers, script, etc.)
    category template_category NOT NULL DEFAULT 'custom',
    is_public BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Indexes
CREATE INDEX idx_templates_studio_id ON templates(studio_id);
CREATE INDEX idx_templates_category ON templates(category);
CREATE INDEX idx_templates_is_public ON templates(is_public);

-- 4. RLS Policies
ALTER TABLE templates ENABLE ROW LEVEL SECURITY;

-- Everyone can view public templates
CREATE POLICY "Users can view public templates" ON templates
    FOR SELECT
    USING (is_public = true);

-- Users can view their own studio templates
CREATE POLICY "Users can view own studio templates" ON templates
    FOR SELECT
    USING (studio_id IN (
        SELECT id FROM studios WHERE user_id = auth.uid()
    ));

-- Users can insert templates into their studio
CREATE POLICY "Users can create studio templates" ON templates
    FOR INSERT
    WITH CHECK (studio_id IN (
        SELECT id FROM studios WHERE user_id = auth.uid()
    ));

-- Users can delete their own studio templates
CREATE POLICY "Users can delete own studio templates" ON templates
    FOR DELETE
    USING (studio_id IN (
        SELECT id FROM studios WHERE user_id = auth.uid()
    ));
