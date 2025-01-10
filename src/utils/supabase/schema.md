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
    SELECT 1 FROM workspace_members wm
    WHERE wm.user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM workspace_members wm2
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
- Indexes support email lookups and presence queries
- RLS policies ensure:
  - Users can only read profiles of members in their workspaces
  - Users can always read their own profile
  - Users can only update their own profile

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
- Indexes support creator lookups and invite code validation

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
- Composite primary key prevents duplicate memberships
- Index supports finding all workspaces for a user

## Row Level Security (RLS) Policies

### Current Working Policies

```sql
-- Enable RLS
ALTER TABLE workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspace_members ENABLE ROW LEVEL SECURITY;

-- Allow any authenticated user to create workspaces
CREATE POLICY "Users can create workspaces"
ON workspaces FOR INSERT
TO authenticated
WITH CHECK (true);

-- Allow users to view workspaces they created
CREATE POLICY "Creators can view their workspaces"
ON workspaces FOR SELECT
TO authenticated
USING (created_by = auth.uid());

-- Allow reading from workspace_members (needed for policy checks)
CREATE POLICY "Allow selecting workspace members"
ON workspace_members FOR SELECT
TO authenticated
USING (true);

-- Allow users to add themselves as members with role conditions
CREATE POLICY "Users can create workspace memberships"
ON workspace_members FOR INSERT
TO authenticated
WITH CHECK (
    user_id = auth.uid() AND (
        -- Either adding self as regular member
        role = 'member' OR
        -- Or adding self as owner if created the workspace
        (role = 'owner' AND EXISTS (
            SELECT 1 FROM workspaces 
            WHERE id = workspace_id 
            AND created_by = auth.uid()
        ))
    )
);
```

These minimal policies implement:

1. **Workspace Creation**: Any authenticated user can create workspaces
2. **Workspace Visibility**: Users can only see workspaces they created
3. **Membership Rules**:
   - Users can only add themselves as members
   - Can be added as regular 'member'
   - Can be added as 'owner' only if they created the workspace
4. **Policy Dependencies**:
   - SELECT access on workspace_members is required for policy checks
   - This allows the EXISTS check in the insert policy to work

Note: These are minimal policies for workspace creation. Additional policies will be needed for:
- Viewing workspaces as a member (not just creator)
- Managing workspace settings
- Updating and removing members
- Managing invites
- Channel operations

### Workspace Members Table Policies

```sql
-- Enable RLS
ALTER TABLE workspace_members ENABLE ROW LEVEL SECURITY;

-- Read Policy: Members can view other members in their workspaces
CREATE POLICY "Members can view workspace members"
ON workspace_members FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM workspace_members members
    WHERE members.workspace_id = workspace_id
    AND members.user_id = auth.uid()
  )
);

-- Initial Owner Policy: Allow workspace creators to set themselves as owners
CREATE POLICY "Initial owner can be set"
ON workspace_members FOR INSERT
TO authenticated
WITH CHECK (
  user_id = auth.uid() AND
  EXISTS (
    SELECT 1
    FROM workspaces
    WHERE id = workspace_id
    AND created_by = auth.uid()
  )
);

-- Management Policy: Owners and admins can update member details
CREATE POLICY "Owners and admins can manage members"
ON workspace_members FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 
    FROM workspace_members members
    WHERE members.workspace_id = workspace_id
    AND members.user_id = auth.uid()
    AND members.role IN ('owner', 'admin')
  )
);
```

These policies implement the following security rules:

1. **Workspace Creation**
   - Users can only create workspaces where they are marked as the creator
   - Initial owner creation is tied to workspace creation

2. **Workspace Access**
   - Only members can view workspaces they belong to
   - Owners and admins can update workspace details
   - Only owners can delete workspaces

3. **Member Management**
   - Members can view other members in their workspaces
   - Only workspace creators can set initial ownership
   - Owners and admins can update existing members

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

- Belongs to a workspace
- Tracks channel creation metadata
- Enforces unique channel names within each workspace
- Indexes support workspace channel listing and creator lookups

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

