"use client";

import { useCallback, useEffect, useRef, useState, useMemo, memo } from "react";
import { createClient } from "@/utils/supabase/client";
import { useMessageCache } from "./MessageCache";
import type { Message, MessageGroup } from "@/types/message";
import type { ProfileWithId } from "@/types/profile";
import { MessageContent } from "./MessageContent";
import { MessageTimestamp } from "./MessageTimestamp";
import { UserAvatar } from "../ui/UserAvatar";
import { Button } from "@/components/ui/button";
import { ListEnd } from "lucide-react";
import { ThreadRepliesIndicator } from "./ThreadRepliesIndicator";
import { useProfileCache } from "@/components/providers/ProfileCacheProvider";
import { logDB } from "@/utils/logging";

function debounce<T extends (...args: unknown[]) => void>(
	fn: T,
	delay: number,
): { (...args: Parameters<T>): void; cancel: () => void } {
	let timeoutId: ReturnType<typeof setTimeout>;

	function debouncedFn(...args: Parameters<T>) {
		clearTimeout(timeoutId);
		timeoutId = setTimeout(() => fn(...args), delay);
	}

	debouncedFn.cancel = () => {
		clearTimeout(timeoutId);
	};

	return debouncedFn;
}

/**
 * Group consecutive messages from the same user
 * into "chains". So if userA sends 3 in a row, that becomes 1 chain.
 */
function groupConsecutiveMessages(messages: Message[]): MessageGroup[] {
	if (!messages.length) return [];

	const groups: MessageGroup[] = [];
	let currentGroup: MessageGroup = { userId: "", messages: [] };

	if (messages[0]?.profile?.id) {
		currentGroup = {
			userId: messages[0].profile.id,
			messages: [messages[0]],
		};
	}

	for (let i = 1; i < messages.length; i++) {
		const m = messages[i];
		if (!m.profile || !m.profile.id) continue;

		if (m.profile.id === currentGroup.userId) {
			currentGroup.messages.push(m);
		} else {
			groups.push(currentGroup);
			currentGroup = { userId: m.profile.id, messages: [m] };
		}
	}

	if (currentGroup.messages.length > 0) {
		groups.push(currentGroup);
	}

	return groups;
}

// Static ref that persists across all instances
const INITIAL_LOAD_DONE = { current: false };

