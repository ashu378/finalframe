-- Phase 2: Projects Table Migration
-- Reference: MASTER_PRD.md § 4 — Required user information
-- Reference: BUILD_PHASES.md — Phase 2 Project Creation

-- Projects table stores video projects with inherited studio defaults
CREATE TABLE IF NOT EXISTS projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Foreign key to studios table
    -- Reference: MASTER_PRD.md § 6 — Each project must belong to a studio
    studio_id UUID NOT NULL REFERENCES studios(id) ON DELETE CASCADE,
    
    -- Project name
    name TEXT NOT NULL,
    
    -- Project state machine
    -- Reference: MASTER_PRD.md § 8 — Strict state machine
    -- Valid states: draft → blueprint_ready → approved → rendering → rendered → exported → archived
    state TEXT NOT NULL DEFAULT 'draft' CHECK (
        state IN ('draft', 'blueprint_ready', 'approved', 'rendering', 'rendered', 'exported', 'archived')
    ),
    
    -- Inherited from studio_defaults at creation time
    -- Reference: MASTER_PRD.md § 4.1
    outcome_goal TEXT CHECK (
        outcome_goal IS NULL OR 
        outcome_goal IN ('get_attention', 'explain_value', 'convert_sales', 'go_viral', 'build_authority')
    ),
    
    -- Reference: MASTER_PRD.md § 4.2
    platform TEXT CHECK (
        platform IS NULL OR 
        platform IN ('x_twitter', 'tiktok_reels', 'youtube', 'website_landing')
    ),
    
    context TEXT CHECK (
        context IS NULL OR 
        context IN ('organic_post', 'paid_ad', 'product_launch', 'profile_header', 'pitch_loop')
    ),
    
    -- Reference: MASTER_PRD.md § 4.4
    identity_presence TEXT CHECK (
        identity_presence IS NULL OR 
        identity_presence IN ('self', 'ai_actor', 'no_people')
    ),
    
    -- Actor ID (locked at project level)
    -- Reference: MASTER_PRD.md § 4.4 — Actor ID is locked and immutable per project
    actor_id TEXT,
    
    -- Whether actor identity has been locked
    -- Reference: BUILD_PHASES.md Phase 2 — Actor lock enforcement
    actor_locked BOOLEAN NOT NULL DEFAULT false,
    
    -- Snapshot of Creative DNA at project creation
    -- Reference: MASTER_PRD.md § 4.3 — Set once, reused everywhere
    creative_dna_snapshot JSONB,
    
    -- Snapshot of Message Blocks at project creation
    -- Reference: MASTER_PRD.md § 4.6
    message_blocks_snapshot JSONB,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_projects_studio_id ON projects(studio_id);
CREATE INDEX IF NOT EXISTS idx_projects_state ON projects(state);

-- Row Level Security
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;

-- Users can only access projects belonging to their studio
DROP POLICY IF EXISTS "Users can view own studio projects" ON projects;
CREATE POLICY "Users can view own studio projects" ON projects
    FOR SELECT USING (
        studio_id IN (
            SELECT id FROM studios WHERE user_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS "Users can insert own studio projects" ON projects;
CREATE POLICY "Users can insert own studio projects" ON projects
    FOR INSERT WITH CHECK (
        studio_id IN (
            SELECT id FROM studios WHERE user_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS "Users can update own studio projects" ON projects;
CREATE POLICY "Users can update own studio projects" ON projects
    FOR UPDATE USING (
        studio_id IN (
            SELECT id FROM studios WHERE user_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS "Users can delete own studio projects" ON projects;
CREATE POLICY "Users can delete own studio projects" ON projects
    FOR DELETE USING (
        studio_id IN (
            SELECT id FROM studios WHERE user_id = auth.uid()
        )
    );

-- Trigger to update updated_at on row changes
CREATE OR REPLACE FUNCTION update_projects_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_projects_updated_at
    BEFORE UPDATE ON projects
    FOR EACH ROW
    EXECUTE FUNCTION update_projects_updated_at();
