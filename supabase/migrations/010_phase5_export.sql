-- Phase 5 Export Schema

-- 1. Add Credits to Studios
ALTER TABLE studios
ADD COLUMN credits INTEGER NOT NULL DEFAULT 100;

-- 2. Create Credit Ledger (Audit Trail)
CREATE TABLE credit_ledger (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    studio_id UUID NOT NULL REFERENCES studios(id) ON DELETE CASCADE,
    delta INTEGER NOT NULL, -- Negative for spend, positive for refund/grant
    reason TEXT NOT NULL,
    reference_id UUID, -- Optional link to export_job or other entity
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Index for faster balance history lookups
CREATE INDEX idx_credit_ledger_studio_id ON credit_ledger(studio_id);

-- 3. Add Validation Flag to Snapshots
ALTER TABLE render_snapshots
ADD COLUMN is_validated BOOLEAN NOT NULL DEFAULT TRUE;

-- 4. Create Export Jobs Table
CREATE TYPE export_platform AS ENUM ('tiktok', 'reels', 'youtube', 'twitter', 'linkedin');
CREATE TYPE export_resolution AS ENUM ('720p', '1080p', '4k');
CREATE TYPE export_status AS ENUM ('queued', 'processing', 'completed', 'failed');

CREATE TABLE export_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    render_snapshot_id UUID NOT NULL REFERENCES render_snapshots(id),
    platform export_platform NOT NULL,
    resolution export_resolution NOT NULL,
    status export_status NOT NULL DEFAULT 'queued',
    output_url TEXT, -- Populated on completion
    credits_deducted INTEGER NOT NULL, -- Stored for potential refunds
    error_message TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- RLS Policies

-- Credit Ledger: View own ledger
ALTER TABLE credit_ledger ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own studio ledger" ON credit_ledger
    FOR SELECT
    USING (
        exists (
            select 1 from studios
            where studios.id = credit_ledger.studio_id
            and studios.user_id = auth.uid()
        )
    );

-- Export Jobs: View own project export jobs
ALTER TABLE export_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own project export jobs" ON export_jobs
    FOR SELECT
    USING (
        exists (
            select 1 from projects
            where projects.id = export_jobs.project_id
            and projects.studio_id in (
                select id from studios where user_id = auth.uid()
            )
        )
    );

CREATE POLICY "Users can create export jobs for own projects" ON export_jobs
    FOR INSERT
    WITH CHECK (
        exists (
            select 1 from projects
            where projects.id = export_jobs.project_id
            and projects.studio_id in (
                select id from studios where user_id = auth.uid()
            )
        )
    );
