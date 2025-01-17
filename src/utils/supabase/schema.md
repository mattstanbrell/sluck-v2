# Database Schema Documentation

This document outlines the database schema for our Slack clone application. The schema is designed to support workspaces, channels, direct messaging, and threading functionality while maintaining data integrity and query performance.

## Core Tables

### Profiles

```sql
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  email TEXT NOT NULL,
  full_name TEXT NOT NULL,
  display_name TEXT,
  avatar_url TEXT,
  avatar_color TEXT,
  avatar_cache TEXT,
  last_seen TIMESTAMPTZ
);

CREATE INDEX profiles_email_key ON profiles(email);
CREATE INDEX profiles_presence_idx ON profiles(last_seen);

-- RLS Policies
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Allow users to read profiles of members in their workspaces or their own profile
CREATE POLICY "Users can read profiles of workspace members"
ON profiles FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM workspace_members wm
    WHERE wm.user_id = auth.uid()
      AND EXISTS (
        SELECT 1
        FROM workspace_members wm2
        WHERE wm2.workspace_id = wm.workspace_id
          AND wm2.user_id = profiles.id
      )
  )
  OR id = auth.uid()
);

-- Allow users to update their own profile
CREATE POLICY "Users can update their own profile"
ON profiles FOR UPDATE
TO authenticated
USING (id = auth.uid())
WITH CHECK (id = auth.uid());
```

- Links to Supabase's auth.users table
- Separates display_name from full_name for flexibility
- Tracks last_seen for presence features
- Stores avatar_color extracted from user's avatar for UI theming
- RLS ensures only workspace peers or the user themself can view/update

### Workspaces

```sql
CREATE TABLE workspaces (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  description TEXT,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  invite_code TEXT UNIQUE,
  invite_expires_at TIMESTAMPTZ,
  invite_is_revoked BOOLEAN DEFAULT false
);

CREATE INDEX workspaces_created_by_idx ON workspaces(created_by);
CREATE INDEX workspaces_invite_code_idx ON workspaces(invite_code);
CREATE INDEX workspaces_slug_key ON workspaces(slug);
```

- Slug field for URL-friendly workspace names
- Invite system with expiration and revocation
- Indexes for creator lookups and invite code validation

### Workspace Members

```sql
CREATE TABLE workspace_members (
  workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('owner', 'admin', 'member')) DEFAULT 'member',
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, user_id)
);

CREATE INDEX workspace_members_user_id_idx ON workspace_members(user_id);
```

- Tracks membership and roles in workspaces
- Composite primary key prevents duplicates
- Indexes for quick membership lookups

## Row Level Security (RLS) Policies

### Workspace Policies

```sql
-- Enable RLS
ALTER TABLE workspaces ENABLE ROW LEVEL SECURITY;

-- Allow any authenticated user to create workspaces
CREATE POLICY "Users can create workspaces"
ON workspaces FOR INSERT
TO authenticated
WITH CHECK (true);

-- Allow creators and members to view workspaces
ALTER POLICY "Creators can view their workspaces"
ON public.workspaces
TO authenticated
USING (
  (created_by = auth.uid())
  OR EXISTS (
    SELECT 1
    FROM workspace_members wm
    WHERE wm.workspace_id = workspaces.id
      AND wm.user_id = auth.uid()
  )
);

-- Allow workspace owners and admins to update workspace settings
CREATE POLICY "Owners and admins can update workspace settings"
ON workspaces FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM workspace_members
    WHERE workspace_id = workspaces.id
      AND user_id = auth.uid()
      AND role IN ('owner', 'admin')
  )
);
```

- Users can insert new workspaces (becoming the created_by)
- Policy Change: "Creators can view their workspaces" is now extended so that any workspace member may also view it

### Workspace Members Policies

```sql
ALTER TABLE workspace_members ENABLE ROW LEVEL SECURITY;

-- Allow reading membership of a workspace you belong to
CREATE POLICY "Members can view workspace members"
ON workspace_members FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM workspace_members wm
    WHERE wm.workspace_id = workspace_members.workspace_id
      AND wm.user_id = auth.uid()
  )
);

-- Initial owner policy: user can set themselves as owner if they created the workspace
CREATE POLICY "Initial owner can be set"
ON workspace_members FOR INSERT
TO authenticated
WITH CHECK (
  user_id = auth.uid()
  AND EXISTS (
    SELECT 1
    FROM workspaces
    WHERE id = workspace_id
      AND created_by = auth.uid()
  )
);

-- Owners and admins can update members
CREATE POLICY "Owners and admins can manage members"
ON workspace_members FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM workspace_members wm
    WHERE wm.workspace_id = workspace_members.workspace_id
      AND wm.user_id = auth.uid()
      AND wm.role IN ('owner', 'admin')
  )
);
```

