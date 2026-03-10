-- Migration: 100_camera_motion_schema.sql
-- Description: Adds camera and motion configuration to scenes, and render strategy to jobs.

-- 1. Add config columns to scenes
ALTER TABLE scenes 
ADD COLUMN IF NOT EXISTS camera_config JSONB DEFAULT '{}'::JSONB,
ADD COLUMN IF NOT EXISTS motion_config JSONB DEFAULT '{}'::JSONB;

-- 2. Add render_strategy to render_jobs
-- We utilize a Check Constraint for Enum implementation in Supabase/Postgres best practices for easy expansion
ALTER TABLE render_jobs
ADD COLUMN IF NOT EXISTS render_strategy TEXT DEFAULT 'TEXT_TO_VIDEO';

ALTER TABLE render_jobs
ADD CONSTRAINT render_strategy_check 
CHECK (render_strategy IN ('TEXT_TO_VIDEO', 'IMAGE_TO_VIDEO', 'MULTI_IMAGE_TO_VIDEO', 'AVATAR_VIDEO', 'VIDEO_TO_VIDEO'));

-- 3. Comment for documentation
COMMENT ON COLUMN scenes.camera_config IS 'Structured camera parameters (angle, zoom, motion) for deterministic rendering.';
COMMENT ON COLUMN scenes.motion_config IS 'Structured motion settings (speed, stability) for layer animation.';
COMMENT ON COLUMN render_jobs.render_strategy IS 'Determines the AI pipeline path: Text-to-Video vs Image-to-Video.';
