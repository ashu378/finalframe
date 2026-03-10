-- Phase 2: Scenes Table Migration
-- Reference: MASTER_PRD.md § 5.II.Creative Studio — AI Director Blueprint
-- Reference: BUILD_PHASES.md — Phase 2 Scene-by-scene editor

-- Scenes table stores individual scenes within a project blueprint
CREATE TABLE IF NOT EXISTS scenes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Foreign key to projects table
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    
    -- Scene order within the project
    -- Reference: BUILD_PHASES.md Phase 2 — Scene reordering
    order_index INTEGER NOT NULL DEFAULT 0,
    
    -- Scene intent/goal
    -- Reference: MASTER_PRD.md § 5.II — Each scene has intent/goal
    scene_goal TEXT NOT NULL,
    
    -- Scene text content
    -- Reference: MASTER_PRD.md § 5.II — Text content (no media in Phase 2)
    scene_text TEXT NOT NULL,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_scenes_project_id ON scenes(project_id);
CREATE INDEX IF NOT EXISTS idx_scenes_order ON scenes(project_id, order_index);

-- Row Level Security
ALTER TABLE scenes ENABLE ROW LEVEL SECURITY;

-- Users can only access scenes belonging to projects in their studio
DROP POLICY IF EXISTS "Users can view own project scenes" ON scenes;
CREATE POLICY "Users can view own project scenes" ON scenes
    FOR SELECT USING (
        project_id IN (
            SELECT p.id FROM projects p
            JOIN studios s ON p.studio_id = s.id
            WHERE s.user_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS "Users can insert own project scenes" ON scenes;
CREATE POLICY "Users can insert own project scenes" ON scenes
    FOR INSERT WITH CHECK (
        project_id IN (
            SELECT p.id FROM projects p
            JOIN studios s ON p.studio_id = s.id
            WHERE s.user_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS "Users can update own project scenes" ON scenes;
CREATE POLICY "Users can update own project scenes" ON scenes
    FOR UPDATE USING (
        project_id IN (
            SELECT p.id FROM projects p
            JOIN studios s ON p.studio_id = s.id
            WHERE s.user_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS "Users can delete own project scenes" ON scenes;
CREATE POLICY "Users can delete own project scenes" ON scenes
    FOR DELETE USING (
        project_id IN (
            SELECT p.id FROM projects p
            JOIN studios s ON p.studio_id = s.id
            WHERE s.user_id = auth.uid()
        )
    );

-- Trigger to update updated_at on row changes
CREATE OR REPLACE FUNCTION update_scenes_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_scenes_updated_at
    BEFORE UPDATE ON scenes
    FOR EACH ROW
    EXECUTE FUNCTION update_scenes_updated_at();