### REVOKE Direct INSERT on workspace_members

Since we now manage membership via admin actions or via our new security-definer function, we explicitly revoke direct inserts by normal users:

```sql
REVOKE INSERT ON workspace_members FROM authenticated;
```

This ensures that only owners/admins (by policy) or a special function can add new members.

### Channels

```sql
CREATE TABLE channels (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  description TEXT,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT unique_channel_name_per_workspace UNIQUE (workspace_id, name),
  CONSTRAINT unique_channel_slug_per_workspace UNIQUE (workspace_id, slug)
);

CREATE INDEX channels_workspace_id_idx ON channels(workspace_id);
CREATE INDEX channels_created_by_idx ON channels(created_by);
CREATE INDEX channels_slug_idx ON channels(workspace_id, slug);
```

### Channel Members

```sql
CREATE TABLE channel_members (
  channel_id UUID REFERENCES channels(id) ON DELETE CASCADE,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('admin', 'member')) DEFAULT 'member',
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_read_at TIMESTAMPTZ,
  PRIMARY KEY (channel_id, user_id)
);

CREATE INDEX channel_members_user_id_idx ON channel_members(user_id);
```

### Conversations (DMs)

```sql
CREATE TABLE conversations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('direct', 'group')) DEFAULT 'direct',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX conversations_workspace_id_idx ON conversations(workspace_id);
```

### Conversation Participants

```sql
CREATE TABLE conversation_participants (
  conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_read_at TIMESTAMPTZ,
  PRIMARY KEY (conversation_id, user_id)
);

CREATE INDEX conversation_participants_user_id_idx ON conversation_participants(user_id);
```

### Messages

```sql
-- Update: Enable pgvector extension if not already present (required for vector similarity)
CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA public;

CREATE TABLE messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
  channel_id UUID REFERENCES channels(id) ON DELETE CASCADE,
  user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  parent_id UUID REFERENCES messages(id) ON DELETE CASCADE,
  reply_count INTEGER NOT NULL DEFAULT 0,
  reply_user_ids UUID[] NOT NULL DEFAULT '{}',
  embedding vector(1024), -- Vector embedding of message content for semantic search
  context TEXT, -- Contextual information about the message chain
  formatted_chain TEXT, -- The formatted chain of messages in semantic format for embedding
  CONSTRAINT message_container_check CHECK (
    (conversation_id IS NULL AND channel_id IS NOT NULL) 
    OR 
    (conversation_id IS NOT NULL AND channel_id IS NULL)
  )
);

-- Updated index creation for similarity search: switched from ivfflat to HNSW
-- Previous:
--   CREATE INDEX messages_embedding_idx ON messages USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

CREATE INDEX messages_embedding_idx
ON messages
USING hnsw (embedding vector_cosine_ops);

-- Message similarity search function
CREATE OR REPLACE FUNCTION match_messages(
  query_embedding vector(1024),
  match_threshold float,
  match_count int
)
RETURNS TABLE (
  id uuid,
  conversation_id uuid,
  channel_id uuid,
  user_id uuid,
  content text,
  context text,
  formatted_chain text,
  similarity float
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    m.id,
    m.conversation_id,
    m.channel_id,
    m.user_id,
    m.content,
    m.context,
    m.formatted_chain,
    1 - (m.embedding <=> query_embedding) AS similarity
  FROM messages m
  WHERE 1 - (m.embedding <=> query_embedding) > match_threshold
  ORDER BY (m.embedding <=> query_embedding)
  LIMIT match_count;
END;
$$;

-- Thread reply tracking trigger function
CREATE OR REPLACE FUNCTION update_parent_thread_info()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only proceed if this is a reply (has a parent_id)
  IF NEW.parent_id IS NOT NULL THEN
    -- Update the parent message's reply count and maintain up to 3 unique replier IDs
    UPDATE messages
    SET 
      reply_count = reply_count + 1,
      reply_user_ids = (
        SELECT DISTINCT ARRAY(
          SELECT UNNEST(ARRAY[NEW.user_id] || reply_user_ids)
          LIMIT 3
        )
      )
    WHERE id = NEW.parent_id;
  END IF;
  RETURN NEW;
END;
$$;

-- Attach trigger to messages table
CREATE TRIGGER update_thread_info_trigger
AFTER INSERT ON messages
FOR EACH ROW
EXECUTE FUNCTION update_parent_thread_info();

CREATE INDEX messages_conversation_id_idx ON messages(conversation_id);
CREATE INDEX messages_channel_id_idx ON messages(channel_id);
CREATE INDEX messages_user_id_idx ON messages(user_id);
CREATE INDEX messages_parent_id_idx ON messages(parent_id);
CREATE INDEX messages_thread_order_idx ON messages(parent_id, created_at);
CREATE INDEX messages_latest_channel_idx ON messages(channel_id, created_at DESC);
CREATE INDEX messages_latest_conversation_idx ON messages(conversation_id, created_at DESC);
```

