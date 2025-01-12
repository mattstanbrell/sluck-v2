import {
	useEffect,
	useLayoutEffect,
	useRef,
	useState,
	useCallback,
	type CSSProperties,
} from "react";
import { createClient } from "@/utils/supabase/client";
import { MessageContent } from "./MessageContent";
import { MessageTimestamp } from "./MessageTimestamp";
import { UserAvatar } from "@/components/ui/UserAvatar";
import { Button } from "@/components/ui/button";
import { MessageCircle } from "lucide-react";
import type { Database } from "@/lib/database.types";

/* ------------------ Types & Helpers ------------------ */

type Message = Database["public"]["Tables"]["messages"]["Row"] & {
	profile: {
		id: string;
		full_name: string | null;
		display_name: string | null;
		avatar_url: string | null;
		avatar_color: string | null;
		avatar_cache: string | null;
	};
};

type MessageGroup = {
	userId: string;
	messages: Message[];
};

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
}: {
	channelId?: string;
	conversationId?: string;
	parentId?: string;
	onThreadClick?: (messageId: string) => void;
	isMainView?: boolean;
}) {
	const [messages, setMessages] = useState<Message[]>([]);
	const supabase = createClient();
	const messagesEndRef = useRef<HTMLDivElement>(null);

	// Debug effect to track message state changes
	useEffect(() => {
		console.log("[MessageList] Messages state updated:", messages.length);
	}, [messages]);

	// Ensure we scroll to bottom on new messages
	const scrollToBottom = useCallback(() => {
		messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
	}, []);

	useEffect(() => {
		scrollToBottom();
	}, [scrollToBottom, messages]);

	// Fetch & subscribe to messages
	useEffect(() => {
		if (!channelId && !conversationId) return;

		console.log("[MessageList] Setting up subscription", {
			channelId,
			conversationId,
			parentId,
			isMainView,
		});

		async function fetchMessages() {
			console.log("[MessageList] Fetching initial messages");
			const query = supabase
				.from("messages")
				.select(
					`
            *,
            profile:profiles (
              id,
              full_name,
              display_name,
              avatar_url,
              avatar_color,
              avatar_cache
            )
          `,
				)
				.eq(
					channelId ? "channel_id" : "conversation_id",
					channelId || conversationId,
				)
				.order("created_at", { ascending: true });

			// If parentId is provided, filter for thread messages
			if (parentId) {
				query.eq("parent_id", parentId);
			} else if (isMainView) {
				query.is("parent_id", null);
			}

			const { data, error } = await query;

			if (error) {
				console.warn("[MessageList] Error fetching messages:", error);
			} else if (data) {
				console.log("[MessageList] Initial messages loaded:", data.length);
				setMessages(data as Message[]);
				scrollToBottom();
			}
		}

		fetchMessages();

		// Realtime subscription
		console.log("[MessageList] Setting up subscription with NO filter", {
			channelId,
			conversationId,
			parentId,
			isMainView,
		});

		const channel = supabase
			.channel(
				`messages-${isMainView ? "main" : "thread"}-${channelId || conversationId}`,
			)
			.on(
				"postgres_changes",
				{
					event: "INSERT",
					schema: "public",
					table: "messages",
				},
				async (payload) => {
					console.log("[MessageList] Received ANY message:", {
						messageId: payload.new.id,
						channelId: payload.new.channel_id,
						conversationId: payload.new.conversation_id,
						parentId: payload.new.parent_id,
						content: payload.new.content.slice(0, 50) + "...",
						isMainView,
					});

					// Only process messages that match our view
					if (parentId) {
						if (payload.new.parent_id !== parentId) {
							console.log("[MessageList] Skipping - wrong parent_id");
							return;
						}
					} else if (isMainView) {
						if (channelId && payload.new.channel_id !== channelId) {
							console.log("[MessageList] Skipping - wrong channel_id");
							return;
						}
						if (
							conversationId &&
							payload.new.conversation_id !== conversationId
						) {
							console.log("[MessageList] Skipping - wrong conversation_id");
							return;
						}
						if (payload.new.parent_id !== null) {
							console.log("[MessageList] Skipping - is a thread message");
							return;
						}
					}

					// Fetch the newly inserted message with its profile
					const { data, error } = await supabase
						.from("messages")
						.select(
							`
                *,
                profile:profiles (
                  id,
                  full_name,
                  display_name,
                  avatar_url,
                  avatar_color,
                  avatar_cache
                )
              `,
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
						// Force a new array reference to ensure re-render
						setMessages((prev) => {
							console.log("[MessageList] Adding new message to state:", {
								messageId: data.id,
								content: data.content.slice(0, 50) + "...",
								currentMessageCount: prev.length,
								isMainView,
							});

							const newMessages = [...prev, data as Message];
							console.log(
								"[MessageList] New message count:",
								newMessages.length,
							);
							return newMessages;
						});
					}
				},
			)
			.subscribe((status) => {
				console.log("[MessageList] Subscription status:", status);
			});

		return () => {
			console.log("[MessageList] Cleaning up subscription");
			channel.unsubscribe();
		};
	}, [
		channelId,
		conversationId,
		parentId,
		supabase,
		scrollToBottom,
		isMainView,
	]);

	const getInitials = (name: string) =>
		name
			.split(" ")
			.map((n) => n[0])
			.join("")
			.toUpperCase();

	const groups = groupConsecutiveMessages(messages);

	return (
		<div className="flex flex-col px-8 py-4 overflow-x-hidden">
			{groups.map((chain) => (
				<ChainGroup
					key={`${chain.userId}-${chain.messages[0].id}`}
					chain={chain}
					getInitials={getInitials}
					onThreadClick={onThreadClick}
					showThreadButton={!parentId}
				/>
			))}
			<div ref={messagesEndRef} />
		</div>
	);
}

