"use client";

import { useSession } from "next-auth/react";
import { useRef, useEffect, useState, useCallback } from "react";
import { getAuthenticatedSupabaseClient } from "@/lib/supabase";
import UserAvatar from "./UserAvatar";
import MessageContent from "./MessageContent";
import MessageTimestamp from "./MessageTimestamp";
import type { Database } from "@/lib/database.types";
import { Button } from "./ui/button";
import { MessageSquare } from "lucide-react";
import { useRouter } from "next/navigation";

type Message = Database["public"]["Tables"]["messages"]["Row"] & {
	sender: Database["public"]["Tables"]["users"]["Row"];
	thread_summary?: {
		reply_count: number;
		participants: Database["public"]["Tables"]["users"]["Row"][];
	};
};

export default function MessageList({
	channelId,
	conversationId,
	parentId,
}: {
	channelId?: string;
	conversationId?: string;
	parentId?: string;
}) {
	const router = useRouter();
	const { data: session } = useSession();
	const [messages, setMessages] = useState<Message[]>([]);
	const [memberCount, setMemberCount] = useState(0);
	const messagesEndRef = useRef<HTMLDivElement>(null);

	// Add scrollToBottom function
	const scrollToBottom = useCallback(() => {
		messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
	}, []);

	// Scroll to bottom when messages change
	useEffect(() => {
		scrollToBottom();
	}, [messages, scrollToBottom]);

	useEffect(() => {
		let isSubscribed = true;

		const setupMessaging = async () => {
			if (!session?.user?.id) return;
			if (!channelId && !conversationId) return;

			const client = await getAuthenticatedSupabaseClient();

			const fetchMessages = async () => {
				if (channelId) {
					// First get the messages
					const query = client
						.from("messages")
						.select("*, sender:users!messages_user_id_fkey(*)")
						.eq("channel_id", channelId)
						.order("created_at", { ascending: true });

					// If in thread view, only show replies
					if (parentId) {
						query.eq("parent_id", parentId);
					} else {
						// In main channel view, only show parent messages
						query.is("parent_id", null);
					}

					const { data: messageData } = await query;

					if (messageData && isSubscribed) {
						// For each parent message, get thread summary
						const messagesWithThreads = await Promise.all(
							messageData.map(async (message) => {
								if (parentId) return message;

								// Get thread replies
								const { data: replies, count } = await client
									.from("messages")
									.select("user_id, users!messages_user_id_fkey(*)", {
										count: "exact",
									})
									.eq("parent_id", message.id);

								if (!replies || !count) return message;

								// Get unique participants
								const participants = Array.from(
									new Map(replies.map((r) => [r.users.id, r.users])).values(),
								);

								return {
									...message,
									thread_summary: {
										reply_count: count,
										participants: participants.slice(0, 3),
									},
								};
							}),
						);

						setMessages(messagesWithThreads);
					}

					// Get member count
					const { count } = await client
						.from("channel_members")
						.select("*", { count: "exact", head: true })
						.eq("channel_id", channelId);
					if (isSubscribed) {
						setMemberCount(count || 0);
					}
				} else if (conversationId) {
					const { data } = await client
						.from("messages")
						.select("*, sender:users!messages_user_id_fkey(*)")
						.eq("conversation_id", conversationId)
						.order("created_at", { ascending: true });

					if (data && isSubscribed) {
						setMessages(data);
					}
				}
			};

			await fetchMessages();

			// Set up real-time subscription
			const channel = client
				.channel("messages")
				.on(
					"postgres_changes",
					{
						event: "*",
						schema: "public",
						table: "messages",
						filter: channelId
							? `channel_id=eq.${channelId}`
							: `conversation_id=eq.${conversationId}`,
					},
					() => {
						fetchMessages();
					},
				)
				.subscribe();

			return () => {
				isSubscribed = false;
				channel.unsubscribe();
			};
		};

		const cleanup = setupMessaging();
		return () => {
			cleanup.then((unsubscribe) => unsubscribe?.());
		};
	}, [channelId, conversationId, session?.user?.id, parentId]);

	if (messages.length === 0 && channelId && memberCount === 1) {
		return (
			<div className="flex-1 flex items-center justify-center p-4">
				<div className="text-center">
					<h2 className="text-lg font-semibold mb-2">
						Welcome to the channel!
					</h2>
					<p className="text-gray-600 dark:text-gray-400 mb-4">
						You're the first one here. Invite others to join the conversation.
					</p>
				</div>
			</div>
		);
	}

	return (
		<div className="flex-1 overflow-y-auto p-4">
			{messages.map((message, index) => {
				// Check if this message is from the same user as the previous message
				const prevMessage = index > 0 ? messages[index - 1] : null;
				const isConsecutive = prevMessage?.sender?.id === message.sender?.id;

				// Check if previous message had a thread
				const prevHadThread = prevMessage?.thread_summary?.reply_count > 0;

				// Start a new group if not consecutive OR if previous message had a thread
				const isFirstInGroup = !isConsecutive || prevHadThread;

				return (
					<div
						key={message.id}
						className={`group relative ${isFirstInGroup ? "mt-6" : "mt-0.5"} hover:bg-[#F2F0E5] -mx-4 px-4 py-1`}
					>
						<div className="flex items-start gap-2">
							{isFirstInGroup ? (
								<UserAvatar user={message.sender} className="w-8 h-8 mt-0.5" />
							) : (
								<div className="w-8 h-8 relative">
									<MessageTimestamp
										timestamp={message.created_at}
										className="absolute left-0 top-2 opacity-0 group-hover:opacity-100"
										timeOnly
									/>
								</div>
							)}
							<div className="flex-1">
								{isFirstInGroup && (
									<div className="flex items-baseline gap-2 mb-1">
										<span className="font-medium">
											{message.sender?.name || "Unknown User"}
										</span>
										<MessageTimestamp timestamp={message.created_at} />
									</div>
								)}
								<MessageContent content={message.content} />

								{/* Thread Summary */}
								{message.thread_summary &&
									message.thread_summary.reply_count > 0 && (
										<button
											type="button"
											onClick={() =>
												router.push(
													`/channels/${channelId}/threads/${message.id}`,
												)
											}
											className="mt-2 flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
										>
											<div className="flex -space-x-2 items-center">
												{message.thread_summary.participants.map(
													(participant) => (
														<UserAvatar
															key={participant.id}
															user={participant}
															className="w-5 h-5"
														/>
													),
												)}
												{message.thread_summary.reply_count > 3 && (
													<div className="w-5 h-5 rounded-full bg-gray-100 dark:bg-gray-800 border-2 border-white dark:border-gray-800 flex items-center justify-center text-[10px] font-medium">
														...
													</div>
												)}
											</div>
											<span>
												{message.thread_summary.reply_count}{" "}
												{message.thread_summary.reply_count === 1
													? "reply"
													: "replies"}
											</span>
										</button>
									)}
							</div>
							{channelId && !message.parent_id && (
								<Button
									variant="ghost"
									size="sm"
									className="opacity-0 group-hover:opacity-100 transition-opacity"
									onClick={() =>
										router.push(`/channels/${channelId}/threads/${message.id}`)
									}
								>
									<MessageSquare className="h-4 w-4" />
								</Button>
							)}
						</div>
					</div>
				);
			})}
			<div ref={messagesEndRef} />
		</div>
	);
}