### Messages RLS

```sql
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read messages in their channels"
ON messages FOR SELECT
TO authenticated
USING (
  (channel_id IN (
    SELECT channel_id
    FROM channel_members
    WHERE user_id = auth.uid()
  ))
  OR
  (conversation_id IN (
    SELECT conversation_id
    FROM conversation_participants
    WHERE user_id = auth.uid()
  ))
);

CREATE POLICY "Users can insert messages"
ON messages FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = user_id
  AND (
    -- For channel messages
    (
      channel_id IS NOT NULL
      AND EXISTS (
        SELECT 1
        FROM channel_members
        WHERE channel_id = messages.channel_id
          AND user_id = auth.uid()
      )
    )
    OR
    -- For conversation messages
    (
      conversation_id IS NOT NULL
      AND EXISTS (
        SELECT 1
        FROM conversation_participants
        WHERE conversation_id = messages.conversation_id
          AND user_id = auth.uid()
      )
    )
  )
);

CREATE POLICY "Users can update their own messages"
ON messages FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own messages"
ON messages FOR DELETE
TO authenticated
USING (auth.uid() = user_id);
```

### Files

```sql
CREATE TABLE files (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  message_id UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  file_type TEXT,
  file_name TEXT,
  file_size BIGINT,
  file_url TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  caption TEXT, -- Short description for text-based queries
  description TEXT, -- Detailed description for semantic search
  embedding vector(1024) -- Vector embedding for semantic similarity search
);

-- Enable Row Level Security
ALTER TABLE files ENABLE ROW LEVEL SECURITY;

-- Grant select access if a user can view the parent message 
CREATE POLICY "Users can read files if they can read the parent message"
ON files FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM messages
    WHERE messages.id = files.message_id
      AND (
        (channel_id IN (
          SELECT channel_id
          FROM channel_members
          WHERE user_id = auth.uid()
        ))
        OR
        (conversation_id IN (
          SELECT conversation_id
          FROM conversation_participants
          WHERE user_id = auth.uid()
        ))
      )
  )
);

-- Insert policy: users can add a file only to messages they own
CREATE POLICY "Users can insert files for their own messages"
ON files FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM messages
    WHERE messages.id = files.message_id
      AND messages.user_id = auth.uid()
  )
);

-- Update policy: users can update files attached to their own messages
CREATE POLICY "Users can update files for their own messages"
ON files FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM messages
    WHERE messages.id = files.message_id
      AND messages.user_id = auth.uid()
  )
);

-- Create HNSW index for vector similarity search
CREATE INDEX files_embedding_idx
ON files
USING hnsw (embedding vector_cosine_ops);

-- Add to realtime publication
ALTER PUBLICATION supabase_realtime ADD TABLE files;
```

- Links each file to a message for context and permissions inheritance
- Enforces RLS based on message visibility
- Ensures users can only attach files to their own messages
- Allows users to update files (captions, descriptions, embeddings) on their own messages
- Tracks file metadata (type, name, size) for UI display
- Stores file URL for access (typically an S3 URL)
- Supports semantic search with:
  - Short captions for quick text-based queries
  - Detailed descriptions for richer context
  - Vector embeddings for similarity search
  - HNSW index for efficient vector queries

## Functions and Triggers

### 1) Automatic Workspace Owner Assignment

