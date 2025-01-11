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
    <div className="flex flex-col h-full bg-[#FFFCF0]">
      <div className="flex-1 overflow-y-auto min-h-0">
        <MessageList channelId={channelId} conversationId={conversationId} />
      </div>
      <MessageInput channelId={channelId} conversationId={conversationId} />
    </div>
  )
} 