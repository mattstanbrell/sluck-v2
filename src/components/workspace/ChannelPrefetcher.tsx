"use client";

import { useEffect } from "react";
import { createClient } from "@/utils/supabase/client";
import type { ChannelBasic } from "@/types/channel";

interface ChannelPrefetcherProps {
	workspaceId: string;
	onChannelsLoaded: (
		joinedChannels: ChannelBasic[],
		unjoinedChannels: ChannelBasic[],
	) => void;
}

export function ChannelPrefetcher({
	workspaceId,
	onChannelsLoaded,
}: ChannelPrefetcherProps) {
	useEffect(() => {
		const supabase = createClient();

		async function prefetchChannels() {
			console.log("[ChannelPrefetcher] Starting background fetch for channels");

			// Get all channels
			const { data: allChannels, error: channelsError } = await supabase
				.from("channels")
				.select("id, name, slug, description")
				.eq("workspace_id", workspaceId)
				.order("name");

			if (channelsError) {
				console.error(
					"[ChannelPrefetcher] Error fetching channels:",
					channelsError,
				);
				return;
			}

			// Get joined channels
			const { data: joinedChannelIds, error: membershipError } = await supabase
				.from("channel_members")
				.select("channel_id")
				.eq("user_id", (await supabase.auth.getUser()).data.user?.id);

			if (membershipError) {
				console.error(
					"[ChannelPrefetcher] Error fetching channel memberships:",
					membershipError,
				);
				return;
			}

			if (allChannels) {
				const joinedIds = new Set(joinedChannelIds?.map((m) => m.channel_id));
				const joinedChannels = allChannels.filter((c) => joinedIds.has(c.id));
				const unjoinedChannels = allChannels.filter(
					(c) => !joinedIds.has(c.id),
				);

				console.log("[ChannelPrefetcher] Loaded channels:", {
					joined: joinedChannels.length,
					unjoined: unjoinedChannels.length,
				});

				onChannelsLoaded(joinedChannels, unjoinedChannels);
			}

			// Set up subscription for real-time updates
			const channelSubscription = supabase
				.channel("channel-changes")
				.on(
					"postgres_changes",
					{
						event: "*",
						schema: "public",
						table: "channels",
						filter: `workspace_id=eq.${workspaceId}`,
					},
					async () => {
						const { data: updatedChannels } = await supabase
							.from("channels")
							.select("id, name, slug, description")
							.eq("workspace_id", workspaceId)
							.order("name");

						const { data: updatedMemberships } = await supabase
							.from("channel_members")
							.select("channel_id")
							.eq("user_id", (await supabase.auth.getUser()).data.user?.id);

						if (updatedChannels && updatedMemberships) {
							const joinedIds = new Set(
								updatedMemberships.map((m) => m.channel_id),
							);
							const joinedChannels = updatedChannels.filter((c) =>
								joinedIds.has(c.id),
							);
							const unjoinedChannels = updatedChannels.filter(
								(c) => !joinedIds.has(c.id),
							);
							onChannelsLoaded(joinedChannels, unjoinedChannels);
						}
					},
				)
				.subscribe();

			return () => {
				channelSubscription.unsubscribe();
			};
		}

		prefetchChannels();
	}, [workspaceId, onChannelsLoaded]);

	return null; // This is a utility component, it doesn't render anything
}
