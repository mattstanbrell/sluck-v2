'use client'

import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/utils/supabase/client'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import type { Database } from '@/lib/database.types'
import ReactMarkdown from 'react-markdown'

type Profile = {
  id: string
  full_name: string | null
  display_name: string | null
  avatar_url: string | null
}

type Message = {
  id: string
  content: string
  created_at: string
  user_id: string
  channel_id: string | null
  conversation_id: string | null
  parent_id: string | null
  thread_participant: boolean | null
  profile: Profile
}

type DatabaseMessage = Database['public']['Tables']['messages']['Row'] & {
  profile: Profile
}

export function MessageList({
  channelId,
  conversationId,
}: {
  channelId?: string
  conversationId?: string
}) {
  const [messages, setMessages] = useState<Message[]>([])
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const supabase = createClient()

  useEffect(() => {
    // Fetch initial messages
    const fetchMessages = async () => {
      // Get the current user
      const { data: { user }, error: userError } = await supabase.auth.getUser()
      if (userError) {
        console.error('Error getting user:', userError)
        return
      }
      if (!user) {
        console.error('No user found')
        return
      }

      // Verify channel/conversation membership
      if (channelId) {
        const { data: membership, error: membershipError } = await supabase
          .from('channel_members')
          .select('channel_id')
          .eq('channel_id', channelId)
          .eq('user_id', user.id)
          .single()

        if (membershipError || !membership) {
          console.error('Not a member of this channel')
          return
        }
      } else if (conversationId) {
        const { data: membership, error: membershipError } = await supabase
          .from('conversation_participants')
          .select('conversation_id')
          .eq('conversation_id', conversationId)
          .eq('user_id', user.id)
          .single()

        if (membershipError || !membership) {
          console.error('Not a participant in this conversation')
          return
        }
      }

      // Fetch messages with profiles
      const { data, error } = await supabase
        .from('messages')
        .select(`
          *,
          profile:profiles (
            id,
            full_name,
            display_name,
            avatar_url
          )
        `)
        .eq(channelId ? 'channel_id' : 'conversation_id', channelId || conversationId)
        .order('created_at', { ascending: true })
        .limit(50)

      if (error) {
        console.error('Error fetching messages:', error)
        return
      }

      // Transform the data to match our Message type
      const transformedMessages = (data as DatabaseMessage[]).map((msg) => ({
        ...msg,
        profile: msg.profile || {
          id: msg.user_id,
          full_name: 'Unknown User',
          display_name: null,
          avatar_url: null,
        },
      }))

      setMessages(transformedMessages)
      scrollToBottom()
    }

    fetchMessages()

    // Subscribe to new messages
    const channel = supabase
      .channel('messages')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: channelId
            ? `channel_id=eq.${channelId}`
            : `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          // Fetch the complete message with profile
          const fetchNewMessage = async () => {
            const { data, error } = await supabase
              .from('messages')
              .select(`
                *,
                profiles!inner (
                  id,
                  full_name,
                  display_name,
                  avatar_url
                )
              `)
              .eq('id', payload.new.id)
              .single()

            if (error) {
              console.error('Error fetching new message:', error)
              return
            }

            // Transform the new message to match our Message type
            const transformedMessage: Message = {
              ...(data as DatabaseMessage),
              profile: data.profiles?.[0] || {
                id: data.user_id,
                full_name: 'Unknown User',
                display_name: null,
                avatar_url: null,
              },
            }

            setMessages((prev) => [...prev, transformedMessage])
            scrollToBottom()
          }

          fetchNewMessage()
        }
      )
      .subscribe()

    return () => {
      channel.unsubscribe()
    }
  }, [channelId, conversationId, supabase])

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp)
    const hours = date.getHours().toString().padStart(2, '0')
    const minutes = date.getMinutes().toString().padStart(2, '0')
    return `${hours}:${minutes}`
  }

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
  }

  return (
    <div className="flex flex-col gap-4 p-4">
      {messages.map((message, index) => {
        const prevMessage = index > 0 ? messages[index - 1] : null
        const showHeader =
          !prevMessage ||
          prevMessage.user_id !== message.user_id ||
          new Date(message.created_at).getTime() -
            new Date(prevMessage.created_at).getTime() >
            5 * 60 * 1000 // 5 minutes

        return (
          <div
            key={message.id}
            className={`group relative ${
              showHeader ? 'mt-6' : 'mt-0.5'
            } hover:bg-custom-background-secondary -mx-4 px-4 py-1`}
          >
            <div className="flex items-start gap-2">
              <div className="w-8 h-8 flex-shrink-0">
                {showHeader ? (
                  <Avatar>
                    <AvatarImage
                      src={message.profile.avatar_url || undefined}
                      alt={message.profile.display_name || message.profile.full_name || ''}
                    />
                    <AvatarFallback>
                      {getInitials(
                        message.profile.display_name || message.profile.full_name || ''
                      )}
                    </AvatarFallback>
                  </Avatar>
                ) : (
                  <div className="relative">
                    <span className="absolute left-0 top-2 opacity-0 group-hover:opacity-100 text-xs text-custom-text-tertiary">
                      {formatTimestamp(message.created_at)}
                    </span>
                  </div>
                )}
              </div>
              <div className="flex-1 min-w-0">
                {showHeader && (
                  <div className="flex items-baseline gap-2 mb-1">
                    <span className="font-medium text-custom-text">
                      {message.profile.display_name || message.profile.full_name}
                    </span>
                    <span className="text-xs text-custom-text-tertiary">
                      {formatTimestamp(message.created_at)}
                    </span>
                  </div>
                )}
                <div
                  className={`prose prose-sm max-w-none text-custom-text prose-pre:bg-custom-background-secondary prose-pre:text-custom-text prose-code:text-custom-text prose-code:bg-custom-background-secondary ${
                    !showHeader ? 'pl-[40px]' : ''
                  }`}
                >
                  <ReactMarkdown>{message.content}</ReactMarkdown>
                </div>
              </div>
            </div>
          </div>
        )
      })}
      <div ref={messagesEndRef} />
    </div>
  )
} 