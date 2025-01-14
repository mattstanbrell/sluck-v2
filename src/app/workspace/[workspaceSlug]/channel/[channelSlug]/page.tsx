import { createClient } from "@/utils/supabase/server";
import { notFound } from "next/navigation";
import { ChannelContent } from "@/components/channel/ChannelContent";
import { UnjoinedChannelView } from "@/components/channel/UnjoinedChannelView";

export default async function ChannelPage({
	params,
}: {
	params: Promise<{ workspaceSlug: string; channelSlug: string }>;
}) {
	const { workspaceSlug, channelSlug } = await params;
	const supabase = await createClient();

	// Get workspace ID from slug - this is essential for authorization
	const { data: workspace } = await supabase
		.from("workspaces")
		.select("id, name")
		.eq("slug", workspaceSlug)
		.single();

	if (!workspace) {
		notFound();
	}

	// Get only the essential channel data needed for initial render
	const { data: channel } = await supabase
		.from("channels")
		.select("id, name, description")
		.eq("workspace_id", workspace.id)
		.eq("slug", channelSlug)
		.single();

	if (!channel) {
		notFound();
	}

	// Check if the user is a member of this channel
	const { data: membership } = await supabase
		.from("channel_members")
		.select("role")
		.eq("channel_id", channel.id)
		.eq("user_id", (await supabase.auth.getUser()).data.user?.id)
		.single();

	// If not a member, show the unjoined view
	if (!membership) {
		return (
			<UnjoinedChannelView
				channelId={channel.id}
				channelName={channel.name}
				workspaceId={workspace.id}
			/>
		);
	}

	// Otherwise, show the normal channel content
	return <ChannelContent channel={channel} />;
}
