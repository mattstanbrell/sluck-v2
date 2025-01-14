"use client";

import { useEffect } from "react";
import { createClient } from "@/utils/supabase/client";
import type { ChannelBasic } from "@/types/channel";

interface ChannelPrefetcherProps {
	workspaceId: string;
	onChannelsLoaded: (channels: ChannelBasic[]) => void;
}

export function ChannelPrefetcher({
	workspaceId,
	onChannelsLoaded,
}: ChannelPrefetcherProps) {
	useEffect(() => {
		const supabase = createClient();

		async function prefetchChannels() {
			console.log("[ChannelPrefetcher] Starting background fetch for channels");

			const { data: channels, error } = await supabase
				.from("channels")
				.select("id, name, slug, description")
				.eq("workspace_id", workspaceId)
				.order("name");

			if (error) {
				console.error("[ChannelPrefetcher] Error fetching channels:", error);
				return;
			}

			if (channels) {
				console.log("[ChannelPrefetcher] Loaded channels:", channels.length);
				onChannelsLoaded(channels);
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

						if (updatedChannels) {
							onChannelsLoaded(updatedChannels);
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
