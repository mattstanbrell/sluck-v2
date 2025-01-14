"use client";

import { useEffect, useRef } from "react";
import { createClient } from "@/utils/supabase/client";
import type { ChannelBasic } from "@/types/channel";
import { useMessageCache } from "@/components/messages/MessageCache";

interface ChannelPrefetcherProps {
	workspaceId: string;
	onChannelsLoaded: (
		joinedChannels: ChannelBasic[],
		unjoinedChannels: ChannelBasic[],
	) => void;
}

// Debounce time in milliseconds
const DEBOUNCE_TIME = 5000;

export function ChannelPrefetcher({
	workspaceId,
	onChannelsLoaded,
}: ChannelPrefetcherProps) {
	const timeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(
		undefined,
	);
	const lastFetchRef = useRef<number>(0);
	const { updateChannelMessages } = useMessageCache();

	useEffect(() => {
		const supabase = createClient();

		async function prefetchChannelMessages(channelId: string) {
			console.log("[Background] Preparing messages for channel:", channelId);

			const { data, error } = await supabase
				.from("messages")
				.select(
					`*,
					profile:profiles (
						id,
						full_name,
						display_name,
						avatar_url,
						avatar_color,
						avatar_cache
					),
					files (
						id,
						file_type,
						file_name,
						file_size,
						file_url
					)`,
				)
				.eq("channel_id", channelId)
				.is("parent_id", null)
				.order("created_at", { ascending: true });

			if (error) {
				console.error("[Background] Failed to prepare channel:", channelId);
				return;
			}

			if (data) {
				console.log("[Background] Channel ready:", {
					channel: channelId,
					messageCount: data.length,
				});
				updateChannelMessages(channelId, data);
			}
		}

		async function prefetchChannels() {
			const now = Date.now();
			// If less than DEBOUNCE_TIME has passed since last fetch, skip
			if (now - lastFetchRef.current < DEBOUNCE_TIME) {
				return;
			}
			lastFetchRef.current = now;

			console.log("[Background] Getting list of available channels...");

			// Get all channels
			const { data: allChannels, error: channelsError } = await supabase
				.from("channels")
				.select("id, name, slug, description")
				.eq("workspace_id", workspaceId)
				.order("name");

			if (channelsError) {
				console.error(
					"[Background] Failed to get channel list:",
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
					"[Background] Failed to get joined channels:",
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

				console.log("[Background] Found channels:", {
					joined: joinedChannels.length,
					available: unjoinedChannels.length,
				});

				onChannelsLoaded(joinedChannels, unjoinedChannels);

				// After loading channels, prefetch messages for joined channels
				if (joinedChannels.length > 0) {
					console.log(
						"[Background] Preparing messages for all joined channels...",
					);
					for (const channel of joinedChannels) {
						await prefetchChannelMessages(channel.id);
					}
					console.log("[Background] ✨ All channels ready!");
				}
			}
		}

		// Initial fetch
		prefetchChannels();

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
				() => {
					// Clear any existing timeout
					if (timeoutRef.current) {
						clearTimeout(timeoutRef.current);
					}
					// Set a new timeout to debounce the fetch
					timeoutRef.current = setTimeout(() => {
						console.log("[Background] Channel list changed, updating...");
						prefetchChannels();
					}, DEBOUNCE_TIME);
				},
			)
			.subscribe();

		return () => {
			if (timeoutRef.current) {
				clearTimeout(timeoutRef.current);
			}
			channelSubscription.unsubscribe();
		};
	}, [workspaceId, onChannelsLoaded, updateChannelMessages]);

	return null; // This is a utility component, it doesn't render anything
}
