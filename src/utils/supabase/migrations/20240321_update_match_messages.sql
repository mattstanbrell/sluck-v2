-- Drop the existing function
DROP FUNCTION IF EXISTS public.match_messages(vector, double precision, integer);

-- Create the new function with the updated return type
CREATE OR REPLACE FUNCTION public.match_messages(
  query_embedding vector,
  match_threshold double precision,
  match_count integer
)
RETURNS TABLE(
  id uuid,
  conversation_id uuid,
  channel_id uuid,
  user_id uuid,
  content text,
  context text,
  similarity double precision
)
LANGUAGE sql
STABLE
AS $function$
  SELECT
    m.id,
    m.conversation_id,
    m.channel_id,
    m.user_id,
    m.content,
    m.context,
    1 - (m.embedding <=> query_embedding) AS similarity
  FROM messages m
  WHERE 1 - (m.embedding <=> query_embedding) > match_threshold
  ORDER BY (m.embedding <=> query_embedding)
  LIMIT match_count;
$function$; 