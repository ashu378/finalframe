-- Create User Role Enum
CREATE TYPE user_role AS ENUM ('owner', 'editor', 'reviewer', 'viewer');

-- Create Studio Members Table
CREATE TABLE IF NOT EXISTS studio_members (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    studio_id UUID NOT NULL, -- Logical grouping, currently we assume 1 User = 1 Studio for simplicity, but this allows expansion
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    role user_role NOT NULL DEFAULT 'viewer',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(studio_id, user_id)
);

-- Enable RLS
ALTER TABLE studio_members ENABLE ROW LEVEL SECURITY;

-- RLS Policies

-- Policy 1: Members can view other members of the SAME studio (to see who is on their team)
CREATE POLICY "Members can view their teammates"
ON studio_members FOR SELECT
USING (
    studio_id IN (
        SELECT studio_id FROM studio_members WHERE user_id = auth.uid()
    )
);

-- Policy 2: Users can view their OWN membership (bootstrapping access)
-- This is critical for the initial check "Am I in this studio?"
CREATE POLICY "Users can view their own membership"
ON studio_members FOR SELECT
USING (
    user_id = auth.uid()
);

-- Policy 3: Only OWNERS can add/invite new members
CREATE POLICY "Owners can add members"
ON studio_members FOR INSERT
WITH CHECK (
    EXISTS (
        SELECT 1 FROM studio_members
        WHERE studio_id = studio_members.studio_id
        AND user_id = auth.uid()
        AND role = 'owner'
    )
);

-- Policy 4: Only OWNERS can update member roles
CREATE POLICY "Owners can update roles"
ON studio_members FOR UPDATE
USING (
    EXISTS (
        SELECT 1 FROM studio_members
        WHERE studio_id = studio_members.studio_id
        AND user_id = auth.uid()
        AND role = 'owner'
    )
);

-- Policy 5: Only OWNERS can remove members
CREATE POLICY "Owners can remove members"
ON studio_members FOR DELETE
USING (
    EXISTS (
        SELECT 1 FROM studio_members
        WHERE studio_id = studio_members.studio_id
        AND user_id = auth.uid()
        AND role = 'owner'
    )
);

-- Index for fast lookups
CREATE INDEX idx_studio_members_user_id ON studio_members(user_id);
CREATE INDEX idx_studio_members_studio_id ON studio_members(studio_id);

-- Auto-assign OWNER role to the creator for bootstrapped studios
-- Note: In our current app, when a user signs up, we might need a trigger to create a studio 
-- OR we just treat the User's ID as the Studio ID for the time being (Personal Workspace).
-- For Phase 6, we will implement the concept that a Project belongs to a User (Owner), 
-- but if we want shared access, we need a shared "Studio" concept or just add members to a "Studio" 
-- which effectively is the Owner's workspace.
-- For simplicity in Phase 6: A "Studio" is identified by the Owner's User ID (Personal Workspace turned Team).

-- COMMENT: In this migration, we are formalizing the `studio_members` table.
-- Existing logic likely uses `auth.uid() = project.user_id`.
-- We will need to update project access policies later to check `studio_members` instead of just exact match.
