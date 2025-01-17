"use client";

import {
	createContext,
	useContext,
	useEffect,
	useState,
	useCallback,
} from "react";
import { createClient } from "@/utils/supabase/client";
import type { Message } from "@/types/message";
import type { RealtimePostgresChangesPayload } from "@supabase/supabase-js";

interface MessageCache {
	[channelId: string]: {
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

interface FilePayload {
	id: string;
	message_id: string;
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

	// Set up global subscription for message updates
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
					const oldMessage = payload.old as MessagePayload;
					if (!newMessage?.id) return;

					console.log("[MessageCache] Received message event:", {
						type: payload.eventType,
						id: newMessage.id,
						old: oldMessage ? { id: oldMessage.id } : null,
						new: { id: newMessage.id },
					});

					// Fetch the complete message data with profile and files
					console.log("[MessageCache] Fetching complete message data...");
					const { data: message, error } = await supabase
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
								file_url,
								caption,
								description
							),
							reply_count,
							reply_user_ids`,
						)
						.eq("id", newMessage.id)
						.single();

					if (error) {
						console.error("[MessageCache] Error fetching message:", error);
						return;
					}

					console.log("[MessageCache] Fetched message data:", {
						id: message.id,
						type: payload.eventType,
						hasEmbedding: !!message.embedding,
						embedding: message.embedding ? "present" : "null",
						channelId: message.channel_id,
						parentId: message.parent_id,
					});

					if (message?.channel_id) {
						if (payload.eventType === "INSERT") {
							console.log("[MessageCache] Message added to database:", {
								id: message.id,
								channel: message.channel_id,
								content:
									message.content.substring(0, 50) +
									(message.content.length > 50 ? "..." : ""),
							});
						}
						if (payload.eventType === "UPDATE") {
							console.log("[MessageCache] Message updated in database:", {
								id: message.id,
								channel: message.channel_id,
								content:
									message.content.substring(0, 50) +
									(message.content.length > 50 ? "..." : ""),
								hasEmbedding: !!message.embedding,
								embedding: message.embedding ? "present" : "null",
							});
						}

						console.log("[MessageCache] Updating messages state...");

						setMessages((prev) => {
							const channelCache = prev[message.channel_id] || {
								mainView: [],
								threads: {},
							};

							if (message.parent_id) {
								// Update thread messages
								const threadMessages =
									channelCache.threads[message.parent_id] || [];

								if (payload.eventType === "INSERT") {
									return {
										...prev,
										[message.channel_id]: {
											...channelCache,
											threads: {
												...channelCache.threads,
												[message.parent_id]: [...threadMessages, message],
											},
										},
									};
								}

								if (payload.eventType === "UPDATE") {
									return {
										...prev,
										[message.channel_id]: {
											...channelCache,
											threads: {
												...channelCache.threads,
												[message.parent_id]: threadMessages.map((m) =>
													m.id === message.id ? message : m,
												),
											},
										},
									};
								}

								if (payload.eventType === "DELETE") {
									return {
										...prev,
										[message.channel_id]: {
											...channelCache,
											threads: {
												...channelCache.threads,
												[message.parent_id]: threadMessages.filter(
													(m) => m.id !== message.id,
												),
											},
										},
									};
								}
							} else {
								// Update main view messages
								if (payload.eventType === "INSERT") {
									return {
										...prev,
										[message.channel_id]: {
											...channelCache,
											mainView: [...channelCache.mainView, message],
										},
									};
								}

								if (payload.eventType === "UPDATE") {
									return {
										...prev,
										[message.channel_id]: {
											...channelCache,
											mainView: channelCache.mainView.map((m) =>
												m.id === message.id ? message : m,
											),
										},
									};
								}

								if (payload.eventType === "DELETE") {
									return {
										...prev,
										[message.channel_id]: {
											...channelCache,
											mainView: channelCache.mainView.filter(
												(m) => m.id !== message.id,
											),
										},
									};
								}
							}

							return prev;
						});
					}
				},
			)
			.on(
				"postgres_changes",
				{
					event: "*",
					schema: "public",
					table: "files",
				},
				async (payload: RealtimePostgresChangesPayload<FilePayload>) => {
					const file = payload.new as FilePayload | null;
					if (!file) return;

					console.log("[MessageCache] Received file event:", {
						type: payload.eventType,
						messageId: file.message_id,
						file: payload.new,
						old: payload.old,
					});

					// Fetch the complete message data with profile and files
					console.log("[MessageCache] Fetching updated message data...");
					const { data: message, error } = await supabase
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
								file_url,
								caption,
								description
							),
							reply_count,
							reply_user_ids`,
						)
						.eq("id", file.message_id)
						.single();

					if (error) {
						console.error("[MessageCache] Error fetching message:", error);
						return;
					}

					console.log("[MessageCache] Fetched message data:", {
						id: message.id,
						type: payload.eventType,
						files: message.files?.length || 0,
					});

					if (!message?.channel_id) return;

					console.log("[MessageCache] Updating messages state...");

					setMessages((prev) => {
						const channelCache = prev[message.channel_id] || {
							mainView: [],
							threads: {},
						};

						if (message.parent_id) {
							// Update thread messages
							const threadMessages =
								channelCache.threads[message.parent_id] || [];

							return {
								...prev,
								[message.channel_id]: {
									...channelCache,
									threads: {
										...channelCache.threads,
										[message.parent_id]: threadMessages.map((m) =>
											m.id === message.id ? message : m,
										),
									},
								},
							};
						}

						// Update main view messages
						return {
							...prev,
							[message.channel_id]: {
								...channelCache,
								mainView: channelCache.mainView.map((m) =>
									m.id === message.id ? message : m,
								),
							},
						};
					});
				},
			)
			.subscribe();

		return () => {
			channel.unsubscribe();
		};
	}, [supabase]);

	const value = {
		messages,
		getChannelMessages,
		updateChannelMessages,
	};

	return (
		<MessageCacheContext.Provider value={value}>
			{children}
		</MessageCacheContext.Provider>
	);
}
