-- Migration: Add content_type and project_description to projects table
-- Date: 2026-01-05
-- Purpose: Remediation of Strict Audit findings to capture user intent

-- Create enum for Project Content Type
CREATE TYPE project_content_type AS ENUM (
    'commercial',
    'ugc',
    'explainer',
    'motion_graphics',
    'saas_demo',
    'avatar_video'
);

-- Add columns to projects table
ALTER TABLE projects 
ADD COLUMN content_type project_content_type,
ADD COLUMN project_description text;

-- Add comment for documentation
COMMENT ON COLUMN projects.content_type IS 'High-level category validation for Execution Profile selection';
COMMENT ON COLUMN projects.project_description IS 'User-provided description of the video intent';