export function MessageList({
	channelId,
	parentId,
	conversationId,
	onThreadClick,
	isMainView,
	highlightedMessageId,
}: {
	channelId?: string;
	parentId?: string;
	conversationId?: string;
	onThreadClick?: (messageId: string) => void;
	isMainView?: boolean;
	highlightedMessageId?: string;
}) {
	const { getChannelMessages, updateChannelMessages } = useMessageCache();
	const { getProfile, bulkCacheProfiles, getCachedProfile } = useProfileCache();
	const [isInitialLoad, setIsInitialLoad] = useState(true);
	const messagesEndRef = useRef<HTMLDivElement>(null);
	const lastLoggedStateRef = useRef<string>("");
	const supabase = useMemo(() => createClient(), []);

	// Get messages from cache
	const messages = useMemo(() => {
		return channelId ? getChannelMessages(channelId, parentId) : [];
	}, [channelId, getChannelMessages, parentId]);
	const hasMessages = messages.length > 0;

	// Build a map of profiles for the thread replies indicator
	const profilesMap = useMemo(() => {
		const map: Record<string, ProfileWithId> = {};
		for (const m of messages) {
			if (m.profile?.id) {
				map[m.profile.id] = m.profile;
			}
		}
		return map;
	}, [messages]);

	// Group messages into chains
	const messageGroups = useMemo(() => {
		return groupConsecutiveMessages(messages);
	}, [messages]);

	// Ensure we scroll to bottom only on new messages or initial load
	const scrollToBottom = useCallback(() => {
		messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
	}, []);

	// Only log cache status when it changes
	useEffect(() => {
		if (!channelId) return;

		const currentState = `${channelId}-${messages.length}`;
		if (currentState !== lastLoggedStateRef.current) {
			lastLoggedStateRef.current = currentState;

			const status = hasMessages ? "ready" : "empty";
			console.log("[MessageList] Status:", {
				channel: channelId,
				messages: hasMessages ? messages.length : "none",
				status,
				cached: hasMessages,
			});
		}
	}, [channelId, messages.length, hasMessages]);

	// Initial load scroll
	useEffect(() => {
		if (isInitialLoad) {
			if (messages.length > 0) {
				console.log("[MessageList] First messages loaded, scrolling to bottom");
				scrollToBottom();
			} else {
				console.log("[MessageList] No initial messages");
			}
			setIsInitialLoad(false);
		}
	}, [isInitialLoad, messages.length, scrollToBottom]);

	// Update the profile loading effect to use bulk caching
	useEffect(() => {
		if (!messages.length) return;

		// Extract profiles from messages that already have them
		const profilesFromMessages = messages
			.filter(
				(m): m is Message & { profile: NonNullable<Message["profile"]> } =>
					m.profile?.id != null,
			)
			.map((m) => m.profile);

		// Bulk cache any profiles we already have
		if (profilesFromMessages.length > 0) {
			bulkCacheProfiles(profilesFromMessages);
		}

		// Find which profiles we still need to fetch
		const uniqueUserIds = new Set(messages.map((m) => m.user_id));
		const missingProfileIds = Array.from(uniqueUserIds).filter(
			(userId) => !getCachedProfile(userId),
		);

		// Only fetch profiles we don't have
		if (missingProfileIds.length > 0) {
			Promise.all(missingProfileIds.map((id) => getProfile(id))).then(
				(profiles) => {
					const validProfiles = profiles.filter(
						(p): p is NonNullable<typeof p> => p !== null,
					);
					if (validProfiles.length > 0) {
						bulkCacheProfiles(validProfiles);
					}
				},
			);
		}
	}, [messages, bulkCacheProfiles, getCachedProfile, getProfile]);

	// Subscribe to new messages
	useEffect(() => {
		if (!channelId && !conversationId) return;

		const channel = supabase
			.channel(`messages-${channelId || conversationId}`)
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
				async (payload) => {
					// Refetch all messages to ensure consistency
					const query = supabase
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
						.order("created_at", { ascending: true });

					if (channelId) {
						query.eq("channel_id", channelId);
					} else if (conversationId) {
						query.eq("conversation_id", conversationId);
					}

					if (parentId) {
						query.eq("parent_id", parentId);
					} else if (isMainView) {
						query.is("parent_id", null);
					}

					const { data, error } = await query;

					if (error) {
						console.error("[MessageList] Failed to update messages:", error);
					} else if (data && channelId) {
						updateChannelMessages(channelId, data as Message[], parentId);
					}
				},
			)
			.subscribe();

		return () => {
			channel.unsubscribe();
		};
	}, [
		channelId,
		conversationId,
		parentId,
		isMainView,
		updateChannelMessages,
		supabase,
	]);

	return (
		<div
			className={`flex flex-col gap-4 overflow-x-hidden ${
				isMainView ? "px-8 pt-7 pb-10" : "px-4 pt-3 pb-10"
			}`}
		>
			{!isInitialLoad && messageGroups.length === 0 && (
				<div className="flex flex-col items-center justify-center h-32">
					<p className="text-custom-text-secondary text-lg">No messages yet</p>
					<p className="text-custom-text-tertiary text-sm mt-1">
						Be the first one to send a message!
					</p>
				</div>
			)}
			{messageGroups.map((chain: MessageGroup, i: number) => (
				<ChainGroup
					key={`${chain.userId}-${i}`}
					chain={chain}
					onThreadClick={onThreadClick}
					showThreadButton={isMainView}
					highlightedMessageId={highlightedMessageId}
					profiles={profilesMap}
				/>
			))}
			<div ref={messagesEndRef} />
		</div>
	);
}

