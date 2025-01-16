-- Add context column to messages table
ALTER TABLE messages ADD COLUMN IF NOT EXISTS context TEXT; 