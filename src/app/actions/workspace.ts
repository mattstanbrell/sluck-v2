'use server'

import { createClient } from '@/utils/supabase/server'
import { revalidatePath } from 'next/cache'

export async function createWorkspace(name: string) {
  const supabase = await createClient()
  
  // Get the current user
  const { data: { user }, error: userError } = await supabase.auth.getUser()
  if (userError || !user) {
    console.error('Auth error:', userError)
    throw new Error('Unauthorized')
  }
  console.log('Current user:', user.id)

  // Start with workspace creation
  console.log('Attempting to create workspace:', name)
  const { data: workspace, error: workspaceError } = await supabase
    .from('workspaces')
    .insert({
      name,
      created_by: user.id,
    })
    .select()
    .single()

  if (workspaceError) {
    console.error('Workspace creation error:', workspaceError)
    throw new Error(workspaceError.message)
  }
  console.log('Workspace created:', workspace)

  // Add the creator as an owner
  console.log('Attempting to add creator as owner')
  const { data: member, error: memberError } = await supabase
    .from('workspace_members')
    .insert({
      workspace_id: workspace.id,
      user_id: user.id,
      role: 'owner'
    })
    .select()
    .single()

  if (memberError) {
    console.error('Member creation error:', memberError)
    // If member creation fails, clean up the workspace
    console.log('Cleaning up workspace due to member creation failure')
    await supabase.from('workspaces').delete().eq('id', workspace.id)
    throw new Error('Failed to setup workspace membership')
  }
  console.log('Member added:', member)

  revalidatePath('/')
  return workspace
} 