-- Migration 016: Client Review & Approvals

-- 1. Review Links Table
CREATE TABLE review_links (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    snapshot_id UUID REFERENCES render_snapshots(id) ON DELETE SET NULL,
    
    access_token TEXT NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(16), 'hex'),
    label TEXT, -- e.g. "V1 for Client Review"
    
    is_active BOOLEAN DEFAULT true,
    expires_at TIMESTAMPTZ,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Review Comments Table
CREATE TABLE review_comments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    review_link_id UUID NOT NULL REFERENCES review_links(id) ON DELETE CASCADE,
    
    author_name TEXT NOT NULL,
    content TEXT NOT NULL,
    timestamp FLOAT DEFAULT 0, -- Video timestamp in seconds
    scene_id UUID REFERENCES scenes(id) ON DELETE SET NULL, -- Optional: link to specific scene
    
    is_resolved BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Indexes
CREATE INDEX idx_review_links_project_id ON review_links(project_id);
CREATE INDEX idx_review_links_token ON review_links(access_token);
CREATE INDEX idx_review_comments_link_id ON review_comments(review_link_id);

-- 4. RLS Policies
ALTER TABLE review_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE review_comments ENABLE ROW LEVEL SECURITY;

-- Owner can manage review links
CREATE POLICY "Users can manage review links of their projects" ON review_links
    FOR ALL USING (
        project_id IN (
            SELECT id FROM projects 
            WHERE studio_id IN (SELECT id FROM studios WHERE user_id = auth.uid())
        )
    );

-- Everyone can VIEW a review link if they have the token (handled by RPC for security/simplicity)
-- But we add a policy just in case.
CREATE POLICY "Public can view active review links via token" ON review_links
    FOR SELECT USING (is_active = true AND (expires_at IS NULL OR expires_at > NOW()));

-- Owner can manage comments
CREATE POLICY "Users can manage comments for their review links" ON review_comments
    FOR ALL USING (
        review_link_id IN (
            SELECT id FROM review_links 
            WHERE project_id IN (
                SELECT id FROM projects 
                WHERE studio_id IN (SELECT id FROM studios WHERE user_id = auth.uid())
            )
        )
    );

-- Public can post comments if the link is active
CREATE POLICY "Public can post comments to active review links" ON review_comments
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM review_links 
            WHERE review_links.id = review_comments.review_link_id 
            AND is_active = true 
            AND (expires_at IS NULL OR expires_at > NOW())
        )
    );

-- 5. RPC function to safely fetch all data needed for the review page without exposing the whole DB to public
CREATE OR REPLACE FUNCTION get_review_data(p_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_link RECORD;
    v_project RECORD;
    v_snapshot RECORD;
    v_scenes JSONB;
    v_comments JSONB;
    v_layers JSONB;
BEGIN
    -- 1. Get Link
    SELECT * INTO v_link FROM review_links WHERE access_token = p_token AND is_active = true AND (expires_at IS NULL OR expires_at > NOW());
    
    IF NOT FOUND THEN
        RETURN NULL;
    END IF;

    -- 2. Get Project
    SELECT name, outcome_goal, platform, context INTO v_project FROM projects WHERE id = v_link.project_id;

    -- 3. Get Snapshot
    SELECT id, label, layer_manifest INTO v_snapshot FROM render_snapshots WHERE id = v_link.snapshot_id;

    -- 4. Get Layers associated with snapshot
    -- We extract IDs from layer_manifest which is { [layer_type]: layer_id }
    SELECT json_agg(l) INTO v_layers FROM render_layers l 
    WHERE id IN (
        SELECT (value->>0)::uuid FROM jsonb_each_text(v_snapshot.layer_manifest)
    );

    -- 5. Get Scenes
    SELECT json_agg(s ORDER BY order_index) INTO v_scenes FROM scenes WHERE project_id = v_link.project_id;

    -- 6. Get Comments
    SELECT json_agg(c ORDER BY created_at) INTO v_comments FROM review_comments WHERE review_link_id = v_link.id;

    RETURN jsonb_build_object(
        'link', row_to_json(v_link),
        'project', row_to_json(v_project),
        'snapshot', row_to_json(v_snapshot),
        'layers', v_layers,
        'scenes', v_scenes,
        'comments', v_comments
    );
END;
$$;
