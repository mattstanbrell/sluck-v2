import { createClient } from "@/utils/supabase/server";
import { notFound } from "next/navigation";
import { MessageContainer } from "@/components/messages/MessageContainer";

export default async function ChannelPage({
	params,
}: {
	params: Promise<{ workspaceSlug: string; channelSlug: string }>;
}) {
	const { workspaceSlug, channelSlug } = await params;
	const supabase = await createClient();

	// Get workspace ID from slug
	const { data: workspace } = await supabase
		.from("workspaces")
		.select("id, name")
		.eq("slug", workspaceSlug)
		.single();

	if (!workspace) {
		notFound();
	}

	// Get channel from slug
	const { data: channel } = await supabase
		.from("channels")
		.select("id, name, description")
		.eq("workspace_id", workspace.id)
		.eq("slug", channelSlug)
		.single();

	if (!channel) {
		notFound();
	}

	return (
		<div className="flex flex-col h-full">
			{/* Channel Header */}
			<div className="shrink-0">
				<div className="px-4 py-[22px] flex items-center">
					<h1 className="font-semibold px-1">{channel.name}</h1>
				</div>
				<div className="mx-4 border-t border-custom-ui-medium" />
			</div>

			{/* Messages */}
			<div className="flex-1 min-h-0">
				<MessageContainer channelId={channel.id} />
			</div>
		</div>
	);
}