- Tracks channel membership and roles
- last_read_at enables unread message tracking
- Index supports finding all channels for a user

### Conversations (Direct Messages)

```sql
CREATE TABLE conversations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('direct', 'group')) DEFAULT 'direct',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX conversations_workspace_id_idx ON conversations(workspace_id);
```

- Supports both direct (2 people) and group messages
- Belongs to a workspace
- Index supports workspace conversation listing

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

- Tracks conversation participants
- last_read_at enables unread message tracking
- Index supports finding all conversations for a user

### Messages

```sql
CREATE TABLE messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
  channel_id UUID REFERENCES channels(id) ON DELETE CASCADE,
  user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  parent_id UUID REFERENCES messages(id) ON DELETE CASCADE,
  CONSTRAINT message_container_check CHECK (
    (conversation_id IS NULL AND channel_id IS NOT NULL) OR
    (conversation_id IS NOT NULL AND channel_id IS NULL)
  )
);

CREATE INDEX messages_conversation_id_idx ON messages(conversation_id);
CREATE INDEX messages_channel_id_idx ON messages(channel_id);
CREATE INDEX messages_user_id_idx ON messages(user_id);
CREATE INDEX messages_parent_id_idx ON messages(parent_id);
CREATE INDEX messages_thread_order_idx ON messages(parent_id, created_at);
CREATE INDEX messages_latest_channel_idx ON messages(channel_id, created_at DESC);
CREATE INDEX messages_latest_conversation_idx ON messages(conversation_id, created_at DESC);
```

- Unified messages table for both channels and conversations
- Threading support via parent_id
- CHECK constraint ensures message belongs to exactly one container
- Comprehensive indexes support various query patterns

These policies implement:

```sql
-- Messages RLS policies
CREATE POLICY "Users can read messages in their channels"
ON messages FOR SELECT
USING (
  (channel_id IN (
    SELECT channel_id FROM channel_members 
    WHERE user_id = auth.uid()
  ))
  OR
  (conversation_id IN (
    SELECT conversation_id FROM conversation_participants 
    WHERE user_id = auth.uid()
  ))
);

CREATE POLICY "Users can insert messages"
ON messages FOR INSERT
WITH CHECK (
  auth.uid() = user_id AND
  (
    -- For channel messages
    (channel_id IS NOT NULL AND
     EXISTS (
       SELECT 1 FROM channel_members
       WHERE channel_id = messages.channel_id
       AND user_id = auth.uid()
     ))
    OR
    -- For conversation messages
    (conversation_id IS NOT NULL AND
     EXISTS (
       SELECT 1 FROM conversation_participants
       WHERE conversation_id = messages.conversation_id
       AND user_id = auth.uid()
     ))
  )
);

CREATE POLICY "Users can update their own messages"
ON messages FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own messages"
ON messages FOR DELETE
USING (auth.uid() = user_id);
```

These policies ensure:
- Users can only read messages in channels/conversations they're members of
- Users can only send messages to channels/conversations they're members of
- Users can only edit/delete their own messages
- Message ownership is enforced through user_id field

## Functions

### Conversation Rules

```sql
CREATE OR REPLACE FUNCTION enforce_conversation_rules()
RETURNS TRIGGER AS $$
BEGIN
  -- For direct messages
  IF (SELECT type FROM conversations WHERE id = NEW.conversation_id) = 'direct' THEN
    -- Check if this would exceed 2 participants
    IF (
      SELECT COUNT(*) FROM conversation_participants 
      WHERE conversation_id = NEW.conversation_id
    ) >= 2 THEN
      RAISE EXCEPTION 'Direct messages can only have 2 participants';
    END IF;

    -- Check if DM already exists between these users
    IF EXISTS (
      SELECT 1 FROM conversations c
      JOIN conversation_participants cp1 ON cp1.conversation_id = c.id
      JOIN conversation_participants cp2 ON cp2.conversation_id = c.id
      WHERE c.workspace_id = (SELECT workspace_id FROM conversations WHERE id = NEW.conversation_id)
      AND c.type = 'direct'
      AND cp1.user_id = NEW.user_id
      AND cp2.user_id IN (
        SELECT user_id FROM conversation_participants 
        WHERE conversation_id = NEW.conversation_id
      )
      AND c.id != NEW.conversation_id
    ) THEN
      RAISE EXCEPTION 'A direct message conversation already exists between these users in this workspace';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
```

