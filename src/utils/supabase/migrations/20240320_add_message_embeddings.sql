-- Add vector extension if not already installed
CREATE EXTENSION IF NOT EXISTS vector;

-- Add embedding column to messages table
ALTER TABLE messages ADD COLUMN IF NOT EXISTS embedding vector(1536); 