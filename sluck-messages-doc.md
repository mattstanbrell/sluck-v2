# Messages Implementation Documentation

## Overview
The messages implementation in this Slack clone provides real-time messaging capabilities with support for channels, direct messages, threads, markdown formatting, code highlighting, and message reactions. This document details the complete implementation.

## Database Schema

Messages are stored in the `messages` table with the following structure:
```sql
create table messages (
  id uuid primary key default uuid_generate_v4(),
  conversation_id uuid references conversations(id) on delete cascade,
  channel_id uuid references channels(id) on delete cascade,
  user_id uuid references users(id) on delete cascade,
  recipient_id uuid references users(id) on delete cascade,
  parent_id uuid references messages(id) on delete cascade,
  thread_participant boolean default false,
  content text not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  constraint message_container_check check (
    (conversation_id is null and channel_id is not null) or
    (conversation_id is not null and channel_id is null)
  )
);
```

## Components Architecture

### 1. MessageList Component (`MessageList.tsx`)

#### State Management
- Uses `useState` to manage messages array and member count
- Messages include sender information and thread summaries
- Tracks member count for empty state handling

#### Real-time Subscription
```typescript
const channel = client
  .channel("messages")
  .on(
    "postgres_changes",
    {
      event: "*",
      schema: "public",
      table: "messages",
      filter: channelId
        ? `channel_id=eq.${channelId}`
        : `conversation_id=eq.${conversationId}`,
    },
    () => {
      fetchMessages();
    },
  )
  .subscribe();
```

#### Auto-scrolling
- Uses `useRef` to track message list end
- Automatically scrolls to bottom when new messages arrive
- Smooth scrolling behavior implemented

#### Thread Support
- Shows thread summary with participant avatars
- Displays reply count
- Links to thread view via router

### 2. MessageInput Component (`MessageInput.tsx`)

#### Features
- Markdown toolbar with formatting options
- Resizable input area
- Real-time input handling
- Enter to send, Shift+Enter for new line

#### Markdown Controls
- Bold: `**text**`
- Italic: `*text*`
- Lists: `\n- item`
- Inline Code: `` `code` ``
- Code Block: ` ```\ncode\n``` `
- Links: `[text](url)`

#### Message Sending
```typescript
const sendMessage = async (e: FormEvent) => {
  // ... validation ...
  await client.from("messages").insert({
    content: message.trim(),
    channel_id: channelId,
    conversation_id: conversationId,
    user_id: session.user.id,
    parent_id: parentId,
    thread_participant: parentId ? true : undefined,
  });
  
  // Update conversation timestamp if in DM
  if (conversationId) {
    await client
      .from("conversations")
      .update({
        last_message_at: new Date().toISOString(),
      })
      .eq("id", conversationId);
  }
};
```

### 3. MessageContent Component (`MessageContent.tsx`)

#### Markdown Rendering
- Uses `react-markdown` for rendering
- Custom code block handling with syntax highlighting
- Supports common markdown syntax

#### Code Highlighting
- Uses `highlight.js` for syntax highlighting
- Supports multiple languages:
  - JavaScript
  - TypeScript
  - Python
  - Bash
  - SQL
  - JSON
  - HTML
  - CSS

### 4. MessageTimestamp Component (`MessageTimestamp.tsx`)

#### Time Formatting Logic
- Today: Shows time only (HH:mm)
- Yesterday: "Yesterday, HH:mm"
- Within last week: "DayName, HH:mm"
- Older: "DD/MM/YYYY, HH:mm"

## API Routes

### Message Operations

#### Create Message
- **POST** `/api/messages`
- Required fields: `content`, `channelId` or `conversationId`
- Optional: `parentId` for threads

#### Update Message
- **PATCH** `/api/messages/[id]`
- Only original author can edit
- Updates `content` and `updated_at`

#### Delete Message
- **DELETE** `/api/messages/[id]`
- Author or admin can delete
- Cascades to thread replies

#### Message Reactions
- **POST** `/api/messages/[id]/reactions`
- Toggle emoji reactions
- Tracks user-emoji combinations

## Security

### Row Level Security
```sql
-- Read access
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

-- Write access
CREATE POLICY "Users can create messages"
  ON messages FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Update access
CREATE POLICY "Users can update their own messages"
  ON messages FOR UPDATE
  USING (auth.uid() = user_id);
```

## UI/UX Details

### Message Grouping
- Messages from same user within short time grouped
- Shows user avatar and name only for group start
- Hover timestamp on grouped messages

### Thread UI
- Thread indicator shows:
  - Reply count
  - Up to 3 participant avatars
  - "..." indicator for more participants
- Click anywhere on thread summary to open

### Input Resizing
- Drag handle at top of input
- Min height: 144px
- Max height: 50% of viewport
- Persists size during session


## Performance Considerations

### Message Loading
- Initial fetch on component mount
- Real-time updates via Supabase subscription
- Efficient re-renders with React hooks

### Optimizations
- Memoized timestamp formatting
- Debounced input handling
- Efficient message grouping
- Lazy loading of syntax highlighter

This implementation provides a robust, real-time messaging system with modern features while maintaining good performance and security practices. 