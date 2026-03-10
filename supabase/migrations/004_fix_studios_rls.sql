-- Enable RLS on Studios and related tables
ALTER TABLE studios ENABLE ROW LEVEL SECURITY;
ALTER TABLE studio_defaults ENABLE ROW LEVEL SECURITY;
ALTER TABLE creative_dna ENABLE ROW LEVEL SECURITY;
ALTER TABLE message_blocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE studio_assets ENABLE ROW LEVEL SECURITY;

-- STUDIOS Policies
DROP POLICY IF EXISTS "Users can view own studio" ON studios;
CREATE POLICY "Users can view own studio" ON studios FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can insert own studio" ON studios;
CREATE POLICY "Users can insert own studio" ON studios FOR INSERT WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can update own studio" ON studios;
CREATE POLICY "Users can update own studio" ON studios FOR UPDATE USING (user_id = auth.uid());

-- STUDIO DEFAULTS Policies
DROP POLICY IF EXISTS "Users can view own studio defaults" ON studio_defaults;
CREATE POLICY "Users can view own studio defaults" ON studio_defaults FOR SELECT USING (
    studio_id IN (SELECT id FROM studios WHERE user_id = auth.uid())
);

DROP POLICY IF EXISTS "Users can insert own studio defaults" ON studio_defaults;
CREATE POLICY "Users can insert own studio defaults" ON studio_defaults FOR INSERT WITH CHECK (
    studio_id IN (SELECT id FROM studios WHERE user_id = auth.uid())
);

DROP POLICY IF EXISTS "Users can update own studio defaults" ON studio_defaults;
CREATE POLICY "Users can update own studio defaults" ON studio_defaults FOR UPDATE USING (
    studio_id IN (SELECT id FROM studios WHERE user_id = auth.uid())
);

-- CREATIVE DNA Policies
DROP POLICY IF EXISTS "Users can view own creative dna" ON creative_dna;
CREATE POLICY "Users can view own creative dna" ON creative_dna FOR SELECT USING (
    studio_id IN (SELECT id FROM studios WHERE user_id = auth.uid())
);

DROP POLICY IF EXISTS "Users can insert own creative dna" ON creative_dna;
CREATE POLICY "Users can insert own creative dna" ON creative_dna FOR INSERT WITH CHECK (
    studio_id IN (SELECT id FROM studios WHERE user_id = auth.uid())
);

DROP POLICY IF EXISTS "Users can update own creative dna" ON creative_dna;
CREATE POLICY "Users can update own creative dna" ON creative_dna FOR UPDATE USING (
    studio_id IN (SELECT id FROM studios WHERE user_id = auth.uid())
);

-- MESSAGE BLOCKS Policies
DROP POLICY IF EXISTS "Users can view own message blocks" ON message_blocks;
CREATE POLICY "Users can view own message blocks" ON message_blocks FOR SELECT USING (
    studio_id IN (SELECT id FROM studios WHERE user_id = auth.uid())
);

DROP POLICY IF EXISTS "Users can insert own message blocks" ON message_blocks;
CREATE POLICY "Users can insert own message blocks" ON message_blocks FOR INSERT WITH CHECK (
    studio_id IN (SELECT id FROM studios WHERE user_id = auth.uid())
);

DROP POLICY IF EXISTS "Users can update own message blocks" ON message_blocks;
CREATE POLICY "Users can update own message blocks" ON message_blocks FOR UPDATE USING (
    studio_id IN (SELECT id FROM studios WHERE user_id = auth.uid())
);

-- STUDIO ASSETS Policies
DROP POLICY IF EXISTS "Users can view own studio assets" ON studio_assets;
CREATE POLICY "Users can view own studio assets" ON studio_assets FOR SELECT USING (
    studio_id IN (SELECT id FROM studios WHERE user_id = auth.uid())
);

DROP POLICY IF EXISTS "Users can insert own studio assets" ON studio_assets;
CREATE POLICY "Users can insert own studio assets" ON studio_assets FOR INSERT WITH CHECK (
    studio_id IN (SELECT id FROM studios WHERE user_id = auth.uid())
);

DROP POLICY IF EXISTS "Users can delete own studio assets" ON studio_assets;
CREATE POLICY "Users can delete own studio assets" ON studio_assets FOR DELETE USING (
    studio_id IN (SELECT id FROM studios WHERE user_id = auth.uid())
);
