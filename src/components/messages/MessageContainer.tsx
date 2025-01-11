'use client'

import { MessageList } from '@/components/messages/MessageList'
import { MessageInput } from '@/components/messages/MessageInput'

export function MessageContainer({
  channelId,
  conversationId,
}: {
  channelId?: string
  conversationId?: string
}) {
  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto min-h-0">
        <MessageList channelId={channelId} conversationId={conversationId} />
      </div>
      <div className="shrink-0">
        <MessageInput channelId={channelId} conversationId={conversationId} />
      </div>
    </div>
  )
} 