/* ------------- The ChainGroup Component ------------- */
function ChainGroup({
	chain,
	getInitials,
	onThreadClick,
	showThreadButton,
}: {
	chain: { userId: string; messages: Message[] };
	getInitials: (name: string) => string;
	onThreadClick?: (messageId: string) => void;
	showThreadButton?: boolean;
}) {
	const { messages } = chain;
	const firstMsg = messages[0];
	const userProfile = firstMsg.profile;
	const showChainLine = messages.length > 1;
	const chainRef = useRef<HTMLDivElement>(null);
	const [lineStyle, setLineStyle] = useState<CSSProperties>({});
	const [isMounted, setIsMounted] = useState(false);

	useEffect(() => {
		// Trigger mount animation after a small delay to ensure DOM is ready
		const timer = setTimeout(() => {
			setIsMounted(true);
		}, 100);
		return () => clearTimeout(timer);
	}, []);

	useLayoutEffect(() => {
		if (!showChainLine || !chainRef.current) return;

		const chainRect = chainRef.current.getBoundingClientRect();
		const startY = chainRect.top + 40; // Avatar offset

		const lastDiv = chainRef.current.querySelector("[data-last-message]");
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
			transition: "height 1s ease-out",
		});
	}, [showChainLine, userProfile.avatar_color, isMounted, messages.length]);

	return (
		<div ref={chainRef} className="mt-6 space-y-0.5">
			{/* 1) FIRST MESSAGE ROW (with avatar) */}
			<div
				className="-mx-8 px-8 group relative flex items-start gap-4 py-2 transition-colors"
				style={
					{
						["--hover-bg" as string]:
							userProfile.avatar_color || "rgb(20, 148, 132)",
					} as CSSProperties
				}
			>
				<div
					className="absolute inset-0 opacity-0 group-hover:opacity-5 transition-opacity pointer-events-none"
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
						size={10}
					/>

					{/* Chain line */}
					{showChainLine && (
						<div
							className="absolute left-1/2 top-10 w-0.5 -translate-x-1/2"
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
					<div className="group/message">
						<MessageContent content={firstMsg.content} />
						{showThreadButton && onThreadClick && (
							<Button
								variant="ghost"
								size="sm"
								onClick={() => onThreadClick(firstMsg.id)}
								className="mt-1 text-custom-text-secondary hover:text-custom-text opacity-60 hover:opacity-100 transition-opacity"
							>
								<MessageCircle className="h-4 w-4 mr-1" />
								Reply in thread
							</Button>
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
							className="-mx-8 px-8 group relative py-1 transition-colors"
							style={
								{
									["--hover-bg" as string]:
										userProfile.avatar_color || "rgb(20, 148, 132)",
								} as React.CSSProperties
							}
						>
							<div
								className="absolute inset-0 opacity-0 group-hover:opacity-5 transition-opacity pointer-events-none"
								style={{ backgroundColor: "var(--hover-bg)" }}
							/>
							{/* Shift message content to match avatar area */}
							<div className="ml-[3.5rem]">
								{/* Center the timestamp vertically with the message */}
								<div className="absolute left-[3.5rem] top-0 bottom-0 -translate-x-1/2 flex items-center pr-2 opacity-0 group-hover:opacity-100">
									<MessageTimestamp timestamp={m.created_at} hideColon />
								</div>
								<div className="group/message">
									<MessageContent content={m.content} />
									{showThreadButton && onThreadClick && (
										<Button
											variant="ghost"
											size="sm"
											onClick={() => onThreadClick(m.id)}
											className="mt-1 text-custom-text-secondary hover:text-custom-text opacity-60 hover:opacity-100 transition-opacity"
										>
											<MessageCircle className="h-4 w-4 mr-1" />
											Reply in thread
										</Button>
									)}
								</div>
							</div>
						</div>
					);
				})}
		</div>
	);
}
