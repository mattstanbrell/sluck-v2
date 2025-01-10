'use client'

import { Settings } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { createClient } from '@/utils/supabase/client'
import { useEffect, useState } from 'react'
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar'
import { useRouter } from 'next/navigation'

interface WorkspaceData {
  name: string
  slug: string
}

interface Channel {
  id: string
  name: string
  slug: string
}

interface UserProfile {
  full_name: string
  display_name: string | null
  avatar_url: string | null
}

export function Sidebar({ workspaceId }: { workspaceId: string }) {
  const [workspace, setWorkspace] = useState<WorkspaceData | null>(null)
  const [channels, setChannels] = useState<Channel[]>([])
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const supabase = createClient()
  const router = useRouter()

  useEffect(() => {
    async function loadData() {
      // Get current user
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      // Load workspace
      const { data: workspace } = await supabase
        .from('workspaces')
        .select('name, slug')
        .eq('id', workspaceId)
        .single()
      
      // Load channels
      const { data: channels } = await supabase
        .from('channels')
        .select('id, name, slug')
        .eq('workspace_id', workspaceId)

      // Load user profile
      const { data: profile } = await supabase
        .from('profiles')
        .select('full_name, display_name, avatar_url')
        .eq('id', user.id)
        .single()

      console.log('Profile data:', profile)
      console.log('Avatar URL:', profile?.avatar_url)
      
      setWorkspace(workspace)
      setChannels(channels || [])
      setProfile(profile)
    }
    
    loadData()
  }, [workspaceId])

  // Get display name in order of preference: display_name -> full_name -> 'User'
  const displayName = profile?.display_name || profile?.full_name || 'User'
  
  // Get initials from full name
  const initials = profile?.full_name
    ?.split(' ')
    .map(n => n[0])
    .slice(0, 2)
    .join('')
    .toUpperCase() || 'U'

  return (
    <div className="w-64 bg-custom-background-secondary border-r border-custom-ui-medium flex flex-col">
      {/* Workspace Header */}
      <div className="p-4 flex items-center justify-between">
        <h1 className="font-semibold text-lg text-custom-text">{workspace?.name || 'Loading...'}</h1>
        <Button variant="ghost" size="icon" className="text-custom-text-secondary hover:text-custom-text hover:bg-custom-ui-faint">
          <Settings className="w-4 h-4" />
        </Button>
      </div>
      <div className="mx-4 border-t border-custom-ui-medium" />

      {/* Channels Section */}
      <div className="flex-1 p-4 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-medium text-sm text-custom-text-secondary">Channels</h2>
          <Button variant="ghost" size="icon" className="w-4 h-4 text-custom-text-secondary hover:text-custom-text hover:bg-custom-ui-faint">
            <span className="text-xs">+</span>
          </Button>
        </div>
        <nav className="space-y-1">
          {channels.map(channel => (
            <a
              key={channel.id}
              href={`/workspace/${workspace?.slug}/channel/${channel.slug}`}
              className="flex items-center px-2 py-1 text-sm rounded-md hover:bg-custom-ui-faint group"
            >
              <span className="text-custom-text-tertiary group-hover:text-custom-text-secondary">#</span>
              <span className="ml-2 text-custom-text-secondary group-hover:text-custom-text">{channel.name}</span>
            </a>
          ))}
        </nav>

        {/* Direct Messages Section */}
        <div>
          <h2 className="font-medium text-sm text-custom-text-secondary mb-2">Direct Messages</h2>
          <nav className="space-y-1">
            {/* Will implement DM list later */}
          </nav>
        </div>
      </div>

      {/* User Section */}
      <div className="p-4 mt-auto">
        <div className="mx-4 border-t border-custom-ui-medium mb-4" />
        <div className="flex items-center justify-between">
          <div className="flex items-center">
            <Avatar className="h-8 w-8">
              <AvatarImage src={profile?.avatar_url || undefined} alt={displayName} />
              <AvatarFallback className="bg-custom-ui-strong text-custom-text-secondary">
                {initials}
              </AvatarFallback>
            </Avatar>
            <span className="ml-2 text-sm text-custom-text">{displayName}</span>
          </div>
          <Button 
            variant="ghost" 
            size="sm"
            onClick={async () => {
              await supabase.auth.signOut()
              router.push('/auth')
            }}
            className="text-custom-text-secondary hover:text-custom-text hover:bg-custom-ui-faint"
          >
            Sign Out
          </Button>
        </div>
      </div>
    </div>
  )
} 