import { createClient } from "@/utils/supabase/server";
import { notFound } from "next/navigation";
import { ChannelContent } from "@/components/channel/ChannelContent";

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

	return <ChannelContent channel={channel} />;
}
