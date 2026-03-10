-- Add branding column to projects for project-level overrides
-- Reference: MASTER_PRD.md - Project-level brand independence

ALTER TABLE projects ADD COLUMN IF NOT EXISTS branding JSONB DEFAULT '{}'::jsonb;
-- branding structure: { "logo_url": string | null, "brand_colors": string[] | null, "font_heading": string | null, "font_body": string | null }
