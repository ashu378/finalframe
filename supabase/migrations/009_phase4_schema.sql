-- Phase 4: Editor & AI Remix Schema

-- 1. Enums for Strict Typing
CREATE TYPE remix_status AS ENUM ('queued', 'processing', 'completed', 'failed');
CREATE TYPE remix_layer_type AS ENUM ('background', 'text', 'motion', 'actor', 'audio', 'overlay');
CREATE TYPE remix_operation AS ENUM ('text_change', 'color_change', 'motion_change', 'asset_replace', 'audio_adjust');

-- 2. Add Remix Lock to Render Jobs (Concurrency Guard)
ALTER TABLE render_jobs 
ADD COLUMN remix_locked BOOLEAN DEFAULT FALSE;

COMMENT ON COLUMN render_jobs.remix_locked IS 'If true, a remix operation is in progress for this render job.';

-- 3. Render Layers (Versioning of components)
CREATE TABLE render_layers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
    render_job_id UUID REFERENCES render_jobs(id) ON DELETE CASCADE,
    
    layer_type remix_layer_type NOT NULL,
    asset_url TEXT NOT NULL,
    metadata JSONB DEFAULT '{}'::jsonb, -- Stores prompt used, model info, etc.
    
    is_original BOOLEAN DEFAULT FALSE, -- True if this was part of the initial render
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS: Render Layers
ALTER TABLE render_layers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view layers of their projects" ON render_layers
    FOR SELECT USING (
        project_id IN (
            SELECT id FROM projects 
            WHERE studio_id IN (SELECT id FROM studios WHERE user_id = auth.uid())
        )
    );

CREATE POLICY "Users can insert layers to their projects" ON render_layers
    FOR INSERT WITH CHECK (
        project_id IN (
            SELECT id FROM projects 
            WHERE studio_id IN (SELECT id FROM studios WHERE user_id = auth.uid())
        )
    );

-- 4. Remix Jobs (Requests)
CREATE TABLE remix_jobs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
    render_job_id UUID REFERENCES render_jobs(id) ON DELETE CASCADE,
    
    status remix_status DEFAULT 'queued',
    
    intent TEXT NOT NULL, -- Original user query e.g. "Make background blue"
    
    -- Strict Enums for Intent
    target_layer remix_layer_type NOT NULL,
    operation remix_operation NOT NULL,
    parameters JSONB NOT NULL, -- Extracted structured params
    
    ai_models_used JSONB DEFAULT '{}'::jsonb,
    cost_credits INTEGER DEFAULT 0,
    error_message TEXT,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);

-- RLS: Remix Jobs
ALTER TABLE remix_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view remix jobs of their projects" ON remix_jobs
    FOR SELECT USING (
        project_id IN (
            SELECT id FROM projects 
            WHERE studio_id IN (SELECT id FROM studios WHERE user_id = auth.uid())
        )
    );

CREATE POLICY "Users can insert remix jobs to their projects" ON remix_jobs
    FOR INSERT WITH CHECK (
        project_id IN (
            SELECT id FROM projects 
            WHERE studio_id IN (SELECT id FROM studios WHERE user_id = auth.uid())
        )
    );
    
CREATE POLICY "Users can update remix jobs of their projects" ON remix_jobs
    FOR UPDATE USING (
        project_id IN (
            SELECT id FROM projects 
            WHERE studio_id IN (SELECT id FROM studios WHERE user_id = auth.uid())
        )
    );

-- 5. Layer Diffs (Audit specific changes)
CREATE TABLE layer_diffs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    remix_job_id UUID REFERENCES remix_jobs(id) ON DELETE CASCADE,
    original_layer_id UUID REFERENCES render_layers(id),
    new_layer_id UUID REFERENCES render_layers(id),
    diff_description TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS: Layer Diffs (Inherit from Remix Job -> Project)
ALTER TABLE layer_diffs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view layer diffs via project" ON layer_diffs
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM remix_jobs 
            WHERE remix_jobs.id = layer_diffs.remix_job_id 
            AND remix_jobs.project_id IN (
                SELECT id FROM projects 
                WHERE studio_id IN (SELECT id FROM studios WHERE user_id = auth.uid())
            )
        )
    );
    
-- 6. Render Snapshots (Version History)
CREATE TABLE render_snapshots (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
    render_job_id UUID REFERENCES render_jobs(id) ON DELETE CASCADE,
    
    label TEXT, -- Optional user label e.g. "Blue Version"
    layer_manifest JSONB NOT NULL, -- Map of { [type]: layer_id }
    
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS: Render Snapshots
ALTER TABLE render_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view snapshots of their projects" ON render_snapshots
    FOR SELECT USING (
        project_id IN (
            SELECT id FROM projects 
            WHERE studio_id IN (SELECT id FROM studios WHERE user_id = auth.uid())
        )
    );

CREATE POLICY "Users can manage snapshots of their projects" ON render_snapshots
    FOR ALL USING (
        project_id IN (
            SELECT id FROM projects 
            WHERE studio_id IN (SELECT id FROM studios WHERE user_id = auth.uid())
        )
    );
