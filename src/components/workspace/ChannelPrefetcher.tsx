"use client";

import { useEffect, useRef } from "react";
import { createClient } from "@/utils/supabase/client";
import type { ChannelBasic } from "@/types/channel";
import { useMessageCache } from "@/components/messages/MessageCache";
import { logDB } from "@/utils/logging";
import type { RealtimeChannel } from "@supabase/supabase-js";

interface ChannelPrefetcherProps {
	workspaceId: string;
	activeChannelId?: string;
	onChannelsLoaded: (
		joinedChannels: ChannelBasic[],
		unjoinedChannels: ChannelBasic[],
	) => void;
}

// Debounce time in milliseconds
const DEBOUNCE_TIME = 5000;

export function ChannelPrefetcher({
	workspaceId,
	activeChannelId,
	onChannelsLoaded,
}: ChannelPrefetcherProps) {
	const timeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(
		undefined,
	);
	const lastFetchRef = useRef<number>(0);
	const { updateChannelMessages } = useMessageCache();

	useEffect(() => {
		if (!workspaceId) return;

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

			await logDB({
				operation: "SELECT",
				table: "messages",
				description: `Prefetching messages for channel ${channelId}${channelId === activeChannelId ? " (active)" : ""}`,
				result: data ? { count: data.length } : null,
				error,
			});

			if (error) {
				console.error("[Background] Failed to prepare channel:", channelId);
				return;
			}

			if (data) {
				console.log("[Background] Channel ready:", {
					channel: channelId,
					messageCount: data.length,
					isActive: channelId === activeChannelId,
				});
				updateChannelMessages(channelId, data);
			}
		}

		async function prefetchChannels() {
			console.log("[Background] Getting list of available channels...");

			const { data: allChannels, error: channelsError } = await supabase
				.from("channels")
				.select("*")
				.eq("workspace_id", workspaceId);

			await logDB({
				operation: "SELECT",
				table: "channels",
				description: `Listing all channels for workspace ${workspaceId}`,
				result: allChannels ? { count: allChannels.length } : null,
				error: channelsError,
			});

			if (channelsError) {
				console.error("[Background] Failed to list channels:", channelsError);
				return;
			}

			const {
				data: { user },
			} = await supabase.auth.getUser();
			if (!user) return;

			const { data: joinedChannelIds, error: membershipError } = await supabase
				.from("channel_members")
				.select("channel_id")
				.eq("user_id", user.id);

			await logDB({
				operation: "SELECT",
				table: "channel_members",
				description: `Checking channel memberships for workspace ${workspaceId}`,
				result: joinedChannelIds ? { count: joinedChannelIds.length } : null,
				error: membershipError,
			});

			if (membershipError) {
				console.error(
					"[Background] Failed to check channel memberships:",
					membershipError,
				);
				return;
			}

			if (allChannels) {
				const joinedIds = new Set(joinedChannelIds?.map((m) => m.channel_id));
				const workspaceChannels = allChannels.filter(
					(c) => c.workspace_id === workspaceId,
				);
				const joinedChannels = workspaceChannels.filter((c) =>
					joinedIds.has(c.id),
				);
				const unjoinedChannels = workspaceChannels.filter(
					(c) => !joinedIds.has(c.id),
				);

				console.log("[Background] Found channels:", {
					joined: joinedChannels.length,
					available: unjoinedChannels.length,
				});

				// Update sidebar with channel lists
				onChannelsLoaded(joinedChannels, unjoinedChannels);

				// Sort channels so active channel is first
				const sortedChannels = joinedChannels.sort((a, b) => {
					if (a.id === activeChannelId) return -1;
					if (b.id === activeChannelId) return 1;
					return 0;
				});

				console.log(
					"[Background] Preparing messages for all joined channels...",
				);

				// Load messages for each channel sequentially
				for (const channel of sortedChannels) {
					await prefetchChannelMessages(channel.id);
				}

				console.log("[Background] ✨ All channels ready!");
			}
		}

		async function setupSubscription() {
			const {
				data: { user },
			} = await supabase.auth.getUser();
			if (!user) return;

			return supabase
				.channel("channel-changes")
				.on(
					"postgres_changes",
					{
						event: "*",
						schema: "public",
						table: "channel_members",
						filter: `user_id=eq.${user.id}`,
					},
					() => {
						// Clear any existing timeout
						if (timeoutRef.current) {
							clearTimeout(timeoutRef.current);
						}
						// Set a new timeout to debounce the fetch
						timeoutRef.current = setTimeout(() => {
							console.log(
								"[Background] Channel membership changed, updating...",
							);
							prefetchChannels();
						}, DEBOUNCE_TIME);
					},
				)
				.subscribe();
		}

		// Initial fetch and subscription setup
		prefetchChannels();
		let subscription: RealtimeChannel | undefined;
		setupSubscription().then((sub) => {
			subscription = sub;
		});

		return () => {
			if (timeoutRef.current) {
				clearTimeout(timeoutRef.current);
			}
			if (subscription) {
				subscription.unsubscribe();
			}
		};
	}, [workspaceId, activeChannelId, updateChannelMessages, onChannelsLoaded]);

	return null; // This is a utility component, it doesn't render anything
}
