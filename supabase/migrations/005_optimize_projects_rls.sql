-- Optimize Projects RLS to be more robust
-- Reference: BUILD_PHASES.md — Phase 2 Project Access
-- Replace "studio_id IN (...)" with direct check: "(SELECT user_id FROM studios WHERE id = projects.studio_id) = auth.uid()"

DROP POLICY IF EXISTS "Users can view own studio projects" ON projects;
CREATE POLICY "Users can view own studio projects" ON projects
    FOR SELECT USING (
        (SELECT user_id FROM studios WHERE id = studio_id) = auth.uid()
    );

DROP POLICY IF EXISTS "Users can insert own studio projects" ON projects;
CREATE POLICY "Users can insert own studio projects" ON projects
    FOR INSERT WITH CHECK (
        (SELECT user_id FROM studios WHERE id = studio_id) = auth.uid()
    );

DROP POLICY IF EXISTS "Users can update own studio projects" ON projects;
CREATE POLICY "Users can update own studio projects" ON projects
    FOR UPDATE USING (
        (SELECT user_id FROM studios WHERE id = studio_id) = auth.uid()
    );

DROP POLICY IF EXISTS "Users can delete own studio projects" ON projects;
CREATE POLICY "Users can delete own studio projects" ON projects
    FOR DELETE USING (
        (SELECT user_id FROM studios WHERE id = studio_id) = auth.uid()
    );

-- Also do the same for Scenes
DROP POLICY IF EXISTS "Users can view own project scenes" ON scenes;
CREATE POLICY "Users can view own project scenes" ON scenes
    FOR SELECT USING (
        (SELECT user_id FROM studios WHERE id = (
            SELECT studio_id FROM projects WHERE id = scenes.project_id
        )) = auth.uid()
    );

DROP POLICY IF EXISTS "Users can insert own project scenes" ON scenes;
CREATE POLICY "Users can insert own project scenes" ON scenes
    FOR INSERT WITH CHECK (
        (SELECT user_id FROM studios WHERE id = (
            SELECT studio_id FROM projects WHERE id = scenes.project_id
        )) = auth.uid()
    );

DROP POLICY IF EXISTS "Users can update own project scenes" ON scenes;
CREATE POLICY "Users can update own project scenes" ON scenes
    FOR UPDATE USING (
        (SELECT user_id FROM studios WHERE id = (
            SELECT studio_id FROM projects WHERE id = scenes.project_id
        )) = auth.uid()
    );

DROP POLICY IF EXISTS "Users can delete own project scenes" ON scenes;
CREATE POLICY "Users can delete own project scenes" ON scenes
    FOR DELETE USING (
        (SELECT user_id FROM studios WHERE id = (
            SELECT studio_id FROM projects WHERE id = scenes.project_id
        )) = auth.uid()
    );
