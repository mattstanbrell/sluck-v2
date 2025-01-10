'use client'

import { MessageList } from './MessageList'
import { MessageInput } from './MessageInput'

export function MessageContainer({
  channelId,
  conversationId,
}: {
  channelId?: string
  conversationId?: string
}) {
  return (
    <div className="flex flex-col h-[calc(100vh-3.5rem)] bg-[#FFFCF0]">
      <div className="flex-1 overflow-y-auto">
        <MessageList channelId={channelId} conversationId={conversationId} />
      </div>
      <MessageInput channelId={channelId} conversationId={conversationId} />
    </div>
  )
} 