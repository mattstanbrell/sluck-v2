import React, {
	useEffect,
	useLayoutEffect,
	useRef,
	useState,
	useCallback,
	CSSProperties,
} from "react";
import { createClient } from "@/utils/supabase/client";
import { MessageContent } from "./MessageContent";
import { MessageTimestamp } from "./MessageTimestamp";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
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

/**
 * Group consecutive messages from the same user
 * into "chains". So if userA sends 3 in a row, that becomes 1 chain.
 */
function groupConsecutiveMessages(messages: Message[]) {
	if (!messages.length) return [];
	const groups: Array<{ userId: string; messages: Message[] }> = [];
	let currentGroup = {
		userId: messages[0].profile.id,
		messages: [messages[0]],
	};

	for (let i = 1; i < messages.length; i++) {
		const m = messages[i];
		if (m.profile.id === currentGroup.userId) {
			currentGroup.messages.push(m);
		} else {
			groups.push(currentGroup);
			currentGroup = { userId: m.profile.id, messages: [m] };
		}
	}

	groups.push(currentGroup);
	return groups;
}

export function MessageList({
	channelId,
	conversationId,
}: {
	channelId?: string;
	conversationId?: string;
}) {
	const [messages, setMessages] = useState<Message[]>([]);
	const supabase = createClient();
	const messagesEndRef = useRef<HTMLDivElement>(null);

	// Ensure we scroll to bottom on new messages
	const scrollToBottom = useCallback(() => {
		messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
	}, []);

	useEffect(() => {
		scrollToBottom();
	}, [messages, scrollToBottom]);

	// Fetch & subscribe to messages
	useEffect(() => {
		if (!channelId && !conversationId) return;

		async function fetchMessages() {
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
				.eq(
					channelId ? "channel_id" : "conversation_id",
					channelId || conversationId,
				)
				.order("created_at", { ascending: true });

			if (error) {
				console.warn("Error fetching messages:", error);
			} else if (data) {
				setMessages(data as Message[]);
			}
		}

		fetchMessages();

		// Realtime subscription
		const channel = supabase
			.channel("messages")
			.on(
				"postgres_changes",
				{
					event: "INSERT",
					schema: "public",
					table: "messages",
					filter: channelId
						? `channel_id=eq.${channelId}`
						: `conversation_id=eq.${conversationId}`,
				},
				async (payload) => {
					// Fetch the newly inserted message with its profile
					const { data } = await supabase
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

					if (data) {
						setMessages((prev) => [...prev, data as Message]);
					}
				},
			)
			.subscribe();

		return () => {
			channel.unsubscribe();
		};
	}, [channelId, conversationId, supabase]);

	const getInitials = (name: string) =>
		name
			.split(" ")
			.map((n) => n[0])
			.join("")
			.toUpperCase();

	const groups = groupConsecutiveMessages(messages);

	return (
		<div className="flex flex-col p-4 pl-8">
			{groups.map((chain) => (
				<ChainGroup
					key={`${chain.userId}-${chain.messages[0].id}`}
					chain={chain}
					getInitials={getInitials}
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
}: {
	chain: { userId: string; messages: Message[] };
	getInitials: (name: string) => string;
}) {
	const { messages } = chain;
	const firstMsg = messages[0];
	const userProfile = firstMsg.profile;
	const showChainLine = messages.length > 1;
	const chainRef = useRef<HTMLDivElement>(null);
	const [lineStyle, setLineStyle] = useState<CSSProperties>({});
	const [isMounted, setIsMounted] = useState(false);
	const [avatarSrc, setAvatarSrc] = useState<string | undefined>(undefined);

	// Handle avatar loading and fallbacks
	useEffect(() => {
		// Try primary URL first
		const img = new Image();
		img.onload = () => {
			setAvatarSrc(userProfile.avatar_url || undefined);
		};
		img.onerror = () => {
			// Try cache if primary URL fails
			if (userProfile.avatar_cache) {
				setAvatarSrc(`data:image/jpeg;base64,${userProfile.avatar_cache}`);
			} else {
				setAvatarSrc(undefined);
			}
		};
		img.src = userProfile.avatar_url || "";
	}, [userProfile]);

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
	}, [messages, showChainLine, userProfile.avatar_color, isMounted]);

	return (
		<div ref={chainRef} className="mt-6 space-y-0.5">
			{/* 1) FIRST MESSAGE ROW (with avatar) */}
			<div
				className="-mx-8 px-8 group relative flex items-start gap-4 py-2 transition-colors"
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
				{/* Avatar */}
				<div className="relative w-10 flex-shrink-0">
					<Avatar className="w-10 h-10 rounded-xl">
						<AvatarImage
							src={avatarSrc}
							alt={userProfile.display_name || userProfile.full_name || ""}
						/>
						<AvatarFallback className="bg-custom-text-secondary text-white rounded-xl">
							{getInitials(
								userProfile.display_name || userProfile.full_name || "",
							)}
						</AvatarFallback>
					</Avatar>

					{/* Chain line */}
					{showChainLine && (
						<div
							className="absolute top-[40px] left-1/2 -translate-x-1/2 w-[2px]"
							style={{
								...lineStyle,
								background: !avatarSrc
									? "var(--custom-text-secondary)"
									: lineStyle.background,
							}}
						/>
					)}
				</div>

				{/* Name + Timestamp + Content */}
				<div className="flex-1 min-w-0">
					<div className="flex items-baseline mb-0.5">
						<span className="font-medium text-custom-text">
							{userProfile.display_name || userProfile.full_name}
						</span>
						<MessageTimestamp
							timestamp={firstMsg.created_at}
							className="ml-2"
						/>
					</div>
					<MessageContent content={firstMsg.content} />
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
								<MessageContent content={m.content} />
							</div>
						</div>
					);
				})}
		</div>
	);
}