const ChainGroup = memo(function ChainGroup({
	chain,
	onThreadClick,
	showThreadButton,
	highlightedMessageId,
	profiles,
}: {
	chain: { userId: string; messages: Message[] };
	onThreadClick?: (messageId: string) => void;
	showThreadButton?: boolean;
	highlightedMessageId?: string;
	profiles: Record<string, ProfileWithId>;
}) {
	const firstMessage = chain.messages[0];
	const showChainLine = chain.messages.length > 1;

	const [lineStyle, setLineStyle] = useState<React.CSSProperties>({
		height: 0,
	});
	const [hoveredMessageId, setHoveredMessageId] = useState<string | null>(null);
	const chainRef = useRef<HTMLDivElement>(null);
	const resizeObserverRef = useRef<ResizeObserver | null>(null);

	const updateLineHeight = useCallback(() => {
		if (!showChainLine || !chainRef.current || !firstMessage?.profile) return;

		const chainRect = chainRef.current?.getBoundingClientRect();
		if (!chainRect) return;

		const startY = chainRect.top + 40; // Avatar offset
		const lastDiv = chainRef.current?.querySelector("[data-last-message]");
		if (!lastDiv) {
			setLineStyle({ height: 0 });
			return;
		}

		const lastRect = (lastDiv as HTMLElement).getBoundingClientRect();
		const lastBottom = lastRect.bottom;
		const totalHeight = lastBottom - startY;

		if (totalHeight <= 0) {
			setLineStyle({ height: 0 });
			return;
		}

		setLineStyle({
			height: `${totalHeight}px`,
			background: firstMessage.profile.avatar_color || "rgb(20, 148, 132)",
			maskImage: "linear-gradient(to bottom, black, transparent)",
			WebkitMaskImage: "linear-gradient(to bottom, black, transparent)",
		});
	}, [showChainLine, firstMessage?.profile]);

	// Set up resize observer
	useEffect(() => {
		if (!showChainLine || !chainRef.current || !firstMessage?.profile) return;

		// Initial update
		updateLineHeight();

		// Set up resize observer with debounced callback
		const debouncedUpdate = debounce(updateLineHeight, 100);
		resizeObserverRef.current = new ResizeObserver(debouncedUpdate);
		resizeObserverRef.current.observe(chainRef.current);

		return () => {
			debouncedUpdate.cancel();
			if (resizeObserverRef.current) {
				resizeObserverRef.current.disconnect();
				resizeObserverRef.current = null;
			}
		};
	}, [showChainLine, updateLineHeight, firstMessage?.profile]);

	if (!firstMessage?.profile) return null;

	return (
		<div ref={chainRef} className="space-y-0.5 relative">
			{/* First message row (with avatar) */}
			<div
				className="group relative flex items-start gap-4 py-0.5 px-8 -mx-8 transition-colors"
				onMouseEnter={() => setHoveredMessageId(firstMessage.id)}
				onMouseLeave={() => setHoveredMessageId(null)}
				style={
					{
						["--hover-bg" as string]:
							firstMessage.profile.avatar_color || "rgb(20, 148, 132)",
					} as React.CSSProperties
				}
			>
				<div
					className={`absolute inset-0 ${
						highlightedMessageId === firstMessage.id
							? "opacity-5"
							: "opacity-0 group-hover:opacity-5"
					} transition-opacity pointer-events-none`}
					style={{ backgroundColor: "var(--hover-bg)" }}
				/>
				{/* Avatar with chain line */}
				<div className="relative w-10 flex-shrink-0">
					<UserAvatar
						fullName={firstMessage.profile.full_name}
						displayName={firstMessage.profile.display_name}
						avatarUrl={firstMessage.profile.avatar_url}
						avatarCache={firstMessage.profile.avatar_cache}
						avatarColor={firstMessage.profile.avatar_color}
						size="md"
					/>
					{showChainLine && (
						<div
							className="absolute left-1/2 top-10 w-0.5 -translate-x-1/2 transition-[height] duration-1000 ease-out"
							style={lineStyle}
						/>
					)}
				</div>

				{/* Content */}
				<div className="flex-1 min-w-0">
					<div className="flex items-baseline mb-0.5">
						<span className="font-semibold text-custom-text">
							{firstMessage.profile.display_name ||
								firstMessage.profile.full_name}
						</span>
						<MessageTimestamp
							timestamp={firstMessage.created_at}
							className="ml-2 text-custom-text-tertiary"
						/>
					</div>
					<div className="relative">
						<MessageContent
							content={firstMessage.content}
							files={firstMessage.files}
						/>
						{showThreadButton &&
							onThreadClick &&
							firstMessage.reply_count > 0 && (
								<ThreadRepliesIndicator
									messageId={firstMessage.id}
									replyUserIds={firstMessage.reply_user_ids}
									profiles={profiles}
									onClick={() => onThreadClick(firstMessage.id)}
									highlightedMessageId={highlightedMessageId}
								/>
							)}
						{showThreadButton &&
							onThreadClick &&
							!firstMessage.reply_count &&
							hoveredMessageId === firstMessage.id &&
							highlightedMessageId !== firstMessage.id && (
								<div
									className="absolute left-0 h-6 z-20 w-fit"
									style={{ bottom: "-22px" }}
									onMouseEnter={() => setHoveredMessageId(firstMessage.id)}
								>
									<Button
										variant="ghost"
										size="sm"
										onClick={() => onThreadClick(firstMessage.id)}
										className="text-custom-text-secondary hover:text-custom-text border border-custom-ui-medium bg-custom-background-secondary hover:bg-custom-ui-faint transition-colors"
									>
										<ListEnd className="h-4 w-4 mr-1 -scale-x-100" />
										Reply in thread
									</Button>
								</div>
							)}
					</div>
				</div>
			</div>

			{/* Subsequent messages */}
			{chain.messages.slice(1).map((message, idx) => {
				const isLast = idx === chain.messages.length - 2;
				return (
					<div
						key={message.id}
						data-last-message={isLast ? true : undefined}
						className="group relative py-0.5 px-8 -mx-8 transition-colors"
						onMouseEnter={() => setHoveredMessageId(message.id)}
						onMouseLeave={() => setHoveredMessageId(null)}
						style={
							{
								["--hover-bg" as string]:
									firstMessage.profile.avatar_color || "rgb(20, 148, 132)",
							} as React.CSSProperties
						}
					>
						<div
							className={`absolute inset-0 ${
								highlightedMessageId === message.id
									? "opacity-5"
									: "opacity-0 group-hover:opacity-5"
							} transition-opacity pointer-events-none`}
							style={{ backgroundColor: "var(--hover-bg)" }}
						/>
						<div className="ml-[3.5rem]">
							<div className="absolute left-[3.5rem] top-0 bottom-0 -translate-x-1/2 flex items-center pr-2 opacity-0 group-hover:opacity-100">
								<MessageTimestamp timestamp={message.created_at} hideColon />
							</div>
							<div className="relative">
								<MessageContent
									content={message.content}
									files={message.files}
								/>
								{showThreadButton &&
									onThreadClick &&
									message.reply_count > 0 && (
										<ThreadRepliesIndicator
											messageId={message.id}
											replyUserIds={message.reply_user_ids}
											profiles={profiles}
											onClick={() => onThreadClick(message.id)}
											highlightedMessageId={highlightedMessageId}
										/>
									)}
								{showThreadButton &&
									onThreadClick &&
									!message.reply_count &&
									hoveredMessageId === message.id &&
									highlightedMessageId !== message.id && (
										<div
											className="absolute left-0 h-6 z-20 w-fit"
											style={{ bottom: "-22px" }}
											onMouseEnter={() => setHoveredMessageId(message.id)}
										>
											<Button
												variant="ghost"
												size="sm"
												onClick={() => onThreadClick(message.id)}
												className="text-custom-text-secondary hover:text-custom-text border border-custom-ui-medium bg-custom-background-secondary hover:bg-custom-ui-faint transition-colors"
											>
												<ListEnd className="h-4 w-4 mr-1 -scale-x-100" />
												Reply in thread
											</Button>
										</div>
									)}
							</div>
						</div>
					</div>
				);
			})}
		</div>
	);
});