```sql
-- Function to add workspace creator as owner
CREATE OR REPLACE FUNCTION add_creator_as_workspace_owner()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO workspace_members (workspace_id, user_id, role)
  VALUES (NEW.id, NEW.created_by, 'owner');

  RETURN NEW;
END;
$$;

-- Trigger to automatically add creator as owner
CREATE TRIGGER workspace_creator_trigger
AFTER INSERT ON workspaces
FOR EACH ROW
EXECUTE FUNCTION add_creator_as_workspace_owner();
```

### 2) Enforce Conversation Rules

```sql
CREATE OR REPLACE FUNCTION enforce_direct_dm_uniqueness()
RETURNS TRIGGER AS $$
BEGIN
  -- Only check for 'direct' conversation if the newly inserted row has a conversation_id
  IF NEW.conversation_id IS NOT NULL THEN
    IF EXISTS (
      SELECT 1
      FROM conversations c
      JOIN conversation_participants cp1
        ON c.id = cp1.conversation_id
      JOIN conversation_participants cp2
        ON c.id = cp2.conversation_id
      WHERE c.workspace_id = (
        SELECT workspace_id
        FROM conversations
        WHERE id = NEW.conversation_id
      )
      AND c.type = 'direct'
      -- The newly inserted participant
      AND cp1.user_id = NEW.user_id
      -- The existing participant(s) already in this conversation
      AND cp2.user_id IN (
        SELECT user_id
        FROM conversation_participants
        WHERE conversation_id = NEW.conversation_id
      )
      AND c.id != NEW.conversation_id
    ) THEN
      RAISE EXCEPTION 'A direct message conversation already exists for these users';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER enforce_direct_dm_uniqueness_trigger
BEFORE INSERT ON conversation_participants
FOR EACH ROW
EXECUTE FUNCTION enforce_direct_dm_uniqueness();
```

### 2) Unread Counts

```sql
CREATE OR REPLACE FUNCTION get_channel_unread_counts(user_id_param UUID)
RETURNS TABLE (
  channel_id UUID,
  channel_name TEXT,
  unread_count BIGINT
) AS $$
  SELECT
    c.id,
    c.name,
    COUNT(m.id) as unread_count
  FROM channels c
  JOIN channel_members cm ON c.id = cm.channel_id
  LEFT JOIN messages m ON c.id = m.channel_id
    AND m.created_at > cm.last_read_at
  WHERE cm.user_id = user_id_param
  GROUP BY c.id, c.name;
$$ LANGUAGE SQL;

CREATE OR REPLACE FUNCTION get_conversation_unread_counts(user_id_param UUID)
RETURNS TABLE (
  conversation_id UUID,
  unread_count BIGINT
) AS $$
  SELECT
    c.id,
    COUNT(m.id) as unread_count
  FROM conversations c
  JOIN conversation_participants cp ON c.id = cp.conversation_id
  LEFT JOIN messages m ON c.id = m.conversation_id
    AND m.created_at > cp.last_read_at
  WHERE cp.user_id = user_id_param
  GROUP BY c.id;
$$ LANGUAGE SQL;
```

### 3) Workspace Slug Generation

```sql
CREATE OR REPLACE FUNCTION generate_unique_workspace_slug(workspace_name TEXT)
RETURNS TEXT AS $$
DECLARE
  base_slug TEXT;
  highest_number INT;
BEGIN
  -- Convert to lowercase, replace spaces/special chars with hyphens
  base_slug := lower(regexp_replace(workspace_name, '[^a-zA-Z0-9\s]', '', 'g'));
  base_slug := regexp_replace(base_slug, '\s+', '-', 'g');

  -- First try without a number
  IF NOT EXISTS (SELECT 1 FROM workspaces WHERE slug = base_slug) THEN
    RETURN base_slug;
  END IF;

  -- Find highest number used for this base slug
  SELECT COALESCE(
    MAX(
      NULLIF(
        regexp_replace(slug, '^' || base_slug || '-([0-9]+)$', '\1'),
        slug
      )::INT
    ),
    0
  ) INTO highest_number
  FROM workspaces
  WHERE slug ~ ('^' || base_slug || '-[0-9]+$');

  RETURN base_slug || '-' || (highest_number + 1)::TEXT;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION handle_workspace_slug()
RETURNS TRIGGER AS $$
BEGIN
  IF (TG_OP = 'INSERT')
     OR (TG_OP = 'UPDATE' AND NEW.name <> OLD.name)
     OR (NEW.slug IS NULL) THEN
    NEW.slug := generate_unique_workspace_slug(NEW.name);
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER workspace_slug_trigger
BEFORE INSERT OR UPDATE ON workspaces
FOR EACH ROW
EXECUTE FUNCTION handle_workspace_slug();
```

