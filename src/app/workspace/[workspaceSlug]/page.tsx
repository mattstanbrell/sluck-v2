import { redirect } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'

export default async function WorkspacePage({
  params
}: {
  params: Promise<{ workspaceSlug: string }>
}) {
  const { workspaceSlug } = await params
  // Redirect to the general channel
  redirect(`/workspace/${workspaceSlug}/channel/general`)
} 