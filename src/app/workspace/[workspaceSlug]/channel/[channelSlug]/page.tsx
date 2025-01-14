"use client";

import { createClient } from "@/utils/supabase/client";
import { notFound } from "next/navigation";
import { ChannelContent } from "@/components/channel/ChannelContent";
import { UnjoinedChannelView } from "@/components/channel/UnjoinedChannelView";
import { useParams, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

interface ChannelData {
	id: string;
	name: string;
	description: string | null;
}

export default function ChannelPage() {
	const params = useParams();
	const searchParams = useSearchParams();
	const [channel, setChannel] = useState<ChannelData | null>(null);
	const [isMember, setIsMember] = useState<boolean | null>(null);
	const [isLoading, setIsLoading] = useState(true);

	useEffect(() => {
		async function loadChannel() {
			const supabase = createClient();
			const channelId = searchParams.get("channelId");
			const channelName = searchParams.get("channelName");
			const description = searchParams.get("description");
			const isMemberParam = searchParams.get("isMember");

			// If we have search params, use them
			if (channelId && channelName) {
				setChannel({
					id: channelId,
					name: channelName,
					description: description,
				});
				setIsMember(isMemberParam === "true");
				setIsLoading(false);
				return;
			}

			// Otherwise, fetch from database
			const { workspaceSlug, channelSlug } = params;

			// Get workspace ID from slug
			const { data: workspace } = await supabase
				.from("workspaces")
				.select("id, name")
				.eq("slug", workspaceSlug)
				.single();

			if (!workspace) {
				notFound();
			}

			// Get channel data
			const { data: channelData } = await supabase
				.from("channels")
				.select("id, name, description")
				.eq("workspace_id", workspace.id)
				.eq("slug", channelSlug)
				.single();

			if (!channelData) {
				notFound();
			}

			// Check membership
			const { data: membership } = await supabase
				.from("channel_members")
				.select("role")
				.eq("channel_id", channelData.id)
				.eq("user_id", (await supabase.auth.getUser()).data.user?.id)
				.single();

			setChannel(channelData);
			setIsMember(!!membership);
			setIsLoading(false);
		}

		loadChannel();
	}, [params, searchParams]);

	if (isLoading) {
		return <div>Loading...</div>;
	}

	if (!channel) {
		return notFound();
	}

	if (!isMember) {
		return (
			<UnjoinedChannelView channelId={channel.id} channelName={channel.name} />
		);
	}

	return <ChannelContent channel={channel} />;
}
