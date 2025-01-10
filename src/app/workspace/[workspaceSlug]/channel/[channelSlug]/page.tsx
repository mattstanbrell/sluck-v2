import { createClient } from '@/utils/supabase/server'
import { notFound } from 'next/navigation'

export default async function ChannelPage({
  params
}: {
  params: Promise<{ workspaceSlug: string; channelSlug: string }>
}) {
  const { workspaceSlug, channelSlug } = await params
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

  // Get channel from slug
  const { data: channel } = await supabase
    .from('channels')
    .select('id, name, description')
    .eq('workspace_id', workspace.id)
    .eq('slug', channelSlug)
    .single()

  if (!channel) {
    notFound()
  }

  return (
    <div className="flex-1 flex flex-col">
      {/* Channel Header */}
      <div className="border-b border-border p-4">
        <div className="flex items-center">
          <span className="text-muted-foreground">#</span>
          <h1 className="font-semibold ml-2">{channel.name}</h1>
        </div>
        {channel.description && (
          <p className="text-sm text-muted-foreground mt-1">{channel.description}</p>
        )}
      </div>

      {/* Message List */}
      <div className="flex-1 overflow-auto p-4">
        {/* Messages will go here */}
      </div>

      {/* Message Input */}
      <div className="border-t border-border p-4">
        <div className="bg-accent/50 rounded-lg p-2">
          <input
            type="text"
            placeholder={`Message #${channel.name}`}
            className="bg-transparent w-full focus:outline-none"
          />
        </div>
      </div>
    </div>
  )
} 