### 4) Channel Slug Generation

```sql
CREATE OR REPLACE FUNCTION generate_unique_channel_slug(channel_name TEXT, workspace_id_param UUID)
RETURNS TEXT AS $$
DECLARE
  base_slug TEXT;
  highest_number INT;
BEGIN
  base_slug := lower(regexp_replace(channel_name, '[^a-zA-Z0-9\s]', '', 'g'));
  base_slug := regexp_replace(base_slug, '\s+', '-', 'g');

  IF NOT EXISTS (
    SELECT 1
    FROM channels
    WHERE workspace_id = workspace_id_param
      AND slug = base_slug
  ) THEN
    RETURN base_slug;
  END IF;

  SELECT COALESCE(
    MAX(
      NULLIF(
        regexp_replace(slug, '^' || base_slug || '-([0-9]+)$', '\1'),
        slug
      )::INT
    ),
    0
  )
  INTO highest_number
  FROM channels
  WHERE workspace_id = workspace_id_param
    AND slug ~ ('^' || base_slug || '-[0-9]+$');

  RETURN base_slug || '-' || (highest_number + 1)::TEXT;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION handle_channel_slug()
RETURNS TRIGGER AS $$
BEGIN
  IF (TG_OP = 'INSERT')
     OR (TG_OP = 'UPDATE' AND NEW.name <> OLD.name)
     OR (NEW.slug IS NULL) THEN
    NEW.slug := generate_unique_channel_slug(NEW.name, NEW.workspace_id);
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER channel_slug_trigger
BEFORE INSERT OR UPDATE ON channels
FOR EACH ROW
EXECUTE FUNCTION handle_channel_slug();
```

### SECURITY DEFINER Function for Workspace Invites

New in this updated schema: a function that returns a workspace slug and bypasses RLS for membership insertion.

```sql
CREATE OR REPLACE FUNCTION join_workspace_with_code(_invite_code text)
RETURNS text  -- returns the workspace slug
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  _workspace_slug text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Must be authenticated to join a workspace.';
  END IF;

  SELECT slug
  INTO _workspace_slug
  FROM workspaces
  WHERE invite_code = _invite_code
    AND invite_is_revoked = false
    AND (
      invite_expires_at IS NULL
      OR invite_expires_at > now()
    )
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invalid or expired invite code.';
  END IF;

  INSERT INTO workspace_members (workspace_id, user_id, role)
  SELECT w.id, auth.uid(), 'member'
  FROM workspaces w
  WHERE w.slug = _workspace_slug
  ON CONFLICT DO NOTHING;

  RETURN _workspace_slug;
END;
$$;

-- Revoke direct inserts for normal users:
REVOKE INSERT ON workspace_members FROM authenticated;
```

- SECURITY DEFINER bypasses RLS so the function can check the workspace invite code and do the insert
- If the invite is valid, the user becomes a member (role = 'member')
- The function returns the workspace slug, allowing the app to redirect directly to "/workspace/<slug>"

### Channel Policies and Automation

