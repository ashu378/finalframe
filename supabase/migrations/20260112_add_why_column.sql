-- Fixed: Missing Column 'why_this_scene_exists' causing schema error
-- Context: AI Director needs this column to justify scene decisions.
ALTER TABLE scenes ADD COLUMN IF NOT EXISTS why_this_scene_exists TEXT;

-- Verify it works
SELECT count(*) FROM scenes;
