"use client";

import { useCallback, useEffect, useRef, useState, useMemo } from "react";
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

const supabase = createClient();

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

export function MessageList({
	channelId,
	conversationId,
	parentId,
	onThreadClick,
	isMainView,
	highlightedMessageId,
}: {
	channelId?: string;
	conversationId?: string;
	parentId?: string;
	onThreadClick?: (messageId: string) => void;
	isMainView?: boolean;
	highlightedMessageId?: string;
}) {
	const { getChannelMessages, updateChannelMessages } = useMessageCache();
	const [isInitialLoad, setIsInitialLoad] = useState(true);
	const messagesEndRef = useRef<HTMLDivElement>(null);

	// Get messages from cache or fetch them
	const messages = channelId ? getChannelMessages(channelId) : [];
	console.log(`[MessageList] Rendering channel ${channelId}`, {
		messageCount: messages.length,
		fromCache: messages.length > 0,
		isInitialLoad,
	});

	// Build a map of profiles for the thread replies indicator
	const profilesMap = useMemo(() => {
		console.log("[MessageList] Building profiles map", {
			messageCount: messages.length,
			uniqueProfiles: new Set(
				messages.map((m) => m.profile?.id).filter(Boolean),
			).size,
		});
		const map: Record<string, ProfileWithId> = {};
		for (const m of messages) {
			if (m.profile?.id) {
				map[m.profile.id] = m.profile;
			}
		}
		return map;
	}, [messages]);

	// Ensure we scroll to bottom only on new messages or initial load
	const scrollToBottom = useCallback(() => {
		messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
	}, []);

	// Initial load scroll
	useEffect(() => {
		if (isInitialLoad && messages.length > 0) {
			console.log("[MessageList] Initial load scroll", {
				messageCount: messages.length,
			});
			scrollToBottom();
			setIsInitialLoad(false);
		}
	}, [isInitialLoad, messages.length, scrollToBottom]);

	// Fetch messages if not in cache
	useEffect(() => {
		if (!channelId || messages.length > 0) return;

		async function fetchMessages() {
			console.log(`[MessageList] Fetching messages for channel ${channelId}`, {
				parentId,
				isMainView,
			});

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
				.eq("channel_id", channelId)
				.order("created_at", { ascending: true });

			if (parentId) {
				query.eq("parent_id", parentId);
			} else if (isMainView) {
				query.is("parent_id", null);
			}

			const { data, error } = await query;

			if (error) {
				console.error("[MessageList] Error fetching messages:", error);
			} else if (data && channelId) {
				console.log(`[MessageList] Successfully fetched messages`, {
					channelId,
					messageCount: data.length,
					firstMessageId: data[0]?.id,
					lastMessageId: data[data.length - 1]?.id,
				});
				updateChannelMessages(channelId, data as Message[]);
			}
		}

		fetchMessages();
	}, [channelId, messages.length, parentId, isMainView, updateChannelMessages]);

	// Group messages into chains
	const messageGroups = groupConsecutiveMessages(messages);

	return (
		<div
			className={`flex flex-col gap-4 overflow-x-hidden ${
				isMainView ? "px-8 pt-7 pb-10" : "px-4 pt-3 pb-10"
			}`}
		>
			{messageGroups.map((chain, i) => (
				<ChainGroup
					key={`chain-${chain.userId}-${i}`}
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

function ChainGroup({
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
	if (!firstMessage?.profile) return null;

	const [isMounted, setIsMounted] = useState(false);
	const [lineStyle, setLineStyle] = useState<React.CSSProperties>({});
	const chainRef = useRef<HTMLDivElement>(null);
	const showChainLine = chain.messages.length > 1;

	useEffect(() => {
		// Trigger mount animation after a small delay to ensure DOM is ready
		const timer = setTimeout(() => {
			setIsMounted(true);
		}, 100);
		return () => clearTimeout(timer);
	}, []);

	useEffect(() => {
		if (!showChainLine || !chainRef.current) return;

		const updateLineHeight = () => {
			console.log("[ChainGroup] Updating chain line", {
				messageCount: chain.messages.length,
				userId: chain.userId,
			});
			const chainRect = chainRef.current?.getBoundingClientRect();
			if (!chainRect) return;

			const startY = chainRect.top + 40; // Avatar offset

			const lastDiv = chainRef.current?.querySelector("[data-last-message]");
			if (!lastDiv) {
				console.log("[ChainGroup] No last message found for chain line");
				setLineStyle({ display: "none" });
				return;
			}
			const lastRect = (lastDiv as HTMLElement).getBoundingClientRect();
			const lastBottom = lastRect.bottom;

			const totalHeight = lastBottom - startY;
			if (totalHeight <= 0) {
				console.log("[ChainGroup] Invalid chain line height", { totalHeight });
				setLineStyle({ display: "none" });
				return;
			}

			console.log("[ChainGroup] Setting chain line style", {
				height: totalHeight,
				color: firstMessage.profile.avatar_color || "rgb(20, 148, 132)",
			});
			setLineStyle({
				height: isMounted ? `${totalHeight}px` : "0px",
				background: firstMessage.profile.avatar_color || "rgb(20, 148, 132)",
				maskImage: "linear-gradient(to bottom, black, transparent)",
				WebkitMaskImage: "linear-gradient(to bottom, black, transparent)",
			});
		};

		updateLineHeight();

		const resizeObserver = new ResizeObserver(() => {
			console.log("[ChainGroup] Resize detected, updating chain line");
			updateLineHeight();
		});
		resizeObserver.observe(chainRef.current);

		return () => {
			console.log("[ChainGroup] Cleaning up chain line observer");
			resizeObserver.disconnect();
		};
	}, [
		showChainLine,
		firstMessage.profile.avatar_color,
		isMounted,
		chain.messages.length,
		chain.userId,
	]);

	return (
		<div ref={chainRef} className="space-y-0.5 relative">
			{/* First message row (with avatar) */}
			<div
				className="group relative flex items-start gap-4 py-0.5 px-8 -mx-8 transition-colors"
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
							<MessageContent content={message.content} files={message.files} />
							{showThreadButton && onThreadClick && message.reply_count > 0 && (
								<ThreadRepliesIndicator
									messageId={message.id}
									replyUserIds={message.reply_user_ids}
									profiles={profiles}
									onClick={() => onThreadClick(message.id)}
									highlightedMessageId={highlightedMessageId}
								/>
							)}
						</div>
					</div>
				);
			})}
		</div>
	);
}