```sql
ALTER TABLE channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE channel_members ENABLE ROW LEVEL SECURITY;

-- Channel access policies
CREATE POLICY "Members can view channels"
ON channels FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM workspace_members
    WHERE workspace_id = channels.workspace_id
      AND user_id = auth.uid()
  )
);

CREATE POLICY "Members can create channels"
ON channels FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM workspace_members
    WHERE workspace_id = channels.workspace_id
      AND user_id = auth.uid()
  )
);

CREATE POLICY "Members can view channel members"
ON channel_members FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Members can join channels"
ON channel_members FOR INSERT
TO authenticated
WITH CHECK (
  user_id = auth.uid()
  AND EXISTS (
    SELECT 1
    FROM workspace_members wm
    JOIN channels c ON c.workspace_id = wm.workspace_id
    WHERE c.id = channel_id
      AND wm.user_id = auth.uid()
  )
);

-- Automatic 'general' channel creation
CREATE OR REPLACE FUNCTION create_general_channel()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
    general_channel_id UUID;
BEGIN
    INSERT INTO channels (workspace_id, name, description, created_by)
    VALUES (
        NEW.id,
        'general',
        'The default channel for all workspace members',
        NEW.created_by
    )
    RETURNING id INTO general_channel_id;

    INSERT INTO channel_members (channel_id, user_id, role)
    VALUES (general_channel_id, NEW.created_by, 'admin');

    RETURN NEW;
END;
$$;

-- Auto-join new members to 'general'
CREATE OR REPLACE FUNCTION auto_join_general_channel()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
    INSERT INTO channel_members (channel_id, user_id, role)
    SELECT c.id, NEW.user_id, 'member'
    FROM channels c
    WHERE c.workspace_id = NEW.workspace_id
      AND c.name = 'general'
    ON CONFLICT DO NOTHING;

    RETURN NEW;
END;
$$;

CREATE TRIGGER workspace_general_channel_trigger
AFTER INSERT ON workspaces
FOR EACH ROW
EXECUTE FUNCTION create_general_channel();

CREATE TRIGGER workspace_member_general_channel_trigger
AFTER INSERT ON workspace_members
FOR EACH ROW
EXECUTE FUNCTION auto_join_general_channel();
```

- Automatically creates a general channel for each workspace
- Workspace creator is admin of general
- All new members automatically join general

### SECURITY DEFINER Function for Direct Messages

New in this updated schema: a function that creates direct message conversations and handles participant creation in a single transaction.

```sql
CREATE OR REPLACE FUNCTION create_direct_message(
  workspace_id_param UUID,
  other_user_id_param UUID
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_conversation_id UUID;
BEGIN
  -- Check if caller is authenticated
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Check if both users are members of the workspace
  IF NOT EXISTS (
    SELECT 1 FROM workspace_members
    WHERE workspace_id = workspace_id_param
    AND user_id IN (auth.uid(), other_user_id_param)
    HAVING COUNT(*) = 2
  ) THEN
    RAISE EXCEPTION 'Both users must be workspace members';
  END IF;

  -- Check if a DM already exists between these users
  IF EXISTS (
    SELECT 1
    FROM conversations c
    JOIN conversation_participants p1 ON c.id = p1.conversation_id
    JOIN conversation_participants p2 ON c.id = p2.conversation_id
    WHERE c.workspace_id = workspace_id_param
    AND c.type = 'direct'
    AND p1.user_id = auth.uid()
    AND p2.user_id = other_user_id_param
  ) THEN
    RAISE EXCEPTION 'Conversation already exists';
  END IF;

  -- Create the conversation
  INSERT INTO conversations (workspace_id, type)
  VALUES (workspace_id_param, 'direct')
  RETURNING id INTO new_conversation_id;

  -- Add both participants
  INSERT INTO conversation_participants (conversation_id, user_id)
  VALUES
    (new_conversation_id, auth.uid()),
    (new_conversation_id, other_user_id_param);

  RETURN new_conversation_id;
END;
$$;
```

- SECURITY DEFINER bypasses RLS so the function can create conversations and participants
- Handles uniqueness check, conversation creation, and participant creation in a single transaction
- Returns the conversation ID for immediate redirection
- Validates both users are workspace members
- Prevents duplicate conversations between the same users

Note: The previous `enforce_direct_dm_uniqueness` trigger has been removed in favor of this function-based approach.

### Design Decisions

#### Direct Message Creation
- Uses a SECURITY DEFINER function for atomic operations
- Enforces uniqueness at the function level rather than with triggers
- Validates workspace membership before creation
- Returns conversation ID for immediate client-side navigation

### RLS Policies for Conversation Participants

```sql
-- Helper function to safely check conversation membership
CREATE OR REPLACE FUNCTION public.user_in_conversation(
  _user_id uuid,
  _conversation_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public      -- avoid custom search paths
SET row_security = off        -- disable RLS checks inside function
AS $$
BEGIN
  RETURN EXISTS(
    SELECT 1
    FROM conversation_participants
    WHERE conversation_id = _conversation_id
      AND user_id = _user_id
  );
END;
$$;

-- Enable RLS on conversation_participants table
ALTER TABLE conversation_participants ENABLE ROW LEVEL SECURITY;

-- Allow users to view their own participations
CREATE POLICY "Users can view their own participations"
ON conversation_participants FOR SELECT
TO authenticated
USING (
  user_id = auth.uid()
);

-- Allow users to see other participants in conversations they're in
CREATE POLICY "Users can view participants in convos they belong to"
ON conversation_participants FOR SELECT
TO authenticated
USING (
  user_in_conversation(auth.uid(), conversation_participants.conversation_id)
);
```

