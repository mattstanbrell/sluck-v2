"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { createClient } from "@/utils/supabase/client";
import type { Message } from "@/types/message";
import type { RealtimePostgresChangesPayload } from "@supabase/supabase-js";

interface MessageCache {
	[key: string]: Message[];
}

interface MessageCacheContextType {
	messages: MessageCache;
	getChannelMessages: (channelId: string) => Message[];
	updateChannelMessages: (channelId: string, messages: Message[]) => void;
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
}

export function MessageCacheProvider({
	children,
}: { children: React.ReactNode }) {
	const [messages, setMessages] = useState<MessageCache>({});
	const supabase = createClient();

	const getChannelMessages = (channelId: string) => {
		console.log(`[MessageCache] Getting messages for channel ${channelId}`, {
			cached: messages[channelId]?.length || 0,
			fromCache: !!messages[channelId],
		});
		return messages[channelId] || [];
	};

	const updateChannelMessages = (channelId: string, newMessages: Message[]) => {
		console.log(`[MessageCache] Updating cache for channel ${channelId}`, {
			messageCount: newMessages.length,
			firstMessageId: newMessages[0]?.id,
			lastMessageId: newMessages[newMessages.length - 1]?.id,
		});
		setMessages((prev) => ({
			...prev,
			[channelId]: newMessages,
		}));
	};

	// Set up global subscription for message updates
	useEffect(() => {
		console.log("[MessageCache] Setting up global message subscription");

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
					const newMessage = payload.new;
					if (!newMessage?.id) return;

					console.log(`[MessageCache] Received realtime update`, {
						type: payload.eventType,
						messageId: newMessage.id,
						channelId: newMessage.channel_id,
					});

					// Fetch the complete message data with profile and files
					const { data: message } = await supabase
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
						.eq("id", newMessage.id)
						.single();

					if (message?.channel_id) {
						console.log(`[MessageCache] Updating message in cache`, {
							messageId: message.id,
							channelId: message.channel_id,
							type: payload.eventType,
						});

						setMessages((prev) => {
							const channelMessages = prev[message.channel_id] || [];

							if (payload.eventType === "INSERT") {
								return {
									...prev,
									[message.channel_id]: [...channelMessages, message],
								};
							}

							if (payload.eventType === "UPDATE") {
								return {
									...prev,
									[message.channel_id]: channelMessages.map((m) =>
										m.id === message.id ? message : m,
									),
								};
							}

							if (payload.eventType === "DELETE") {
								return {
									...prev,
									[message.channel_id]: channelMessages.filter(
										(m) => m.id !== message.id,
									),
								};
							}

							return prev;
						});
					}
				},
			)
			.subscribe();

		return () => {
			console.log("[MessageCache] Cleaning up global message subscription");
			channel.unsubscribe();
		};
	}, [supabase]);

	return (
		<MessageCacheContext.Provider
			value={{
				messages,
				getChannelMessages,
				updateChannelMessages,
			}}
		>
			{children}
		</MessageCacheContext.Provider>
	);
}
