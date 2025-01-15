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

const supabase = createClient();

async function fetchReplyProfiles(userIds: string[]) {
	if (!userIds.length) return {};

	const { data } = await supabase
		.from("profiles")
		.select(`
			id,
			full_name,
			display_name,
			avatar_url,
			avatar_color,
			avatar_cache
		`)
		.in("id", userIds);

	const profileMap: Record<string, ProfileWithId> = {};
	if (data) {
		for (const profile of data) {
			profileMap[profile.id] = profile;
		}
	}
	return profileMap;
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
	const [isInitialLoad, setIsInitialLoad] = useState(true);
	const [isLoading, setIsLoading] = useState(false);
	const [profilesMap, setProfilesMap] = useState<Record<string, ProfileWithId>>(
		{},
	);
	const messagesEndRef = useRef<HTMLDivElement>(null);
	const prevChannelIdRef = useRef<string | undefined>(undefined);
	const lastLoggedStateRef = useRef<string>("");

	// Get messages from cache
	const messages = useMemo(() => {
		return channelId ? getChannelMessages(channelId, parentId) : [];
	}, [channelId, getChannelMessages, parentId]);
	const hasMessages = messages.length > 0;

	// Update profiles map whenever messages change
	useEffect(() => {
		const map: Record<string, ProfileWithId> = {};
		const replyUserIds = new Set<string>();

		// First add message author profiles
		for (const m of messages) {
			if (m.profile?.id) {
				map[m.profile.id] = m.profile;
			}
			// Collect unique reply user IDs
			if (m.reply_user_ids) {
				for (const id of m.reply_user_ids) {
					replyUserIds.add(id);
				}
			}
		}

		// Set initial map with author profiles
		setProfilesMap(map);

		// Fetch reply profiles if we have any
		if (replyUserIds.size > 0) {
			fetchReplyProfiles(Array.from(replyUserIds)).then((replyProfiles) => {
				setProfilesMap((current) => ({
					...current,
					...replyProfiles,
				}));
			});
		}
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

		const currentState = `${channelId}-${messages.length}-${isLoading}`;
		if (currentState !== lastLoggedStateRef.current) {
			lastLoggedStateRef.current = currentState;

			const status = isLoading ? "loading" : hasMessages ? "ready" : "empty";
			console.log("[MessageList] Status:", {
				channel: channelId,
				messages: hasMessages ? messages.length : "none",
				status,
				cached: hasMessages,
				initialLoadDone: INITIAL_LOAD_DONE.current,
			});
		}
	}, [channelId, messages.length, isLoading, hasMessages]);

	// Track when messages are actually ready to view
	useEffect(() => {
		if (messages.length > 0 && !isLoading && channelId) {
			const isChannelSwitch = channelId !== prevChannelIdRef.current;
			console.log("[MessageList] Ready to view:", {
				channel: channelId,
				messages: messages.length,
				fromCache: hasMessages && !isChannelSwitch,
			});
		}
	}, [messages.length, isLoading, channelId, hasMessages]);

	// Initial load scroll
	useEffect(() => {
		if (isInitialLoad && messages.length > 0) {
			console.log("[MessageList] First messages loaded, scrolling to bottom");
			scrollToBottom();
			setIsInitialLoad(false);
		}
	}, [isInitialLoad, messages.length, scrollToBottom]);

	// Fetch messages if needed
	useEffect(() => {
		if (!channelId) return;

		const isChannelSwitch = channelId !== prevChannelIdRef.current;
		const needsInitialLoad = !INITIAL_LOAD_DONE.current;

		// Only fetch if:
		// 1. This is our very first channel load ever, or
		// 2. We're switching channels AND don't have the messages cached
		const shouldFetch = needsInitialLoad || (isChannelSwitch && !hasMessages);

		if (!shouldFetch) {
			if (hasMessages && isChannelSwitch) {
				console.log(
					"[MessageList] Using cached messages for channel switch:",
					channelId,
				);
			}
			return;
		}

		prevChannelIdRef.current = channelId;

		async function fetchMessages() {
			console.log("[MessageList] Fetching messages:", {
				channel: channelId,
				reason: needsInitialLoad
					? "first time load"
					: "channel switch - not cached",
			});

			setIsLoading(true);
			try {
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
						),
						reply_count,
						reply_user_ids`,
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
					console.error("[MessageList] Failed to load messages:", error);
				} else if (data && channelId) {
					console.log("[MessageList] Database returned:", {
						channel: channelId,
						messages: data.length,
					});
					updateChannelMessages(channelId, data as Message[], parentId);

					if (needsInitialLoad) {
						INITIAL_LOAD_DONE.current = true;
						console.log(
							"[MessageList] First load complete, starting background prefetch",
						);
					}
				}
			} finally {
				setIsLoading(false);
			}
		}

		fetchMessages();
	}, [
		channelId,
		hasMessages,
		parentId,
		isMainView,
		updateChannelMessages,
		conversationId,
	]);

	if (isLoading && !hasMessages) {
		return (
			<div className="flex-1 flex items-center justify-center">
				<div className="text-custom-text-secondary">Loading messages...</div>
			</div>
		);
	}

	return (
		<div
			className={`flex flex-col gap-4 overflow-x-hidden ${
				isMainView ? "px-8 pt-7 pb-10" : "px-4 pt-3 pb-10"
			}`}
		>
			{messageGroups.map((chain, i) => (
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