The conversation participant policies are designed to:
- Use a SECURITY DEFINER helper function to safely check conversation membership without recursion
- Allow users to always see their own conversation participations
- Allow users to see other participants in conversations they're part of
- Avoid recursive policy checks by moving the participant lookup into a separate function with RLS disabled
- Work with the SECURITY DEFINER function for creating conversations

Note: Participant creation is handled by the `create_direct_message` SECURITY DEFINER function, so no explicit INSERT policy is needed.

## Final RLS and Real-time Configuration

```sql
-- Enable RLS on all relevant tables
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspace_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE channel_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversation_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

-- Real-time publication
ALTER PUBLICATION supabase_realtime ADD TABLE workspaces;
ALTER PUBLICATION supabase_realtime ADD TABLE workspace_members;
ALTER PUBLICATION supabase_realtime ADD TABLE channels;
ALTER PUBLICATION supabase_realtime ADD TABLE channel_members;
ALTER PUBLICATION supabase_realtime ADD TABLE conversations;
ALTER PUBLICATION supabase_realtime ADD TABLE conversation_participants;
ALTER PUBLICATION supabase_realtime ADD TABLE messages;
```

## Design Decisions

### Automatic Owner Assignment
- Workspace creators are automatically assigned as owners via a trigger
- Uses SECURITY DEFINER to bypass RLS for the initial owner assignment
- Ensures consistent ownership setup for all new workspaces

### Extended Workspace Visibility
- Creators and members can see a workspace
- Non-members remain blocked by RLS

### Invite-based Membership
- SECURITY DEFINER function `join_workspace_with_code`
- Returns the slug for easy client-side redirects
- Direct INSERT to workspace_members is disallowed for normal users

### Unified Messages Table
- Single table for channels and conversations
- Simplifies queries and maintenance
- Threading with parent_id
- Basic approach supports nested threads
- Indexing for thread queries

### Auto-Generated Slugs
- Ensures unique, URL-friendly workspace/channel slugs
- Duplicate names get a numeric suffix

### Real-time Support
- Indexed for latest message queries
- Compatible with Supabase real-time

### Automatic general Channel
- On workspace creation, we create general
- New members automatically join general

### Presence & Profiles
- last_seen in profiles for presence
- Row-level security ensures privacy

### File Attachments
- Files are linked to messages for context and permission inheritance
- RLS policies mirror message visibility, ensuring files are only accessible to users who can see the parent message
- File metadata stored in database while actual files live in S3
- Real-time enabled for instant file attachment updates
- No direct file deletion policy needed as files are automatically removed when parent message is deleted (ON DELETE CASCADE)

## Thread Reply Indicators

The messages table includes support for tracking and displaying thread replies efficiently:

### New Columns
- `reply_count`: Tracks the total number of replies to a message
- `reply_user_ids`: Stores up to 3 most recent unique user IDs who replied

### Automatic Updates
A trigger function `update_parent_thread_info()` automatically maintains these fields:
- Increments `reply_count` when a new reply is added
- Updates `reply_user_ids` to include the new replier's ID (up to 3 unique IDs)
- Runs after each INSERT on the messages table
- Only updates these fields when the message is a reply (has a parent_id)

This enables efficient display of thread indicators without additional queries:
- Show reply count directly from the parent message
- Display up to 3 replier avatars using the stored user IDs
- Maintain consistency via trigger-based updates

### Message Context, Chains, and Embeddings
- Messages store both embeddings and contextual information
- Context field captures the relationship between messages in a chain
- Formatted chain field stores the semantic format used for embeddings
- Embeddings are generated with context for better semantic search
- When a new message is added to a chain:
  - Previous messages in the chain have their embeddings, context, and formatted chains cleared
  - The latest message gets an embedding that includes chain context
  - The formatted chain is stored for debugging and reference
  - This ensures each chain is represented by a single embedding
- The match_messages function returns content, context, and formatted chain
  - Helps AI understand the full conversation flow
  - Provides better context for semantic search results
  - Makes search results more meaningful to users
  - Enables consistent formatting between embedding generation and search result display