"use client";

import {
	createContext,
	useContext,
	useState,
	useCallback,
	useEffect,
} from "react";
import { debounce } from "lodash";
import { createClient } from "@/utils/supabase/client";
import type { Message } from "@/types/message";
import type { RealtimePostgresChangesPayload } from "@supabase/supabase-js";
import { logDB } from "@/utils/logging";

interface MessageCache {
	[key: string]: {
		mainView: Message[];
		threads: Record<string, Message[]>;
	};
}

interface MessageCacheContextType {
	messages: MessageCache;
	getChannelMessages: (channelId: string, parentId?: string) => Message[];
	updateChannelMessages: (
		channelId: string,
		messages: Message[],
		parentId?: string,
	) => void;
	loadMessages: (channelId: string, parentId?: string) => Promise<void>;
}

const MessageCacheContext = createContext<MessageCacheContextType | null>(null);

export function useMessageCache() {
	const context = useContext(MessageCacheContext);
	if (!context) {
		throw new Error(
			"useMessageCache must be used within a MessageCacheProvider",
		);
	}
	return context;
}

interface MessagePayload {
	id: string;
	channel_id: string;
	parent_id: string | null;
}

export function MessageCacheProvider({
	children,
}: { children: React.ReactNode }) {
	const [messages, setMessages] = useState<MessageCache>({});
	const supabase = createClient();

	const getChannelMessages = useCallback(
		(channelId: string, parentId?: string) => {
			if (!messages[channelId]) return [];

			// If parentId is provided, return thread messages
			if (parentId) {
				return messages[channelId].threads[parentId] || [];
			}

			// Otherwise return main view messages
			return messages[channelId].mainView || [];
		},
		[messages],
	);

	const updateChannelMessages = useCallback(
		(channelId: string, newMessages: Message[], parentId?: string) => {
			setMessages((prev) => {
				const channelCache = prev[channelId] || { mainView: [], threads: {} };

				if (parentId) {
					// Update thread messages
					return {
						...prev,
						[channelId]: {
							...channelCache,
							threads: {
								...channelCache.threads,
								[parentId]: newMessages,
							},
						},
					};
				}

				// Update main view messages
				return {
					...prev,
					[channelId]: {
						...channelCache,
						mainView: newMessages,
					},
				};
			});
		},
		[],
	);

	// Add debounced fetch function
	const debouncedFetchMessages = useCallback(
		debounce(async (channelId: string, parentId?: string) => {
			console.log("[MessageCache] Debounced fetch for channel:", channelId);

			const query = supabase
				.from("messages")
				.select(`
					*,
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
					)
				`)
				.order("created_at", { ascending: true });

			if (channelId) {
				query.eq("channel_id", channelId);
			}

			if (parentId) {
				query.eq("parent_id", parentId);
			} else {
				query.is("parent_id", null);
			}

			const { data: messages, error } = await query;

			logDB({
				operation: "SELECT",
				table: "messages",
				description: `Loading messages for channel ${channelId}${parentId ? ` in thread ${parentId}` : ""}`,
				result: messages ? { count: messages.length } : null,
				error,
			});

			if (error) {
				console.error("[MessageCache] Error loading messages:", error);
				return;
			}

			if (messages) {
				updateChannelMessages(channelId, messages as Message[], parentId);
			}
		}, 500),
		[updateChannelMessages],
	);

	// Update the realtime subscription handler
	useEffect(() => {
		const channel = supabase
			.channel("global-message-changes")
			.on(
				"postgres_changes",
				{
					event: "*",
					schema: "public",
					table: "messages",
				},
				async (payload: RealtimePostgresChangesPayload<MessagePayload>) => {
					const newMessage = payload.new as MessagePayload;
					if (!newMessage?.id) return;

					// Instead of fetching a single message and updating state,
					// trigger a debounced fetch of all messages for the channel
					if (newMessage.channel_id) {
						debouncedFetchMessages(
							newMessage.channel_id,
							newMessage.parent_id || undefined,
						);
					}
				},
			)
			.subscribe();

		return () => {
			channel.unsubscribe();
		};
	}, [supabase, debouncedFetchMessages]);

	// Add a new function to initiate message loading
	const loadMessages = useCallback(
		async (channelId: string, parentId?: string) => {
			// If we already have messages for this channel/thread, return immediately
			const existingMessages = getChannelMessages(channelId, parentId);
			if (existingMessages.length > 0) {
				console.log("[MessageCache] Using cached messages for:", channelId);
				return;
			}

			console.log("[MessageCache] Initial load for channel:", channelId);
			await debouncedFetchMessages(channelId, parentId);
		},
		[getChannelMessages, debouncedFetchMessages],
	);

	const value = {
		messages,
		getChannelMessages,
		updateChannelMessages,
		loadMessages,
	};

	return (
		<MessageCacheContext.Provider value={value}>
			{children}
		</MessageCacheContext.Provider>
	);
}
