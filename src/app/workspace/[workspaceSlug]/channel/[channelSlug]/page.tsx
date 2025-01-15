"use client";

import { createClient } from "@/utils/supabase/client";
import { notFound } from "next/navigation";
import { ChannelContent } from "@/components/channel/ChannelContent";
import { UnjoinedChannelView } from "@/components/channel/UnjoinedChannelView";
import { useParams, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { logDB } from "@/utils/logging";

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
	const [workspaceId, setWorkspaceId] = useState<string | null>(null);

	useEffect(() => {
		async function loadChannel() {
			const supabase = createClient();
			const channelId = searchParams.get("channelId");
			const channelName = searchParams.get("channelName");
			const description = searchParams.get("description");
			const isMemberParam = searchParams.get("isMember");
			const workspaceIdParam = searchParams.get("workspaceId");

			// If we have search params, use them
			if (channelId && channelName && workspaceIdParam) {
				setChannel({
					id: channelId,
					name: channelName,
					description: description,
				});
				setWorkspaceId(workspaceIdParam);
				setIsMember(isMemberParam === "true");
				setIsLoading(false);
				return;
			}

			// Otherwise, fetch from database
			const { workspaceSlug, channelSlug } = params;

			// Get workspace ID from slug
			const { data: workspace, error: workspaceError } = await supabase
				.from("workspaces")
				.select("id, name")
				.eq("slug", workspaceSlug)
				.single();

			logDB({
				operation: "SELECT",
				table: "workspaces",
				description: `Fetching workspace for channel page (${workspaceSlug})`,
				result: workspace,
				error: workspaceError,
			});

			if (!workspace) {
				notFound();
			}

			setWorkspaceId(workspace.id);

			// Get channel data
			const { data: channelData, error: channelError } = await supabase
				.from("channels")
				.select("id, name, description")
				.eq("workspace_id", workspace.id)
				.eq("slug", channelSlug)
				.single();

			logDB({
				operation: "SELECT",
				table: "channels",
				description: `Fetching channel data (${channelSlug})`,
				result: channelData,
				error: channelError,
			});

			if (!channelData) {
				notFound();
			}

			// Check membership
			const { data: membership, error: membershipError } = await supabase
				.from("channel_members")
				.select("role")
				.eq("channel_id", channelData.id)
				.eq("user_id", (await supabase.auth.getUser()).data.user?.id)
				.single();

			logDB({
				operation: "SELECT",
				table: "channel_members",
				description: `Checking channel membership for channel ${channelData.id}`,
				result: membership,
				error: membershipError,
			});

			setChannel(channelData);
			setIsMember(!!membership);
			setIsLoading(false);
		}

		loadChannel();
	}, [params, searchParams]);

	if (isLoading) {
		return null;
	}

	if (!channel || !workspaceId) {
		return notFound();
	}

	if (!isMember) {
		return (
			<UnjoinedChannelView
				channelId={channel.id}
				channelName={channel.name}
				onJoin={() => setIsMember(true)}
			/>
		);
	}

	return <ChannelContent channel={channel} workspaceId={workspaceId} />;
}