- Enforces DM rules at the database level
- Prevents duplicate DMs between the same users
- Ensures direct messages have exactly 2 participants

### Unread Counts

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

- Efficiently calculates unread message counts
- Used for displaying unread indicators in UI
- Leverages last_read_at timestamps

### Workspace Slug Generation

```sql
CREATE OR REPLACE FUNCTION generate_unique_workspace_slug(workspace_name TEXT)
RETURNS TEXT AS $$
DECLARE
  base_slug TEXT;
  new_slug TEXT;
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
  )
  INTO highest_number
  FROM workspaces
  WHERE slug ~ ('^' || base_slug || '-[0-9]+$');

  -- Use next number
  RETURN base_slug || '-' || (highest_number + 1)::TEXT;
END;
$$ LANGUAGE plpgsql;

-- Trigger function to handle slug generation/updates
CREATE OR REPLACE FUNCTION handle_workspace_slug()
RETURNS TRIGGER AS $$
BEGIN
  -- Only generate new slug if name changed or slug is null
  IF (TG_OP = 'INSERT') OR 
     (TG_OP = 'UPDATE' AND NEW.name <> OLD.name) OR
     (NEW.slug IS NULL) THEN
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

- Automatically generates URL-friendly slugs from workspace names
- Handles duplicate names by appending numbers
- Updates slug when workspace name changes
- Efficiently finds next available number for duplicates

### Channel Slug Generation

```sql
CREATE OR REPLACE FUNCTION generate_unique_channel_slug(channel_name TEXT, workspace_id_param UUID)
RETURNS TEXT AS $$
DECLARE
  base_slug TEXT;
  new_slug TEXT;
  highest_number INT;
BEGIN
  -- Convert to lowercase, replace spaces/special chars with hyphens
  base_slug := lower(regexp_replace(channel_name, '[^a-zA-Z0-9\s]', '', 'g'));
  base_slug := regexp_replace(base_slug, '\s+', '-', 'g');
  
  -- First try without a number
  IF NOT EXISTS (
    SELECT 1 FROM channels 
    WHERE workspace_id = workspace_id_param AND slug = base_slug
  ) THEN
    RETURN base_slug;
  END IF;

  -- Find highest number used for this base slug in this workspace
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

  -- Use next number
  RETURN base_slug || '-' || (highest_number + 1)::TEXT;
END;
$$ LANGUAGE plpgsql;

-- Trigger function to handle slug generation/updates
CREATE OR REPLACE FUNCTION handle_channel_slug()
RETURNS TRIGGER AS $$
BEGIN
  -- Only generate new slug if name changed or slug is null
  IF (TG_OP = 'INSERT') OR 
     (TG_OP = 'UPDATE' AND NEW.name <> OLD.name) OR
     (NEW.slug IS NULL) THEN
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

- Automatically generates URL-friendly slugs from channel names
- Handles duplicates efficiently using sequential numbers
- Updates slug when channel name changes
- Efficiently finds next available number for duplicates

## Design Decisions

1. **Unified Messages Table**
   - Single table for both channel and conversation messages
   - Simplifies querying and maintenance
   - CHECK constraint ensures message location integrity

2. **Simple Threading Model**
   - parent_id approach chosen for simplicity
   - Allows for nested threads if needed
   - Efficient indexing for thread queries

3. **Last Read Tracking**
   - Stored at member level (channel_members and conversation_participants)
   - Enables efficient unread count calculations
   - Supports real-time unread indicators

