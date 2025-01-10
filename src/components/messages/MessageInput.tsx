'use client'

import { useState, useRef, useEffect } from 'react'
import { createClient } from '@/utils/supabase/client'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Bold, Italic, List, Code, Link2, Terminal } from 'lucide-react'
import type { Database } from '@/lib/database.types'

type MessageInsert = Database['public']['Tables']['messages']['Insert']

export function MessageInput({
  channelId,
  conversationId,
  parentId
}: {
  channelId?: string
  conversationId?: string
  parentId?: string
}) {
  const [content, setContent] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const supabase = createClient()
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const isResizingRef = useRef(false)
  const startHeightRef = useRef(0)
  const startYRef = useRef(0)

  useEffect(() => {
    textareaRef.current?.focus()
  }, [])

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizingRef.current || !containerRef.current) return

      const dy = startYRef.current - e.clientY
      const newHeight = Math.min(
        Math.max(startHeightRef.current + dy, 144),
        window.innerHeight * 0.5
      )
      containerRef.current.style.height = `${newHeight}px`
    }

    const handleMouseUp = () => {
      isResizingRef.current = false
      document.documentElement.style.userSelect = ''
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)

    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [])

  const handleResizeStart = (e: React.MouseEvent) => {
    if (!containerRef.current) return
    isResizingRef.current = true
    startHeightRef.current = containerRef.current.offsetHeight
    startYRef.current = e.clientY
    document.documentElement.style.userSelect = 'none'
  }

  const insertMarkdown = (prefix: string, suffix: string = prefix) => {
    const textarea = textareaRef.current
    if (!textarea) return

    const start = textarea.selectionStart
    const end = textarea.selectionEnd
    const text = textarea.value
    const before = text.substring(0, start)
    const selection = text.substring(start, end)
    const after = text.substring(end)

    const newText = before + prefix + selection + suffix + after
    setContent(newText)

    // Force React to update the textarea value
    setTimeout(() => {
      textarea.focus()
      textarea.setSelectionRange(
        start + prefix.length,
        end + prefix.length
      )
    }, 0)
  }

  const insertCodeBlock = () => {
    const textarea = textareaRef.current
    if (!textarea) return

    const start = textarea.selectionStart
    const end = textarea.selectionEnd
    const text = textarea.value
    const before = text.substring(0, start)
    const selection = text.substring(start, end)
    const after = text.substring(end)

    const needsNewlineBefore = before.length > 0 && !before.endsWith('\n')
    const needsNewlineAfter = after.length > 0 && !after.startsWith('\n')

    const prefix = needsNewlineBefore ? '\n```\n' : '```\n'
    const suffix = needsNewlineAfter ? '\n```\n' : '\n```'

    const newText = before + prefix + selection + suffix + after
    setContent(newText)

    setTimeout(() => {
      textarea.focus()
      const newCursorPos = start + prefix.length
      textarea.setSelectionRange(newCursorPos, newCursorPos + selection.length)
    }, 0)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!content.trim() || isSubmitting) return

    setIsSubmitting(true)
    try {
      // Get the current user
      const { data: { user }, error: userError } = await supabase.auth.getUser()
      if (userError) throw userError
      if (!user) throw new Error('Not authenticated')

      const messageData: MessageInsert = {
        content: content.trim(),
        channel_id: channelId,
        conversation_id: conversationId,
        parent_id: parentId,
        thread_participant: parentId ? true : undefined,
        user_id: user.id,
      }

      const { error } = await supabase
        .from('messages')
        .insert(messageData)

      if (error) throw error

      // Update conversation's last_message_at if it's a DM
      if (conversationId) {
        await supabase
          .from('conversations')
          .update({
            last_message_at: new Date().toISOString(),
          })
          .eq('id', conversationId)
      }

      setContent('')
    } catch (error) {
      console.error('Error sending message:', error)
    } finally {
      setIsSubmitting(false)
      textareaRef.current?.focus()
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit(e as unknown as React.FormEvent)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="relative">
      <div
        ref={containerRef}
        className="min-h-[144px] max-h-[50vh] border-t border-custom-ui-medium relative bg-custom-background-secondary"
        style={{ height: '144px' }}
      >
        <div
          className="absolute -top-1 left-0 right-0 h-2 cursor-row-resize hover:bg-custom-ui-medium"
          onMouseDown={handleResizeStart}
        />
        <div className="p-4 space-y-2 h-full flex flex-col">
          <div className="flex gap-1">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => insertMarkdown('**')}
              title="Bold"
              className="text-custom-text hover:bg-custom-ui-medium hover:text-custom-text"
            >
              <Bold className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => insertMarkdown('*')}
              title="Italic"
              className="text-custom-text hover:bg-custom-ui-medium hover:text-custom-text"
            >
              <Italic className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => insertMarkdown('\n- ')}
              title="List"
              className="text-custom-text hover:bg-custom-ui-medium hover:text-custom-text"
            >
              <List className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => insertMarkdown('`')}
              title="Inline Code"
              className="text-custom-text hover:bg-custom-ui-medium hover:text-custom-text"
            >
              <Code className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={insertCodeBlock}
              title="Code Block"
              className="text-custom-text hover:bg-custom-ui-medium hover:text-custom-text"
            >
              <Terminal className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => insertMarkdown('[', '](url)')}
              title="Link"
              className="text-custom-text hover:bg-custom-ui-medium hover:text-custom-text"
            >
              <Link2 className="h-4 w-4" />
            </Button>
          </div>
          <Textarea
            ref={textareaRef}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a message... (Markdown supported)"
            className="flex-1 resize-none focus-visible:ring-0 focus-visible:ring-offset-0 border-0 bg-custom-background text-custom-text placeholder:text-custom-text-secondary"
          />
        </div>
      </div>
    </form>
  )
} 