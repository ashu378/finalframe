-- ==========================================
-- FINALFRAME PHASE 4 TEST SEED
-- Usage: Run this in Supabase SQL Editor
-- Result: Creates a Project, Render Job, and Layers
-- ready for Remix Testing.
-- ==========================================

WITH target_studio AS (
    SELECT id FROM studios LIMIT 1 -- Or replace with specific UUID: 'your-uuid-here'::uuid
),
new_project AS (
    INSERT INTO projects (
        name, 
        studio_id, 
        state, 
        execution_locked
    )
    SELECT 
        'Phase 4 Test Project ' || floor(random() * 1000)::text,
        id,
        'rendered',
        false
    FROM target_studio
    RETURNING id
),
new_render_job AS (
    INSERT INTO render_jobs (
        project_id,
        status,
        remix_locked,
        ai_models_used
    )
    SELECT 
        id,
        'completed',
        false,
        '{"visual": "mock-dalle", "text": "mock-claude"}'::jsonb
    FROM new_project
    RETURNING id
),
new_layers AS (
    INSERT INTO render_layers (project_id, render_job_id, layer_type, asset_url, is_original)
    SELECT 
        p.id,
        r.id,
        unnest(ARRAY['background', 'actor', 'text']::remix_layer_type[]),
        unnest(ARRAY[
            'https://placehold.co/1920x1080/222/white?text=Original+Bg',
            'https://placehold.co/500x500/transparent/white?text=Actor',
            'https://placehold.co/800x200/transparent/white?text=Overlay+Text'
        ]),
        true
    FROM new_project p, new_render_job r
    RETURNING id, layer_type
)
-- Create Initial Snapshot linked to these layers
INSERT INTO render_snapshots (project_id, render_job_id, label, layer_manifest)
SELECT
    p.id,
    r.id,
    'Initial Render',
    jsonb_object_agg(l.layer_type, l.id)
FROM new_project p, new_render_job r, new_layers l
GROUP BY p.id, r.id
RETURNING 'TEST DATA CREATED! Go to: /studio/projects/' || project_id || '/editor' as message;