4. **Presence System**
   - Uses last_seen in profiles table
   - Simple but effective for basic online/offline status
   - Indexed for efficient presence queries

5. **Workspace Invites**
   - Built-in invite system with expiration
   - Supports revoking invites
   - Indexed for quick invite validation

6. **Real-time Considerations**
   - Indexes support efficient real-time queries
   - Optimized for latest message retrieval
   - Supports Supabase's real-time functionality

7. **Channel Name Uniqueness**
   - Enforces unique channel names within each workspace
   - Allows same channel name in different workspaces
   - Prevents confusion within a workspace

8. **Automatic Slug Generation**
   - Converts workspace names to URL-friendly slugs
   - Handles duplicates efficiently using sequential numbers
   - Maintains slug synchronization with workspace name changes

## Row Level Security (RLS)

All tables have RLS enabled for security:

```sql
ALTER TABLE workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspace_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE channel_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversation_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
```

## Real-time Enabled

Tables are added to Supabase's real-time publication:

```sql
ALTER PUBLICATION supabase_realtime ADD TABLE workspaces;
ALTER PUBLICATION supabase_realtime ADD TABLE workspace_members;
ALTER PUBLICATION supabase_realtime ADD TABLE channels;
ALTER PUBLICATION supabase_realtime ADD TABLE channel_members;
ALTER PUBLICATION supabase_realtime ADD TABLE conversations;
ALTER PUBLICATION supabase_realtime ADD TABLE conversation_participants;
ALTER PUBLICATION supabase_realtime ADD TABLE messages;
```

## Channel Policies and Automation

```sql
-- Enable RLS
ALTER TABLE channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE channel_members ENABLE ROW LEVEL SECURITY;

-- Channel access policies
CREATE POLICY "Members can view channels"
ON channels FOR SELECT
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM workspace_members
        WHERE workspace_id = channels.workspace_id
        AND user_id = auth.uid()
    )
);

CREATE POLICY "Members can create channels"
ON channels FOR INSERT
TO authenticated
WITH CHECK (
    EXISTS (
        SELECT 1 FROM workspace_members
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
    user_id = auth.uid() AND
    EXISTS (
        SELECT 1 FROM workspace_members wm
        JOIN channels c ON c.workspace_id = wm.workspace_id
        WHERE c.id = channel_id
        AND wm.user_id = auth.uid()
    )
);

-- Automatic General Channel Creation
CREATE OR REPLACE FUNCTION create_general_channel()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
    general_channel_id UUID;
BEGIN
    -- Create the general channel
    INSERT INTO channels (workspace_id, name, description, created_by)
    VALUES (
        NEW.id,
        'general',
        'The default channel for all workspace members',
        NEW.created_by
    )
    RETURNING id INTO general_channel_id;

    -- Add the creator as a member of the channel
    INSERT INTO channel_members (channel_id, user_id, role)
    VALUES (general_channel_id, NEW.created_by, 'admin');

    RETURN NEW;
END;
$$;

-- Auto-join New Members to General
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

-- Trigger Definitions
CREATE TRIGGER workspace_general_channel_trigger
AFTER INSERT ON workspaces
FOR EACH ROW
EXECUTE FUNCTION create_general_channel();

CREATE TRIGGER workspace_member_general_channel_trigger
AFTER INSERT ON workspace_members
FOR EACH ROW
EXECUTE FUNCTION auto_join_general_channel();
```

These policies and triggers implement:

1. **Channel Access Control**:
   - Workspace members can view all channels in their workspace
   - Members can create new channels
   - Anyone can view channel member lists
   - Members can only join channels in their workspaces

2. **Automatic Channel Management**:
   - Each new workspace automatically gets a 'general' channel
   - Workspace creator becomes admin of 'general'
   - New workspace members are automatically added to 'general'

3. **Security Implementation**:
   - Regular operations are controlled by RLS policies
   - System operations (general channel creation/auto-join) use `SECURITY DEFINER`
   - Search path is explicitly set for security
   - Triggers run with elevated privileges to bypass RLS for system tasks