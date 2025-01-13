import { useCallback, useEffect, useRef, useState, useMemo } from "react";
import { createClient } from "@/utils/supabase/client";
import type {
	Message,
	MessageGroup,
	MessagePayload,
	MessageInsertPayload,
} from "@/types/message";
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

		// If the message lacks a valid profile or ID, decide how you want to handle it:
		if (!m.profile || !m.profile.id) {
			// Option A: skip it
			continue;
			// Option B: handle differently (e.g., push into a special group)
		}

		// Compare the current message's user ID with our currentGroup
		if (m.profile.id === currentGroup.userId) {
			currentGroup.messages.push(m);
		} else {
			// Start a new group whenever the user ID changes
			groups.push(currentGroup);
			currentGroup = { userId: m.profile.id, messages: [m] };
		}
	}

	// Ensure the last group is included
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
	const [messages, setMessages] = useState<Message[]>([]);
	const [isInitialLoad, setIsInitialLoad] = useState(true);
	const messagesEndRef = useRef<HTMLDivElement>(null);

	// Debug effect to track message state changes
	useEffect(() => {
		console.log("[MessageList] Messages state updated:", messages.length);
	}, [messages]);

	// Ensure we scroll to bottom only on new messages or initial load
	const scrollToBottom = useCallback(() => {
		messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
	}, []);

	// Initial load scroll
	useEffect(() => {
		if (isInitialLoad && messages.length > 0) {
			scrollToBottom();
			setIsInitialLoad(false);
		}
	}, [isInitialLoad, messages.length, scrollToBottom]);

	// Create a stable message update handler
	const handleMessageUpdate = useCallback(
		async (payload: MessagePayload) => {
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
				.eq("id", payload.new.id)
				.single();

			if (error) {
				console.error(
					"[MessageList] Error fetching updated message details:",
					error,
				);
				return;
			}

			if (data) {
				setMessages((prev) =>
					prev.map((m) =>
						m.id === data.id
							? ({ ...data, files: data.files || [] } as Message)
							: m,
					),
				);
			}
		},
		[], // No dependencies needed as supabase client is stable
	);

	// Create a stable message insert handler
	const handleMessageInsert = useCallback(
		async (payload: MessageInsertPayload) => {
			// Only process messages that match our view
			if (parentId) {
				if (payload.new.parent_id !== parentId) return;
			} else if (isMainView) {
				if (channelId && payload.new.channel_id !== channelId) return;
				if (conversationId && payload.new.conversation_id !== conversationId)
					return;
				if (payload.new.parent_id !== null) return;
			}

			// Add a small delay to ensure file insert has completed
			await new Promise((resolve) => setTimeout(resolve, 500));

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
				.eq("id", payload.new.id)
				.single();

			if (error) {
				console.error(
					"[MessageList] Error fetching new message details:",
					error,
				);
				return;
			}

			if (data) {
				setMessages((prev) => {
					const newMessages = [
						...prev,
						{ ...data, files: data.files || [] } as Message,
					];
					const isAtBottom =
						messagesEndRef.current &&
						window.innerHeight + window.scrollY >=
							document.documentElement.scrollHeight - 100;

					if (isAtBottom) {
						setTimeout(scrollToBottom, 100);
					} else {
						// Check if it's the current user's message
						supabase.auth.getSession().then(({ data: { session } }) => {
							if (data.user_id === session?.user?.id) {
								setTimeout(scrollToBottom, 100);
							}
						});
					}

					return newMessages;
				});
			}
		},
		[parentId, channelId, conversationId, isMainView, scrollToBottom],
	);

	// Fetch & subscribe to messages
	useEffect(() => {
		if (!channelId && !conversationId) return;

		const channelName = `messages-${isMainView ? "main" : "thread"}-${
			channelId || conversationId
		}`;

		setIsInitialLoad(true);

		async function fetchMessages() {
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
				.eq(
					channelId ? "channel_id" : "conversation_id",
					channelId || conversationId,
				)
				.order("created_at", { ascending: true });

			if (parentId) {
				query.eq("parent_id", parentId);
			} else if (isMainView) {
				query.is("parent_id", null);
			}

			const { data, error } = await query;

			if (error) {
				console.warn("[MessageList] Error fetching messages:", error);
			} else if (data) {
				setMessages(data as Message[]);
			}
		}

		fetchMessages();

		const channel = supabase
			.channel(channelName)
			.on(
				"postgres_changes",
				{
					event: "INSERT",
					schema: "public",
					table: "messages",
				},
				handleMessageInsert,
			)
			.on(
				"postgres_changes",
				{
					event: "UPDATE",
					schema: "public",
					table: "messages",
				},
				handleMessageUpdate,
			)
			.on(
				"postgres_changes",
				{
					event: "INSERT",
					schema: "public",
					table: "files",
				},
				async (payload) => {
					// When a file is inserted, fetch the updated message
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
						.eq("id", payload.new.message_id)
						.single();

					if (error) {
						console.error(
							"[MessageList] Error fetching message after file insert:",
							error,
						);
						return;
					}

					if (data) {
						setMessages((prev) =>
							prev.map((m) =>
								m.id === data.id
									? ({ ...data, files: data.files || [] } as Message)
									: m,
							),
						);
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
		handleMessageInsert,
		handleMessageUpdate,
	]);

	// Group messages into chains
	const messageGroups = groupConsecutiveMessages(messages);

	return (
		<div
			className={`flex flex-col gap-4 overflow-x-hidden ${isMainView ? "px-8 pt-7 pb-10" : "px-4 pt-3 pb-10"}`}
		>
			{messageGroups.map((chain, i) => (
				<ChainGroup
					key={`chain-${chain.userId}-${i}`}
					chain={chain}
					onThreadClick={onThreadClick}
					showThreadButton={isMainView}
					highlightedMessageId={highlightedMessageId}
				/>
			))}
			<div ref={messagesEndRef} />
		</div>
	);
}

/* ------------- The ChainGroup Component ------------- */
function ChainGroup({
	chain,
	onThreadClick,
	showThreadButton,
	highlightedMessageId,
}: {
	chain: { userId: string; messages: Message[] };
	onThreadClick?: (messageId: string) => void;
	showThreadButton?: boolean;
	highlightedMessageId?: string;
}) {
	const { messages } = chain;
	const firstMsg = messages[0];
	const userProfile = firstMsg.profile;
	const showChainLine = messages.length > 1;
	const chainRef = useRef<HTMLDivElement>(null);
	const [lineStyle, setLineStyle] = useState<React.CSSProperties>({});
	const [isMounted, setIsMounted] = useState(false);
	const [hoveredMessageId, setHoveredMessageId] = useState<string | null>(null);

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
			const chainRect = chainRef.current?.getBoundingClientRect();
			if (!chainRect) return;

			const startY = chainRect.top + 40; // Avatar offset

			const lastDiv = chainRef.current?.querySelector("[data-last-message]");
			if (!lastDiv) {
				setLineStyle({ display: "none" });
				return;
			}
			const lastRect = (lastDiv as HTMLElement).getBoundingClientRect();
			const lastBottom = lastRect.bottom;

			const totalHeight = lastBottom - startY;
			if (totalHeight <= 0) {
				setLineStyle({ display: "none" });
				return;
			}

			setLineStyle({
				height: isMounted ? `${totalHeight}px` : "0px",
				background: userProfile.avatar_color || "rgb(20, 148, 132)",
				maskImage: "linear-gradient(to bottom, black, transparent)",
				WebkitMaskImage: "linear-gradient(to bottom, black, transparent)",
			});
		};

		// Initial calculation
		updateLineHeight();

		// Set up ResizeObserver
		const resizeObserver = new ResizeObserver(updateLineHeight);
		resizeObserver.observe(chainRef.current);

		return () => {
			resizeObserver.disconnect();
		};
	}, [showChainLine, userProfile.avatar_color, isMounted]);

	// Build a map of profiles for the thread replies indicator
	const profilesMap = useMemo(() => {
		const map: Record<string, Message["profile"]> = {};
		for (const m of messages) {
			if (m.profile?.id) {
				map[m.profile.id] = {
					id: m.profile.id,
					full_name: m.profile.full_name,
					display_name: m.profile.display_name,
					avatar_url: m.profile.avatar_url,
					avatar_color: m.profile.avatar_color,
					avatar_cache: m.profile.avatar_cache,
				};
			}
		}
		return map;
	}, [messages]);

	return (
		<div ref={chainRef} className="space-y-0.5 relative">
			{/* 1) FIRST MESSAGE ROW (with avatar) */}
			<div
				className="group relative flex items-start gap-4 py-0.5 px-8 -mx-8 transition-colors"
				onMouseEnter={() => setHoveredMessageId(firstMsg.id)}
				onMouseLeave={() => setHoveredMessageId(null)}
				style={
					{
						["--hover-bg" as string]:
							userProfile.avatar_color || "rgb(20, 148, 132)",
					} as React.CSSProperties
				}
			>
				<div
					className={`absolute inset-0 ${highlightedMessageId === firstMsg.id ? "opacity-5" : "opacity-0 group-hover:opacity-5"} transition-opacity pointer-events-none`}
					style={{ backgroundColor: "var(--hover-bg)" }}
				/>
				{/* Avatar */}
				<div className="relative w-10 flex-shrink-0">
					<UserAvatar
						fullName={userProfile.full_name || "User"}
						displayName={userProfile.display_name}
						avatarUrl={userProfile.avatar_url}
						avatarCache={userProfile.avatar_cache}
						avatarColor={userProfile.avatar_color || "rgb(20, 148, 132)"}
						size="md"
					/>

					{/* Chain line */}
					{showChainLine && (
						<div
							className="absolute left-1/2 top-10 w-0.5 -translate-x-1/2 transition-[height] duration-1000 ease-out"
							style={lineStyle}
						/>
					)}
				</div>

				{/* Name + Timestamp + Content */}
				<div className="flex-1 min-w-0">
					<div className="flex items-baseline mb-0.5">
						<span className="font-semibold text-custom-text">
							{userProfile.display_name || userProfile.full_name}
						</span>
						<MessageTimestamp
							timestamp={firstMsg.created_at}
							className="ml-2"
						/>
					</div>
					<div className="relative">
						<MessageContent content={firstMsg.content} files={firstMsg.files} />
						{showThreadButton &&
							onThreadClick &&
							!firstMsg.reply_count &&
							hoveredMessageId === firstMsg.id &&
							highlightedMessageId !== firstMsg.id && (
								<div
									className="absolute left-0 h-6 z-20 w-fit"
									style={{ bottom: "-22px" }}
									onMouseEnter={() => setHoveredMessageId(firstMsg.id)}
								>
									<Button
										variant="ghost"
										size="sm"
										onClick={() => onThreadClick(firstMsg.id)}
										className="text-custom-text-secondary hover:text-custom-text border border-custom-ui-medium bg-custom-background-secondary hover:bg-custom-ui-faint transition-colors"
									>
										<ListEnd className="h-4 w-4 mr-1 -scale-x-100" />
										Reply in thread
									</Button>
								</div>
							)}
						{showThreadButton && onThreadClick && firstMsg.reply_count > 0 && (
							<ThreadRepliesIndicator
								messageId={firstMsg.id}
								replyUserIds={firstMsg.reply_user_ids}
								profiles={profilesMap}
								onClick={() => onThreadClick(firstMsg.id)}
								highlightedMessageId={highlightedMessageId}
							/>
						)}
					</div>
				</div>
			</div>

			{/* 2) SUBSEQUENT MESSAGES */}
			{messages.length > 1 &&
				messages.slice(1).map((m, idx) => {
					const isLast = idx === messages.slice(1).length - 1;
					return (
						<div
							key={m.id}
							data-last-message={isLast ? true : undefined}
							className="-mx-8 px-8 group relative py-0.5 transition-colors"
							onMouseEnter={() => setHoveredMessageId(m.id)}
							onMouseLeave={() => setHoveredMessageId(null)}
							style={
								{
									["--hover-bg" as string]:
										userProfile.avatar_color || "rgb(20, 148, 132)",
								} as React.CSSProperties
							}
						>
							<div
								className={`absolute inset-0 ${highlightedMessageId === m.id ? "opacity-5" : "opacity-0 group-hover:opacity-5"} transition-opacity pointer-events-none`}
								style={{ backgroundColor: "var(--hover-bg)" }}
							/>
							<div className="ml-[3.5rem]">
								<div className="absolute left-[3.5rem] top-0 bottom-0 -translate-x-1/2 flex items-center pr-2 opacity-0 group-hover:opacity-100">
									<MessageTimestamp timestamp={m.created_at} hideColon />
								</div>
								<div className="relative">
									<MessageContent content={m.content} files={m.files} />
									{showThreadButton &&
										onThreadClick &&
										!m.reply_count &&
										hoveredMessageId === m.id &&
										highlightedMessageId !== m.id && (
											<div
												className="absolute left-0 h-6 z-20 w-fit"
												style={{ bottom: "-22px" }}
												onMouseEnter={() => setHoveredMessageId(m.id)}
											>
												<Button
													variant="ghost"
													size="sm"
													onClick={() => onThreadClick(m.id)}
													className="text-custom-text-secondary hover:text-custom-text border border-custom-ui-medium bg-custom-background-secondary hover:bg-custom-ui-faint transition-colors"
												>
													<ListEnd className="h-4 w-4 mr-1 -scale-x-100" />
													Reply in thread
												</Button>
											</div>
										)}
									{showThreadButton && onThreadClick && m.reply_count > 0 && (
										<ThreadRepliesIndicator
											messageId={m.id}
											replyUserIds={m.reply_user_ids}
											profiles={profilesMap}
											onClick={() => onThreadClick(m.id)}
											highlightedMessageId={highlightedMessageId}
										/>
									)}
								</div>
							</div>
						</div>
					);
				})}
		</div>
	);
}
