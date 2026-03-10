-- Phase 3: Render Queue ("Magic Oven")
-- Reference: MASTER_PRD.md § 7 - AI Processing Pipeline

CREATE TYPE render_status AS ENUM ('queued', 'processing', 'completed', 'failed', 'cancelled');

CREATE TABLE IF NOT EXISTS render_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Link to project (Required)
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    
    -- Link to scene (Optional - if rendering specific scene)
    scene_id UUID REFERENCES scenes(id) ON DELETE SET NULL,
    
    -- Status tracking
    status render_status NOT NULL DEFAULT 'queued',
    
    -- Job inputs (snapshot of prompt, parameters, AI model used)
    input_params JSONB NOT NULL DEFAULT '{}'::jsonb,
    
    -- Job outputs (result URL, metadata, duration)
    output_result JSONB,
    
    -- Model Usage Tracking (Auditing Requirement)
    ai_model_used TEXT,
    ai_provider TEXT,
    cost_credits INTEGER DEFAULT 0,
    
    -- Error details
    error_message TEXT,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_render_jobs_project_id ON render_jobs(project_id);
CREATE INDEX IF NOT EXISTS idx_render_jobs_status ON render_jobs(status);

-- RLS
ALTER TABLE render_jobs ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view/manage jobs for their own projects
-- Use the optimized robust logic from 005 migration
CREATE POLICY "Users can view own render jobs" ON render_jobs
    FOR SELECT USING (
        (SELECT user_id FROM studios WHERE id = (
            SELECT studio_id FROM projects WHERE id = render_jobs.project_id
        )) = auth.uid()
    );

CREATE POLICY "Users can insert own render jobs" ON render_jobs
    FOR INSERT WITH CHECK (
        (SELECT user_id FROM studios WHERE id = (
            SELECT studio_id FROM projects WHERE id = render_jobs.project_id
        )) = auth.uid()
    );

CREATE POLICY "Users can update own render jobs" ON render_jobs
    FOR UPDATE USING (
        (SELECT user_id FROM studios WHERE id = (
            SELECT studio_id FROM projects WHERE id = render_jobs.project_id
        )) = auth.uid()
    );

-- Trigger for updated_at
CREATE TRIGGER trigger_render_jobs_updated_at
    BEFORE UPDATE ON render_jobs
    FOR EACH ROW
    EXECUTE FUNCTION update_projects_updated_at(); -- Reusing existing function name if generic, or create new one
