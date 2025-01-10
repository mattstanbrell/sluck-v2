import { createClient } from '@/utils/supabase/server'
import { notFound } from 'next/navigation'
import { MessageContainer } from '@/components/messages/MessageContainer'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'

type ConversationParticipant = {
  user_id: string
  profiles: {
    full_name: string
    display_name: string | null
    avatar_url: string | null
  }
}

type Conversation = {
  id: string
  type: 'direct' | 'group'
  conversation_participants: ConversationParticipant[]
}

export default async function ConversationPage({
  params
}: {
  params: Promise<{ workspaceSlug: string; conversationId: string }>
}) {
  const { workspaceSlug, conversationId } = await params
  const supabase = await createClient()

  // Get workspace ID from slug
  const { data: workspace } = await supabase
    .from('workspaces')
    .select('id, name')
    .eq('slug', workspaceSlug)
    .single()

  if (!workspace) {
    notFound()
  }

  // Get conversation and participants
  const { data: conversation } = await supabase
    .from('conversations')
    .select(`
      id,
      type,
      conversation_participants!inner (
        user_id,
        profiles!inner (
          full_name,
          display_name,
          avatar_url
        )
      )
    `)
    .eq('id', conversationId)
    .eq('workspace_id', workspace.id)
    .single() as { data: Conversation | null }

  if (!conversation) {
    notFound()
  }

  // Get current user
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    notFound()
  }

  // Get the other participant's profile for DM header
  const otherParticipants = conversation.conversation_participants.filter(
    participant => participant.user_id !== user.id
  )

  return (
    <div className="flex-1 flex flex-col">
      {/* Conversation Header */}
      <div className="border-b border-border p-4">
        <div className="flex items-center gap-3">
          {conversation.type === 'direct' && otherParticipants[0] && (
            <>
              <Avatar>
                <AvatarImage
                  src={otherParticipants[0].profiles.avatar_url || undefined}
                  alt={otherParticipants[0].profiles.display_name || otherParticipants[0].profiles.full_name}
                />
                <AvatarFallback>
                  {(otherParticipants[0].profiles.display_name || otherParticipants[0].profiles.full_name)
                    .split(' ')
                    .map((n: string) => n[0])
                    .join('')
                    .toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <h1 className="font-semibold">
                {otherParticipants[0].profiles.display_name || otherParticipants[0].profiles.full_name}
              </h1>
            </>
          )}
        </div>
      </div>

      {/* Messages */}
      <MessageContainer conversationId={conversationId} />
    </div>
  )
} 