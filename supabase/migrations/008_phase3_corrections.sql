-- Phase 3 Corrections: Auditability and Execution Guards
-- 1. Replace single ai_model_used with ai_models_used (JSONB) for multi-model audit
-- 2. Add execution_locked to projects for secondary safety guard

-- 1. Render Jobs: Upgrade audit column
ALTER TABLE render_jobs 
DROP COLUMN IF EXISTS ai_model_used;

ALTER TABLE render_jobs 
ADD COLUMN ai_models_used JSONB DEFAULT '{}'::jsonb;

-- 2. Projects: Add Execution Locked flag
ALTER TABLE projects
ADD COLUMN execution_locked BOOLEAN DEFAULT FALSE;

-- 3. Update RLS (Ensure read-only status policies respect this if needed, 
-- but existing policies rely on user_id, which is fine)
-- We might want to ensure 'execution_locked' can only be set by system/actions?
-- For now, default row updates handle this via actions.

-- Add comment
COMMENT ON COLUMN render_jobs.ai_models_used IS 'Map of task types to model IDs used in this job';
COMMENT ON COLUMN projects.execution_locked IS 'If true, project execution is in progress (e.g. rendering) and edits are blocked';
