"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/utils/supabase/client";
import { MessageList } from "@/components/messages/MessageList";
import { MessageInput } from "@/components/messages/MessageInput";
import { MessageContent } from "@/components/messages/MessageContent";
import { UserAvatar } from "@/components/ui/UserAvatar";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";
import type { Database } from "@/lib/database.types";

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

interface ThreadPanelProps {
	selectedMessageId: string | null;
	channelId?: string;
	conversationId?: string;
	onClose: () => void;
}

export function ThreadPanel({
	selectedMessageId,
	channelId,
	conversationId,
	onClose,
}: ThreadPanelProps) {
	const supabase = createClient();
	const [parentMessage, setParentMessage] = useState<Message | null>(null);

	// If there's no thread selected, hide the panel
	if (!selectedMessageId) {
		return null;
	}

	// Load the parent message
	useEffect(() => {
		async function fetchParent() {
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
				.eq("id", selectedMessageId)
				.single();

			if (!error && data) {
				setParentMessage(data as Message);
			}
		}

		if (selectedMessageId) {
			fetchParent();
		}
	}, [selectedMessageId, supabase]);

	return (
		<div
			className={`
        fixed inset-0 z-50 bg-custom-background border-l border-custom-ui-medium
        sm:relative sm:w-[400px] sm:h-auto sm:z-auto
      `}
		>
			{/* Header */}
			<div className="flex items-center justify-between p-4 border-b border-custom-ui-medium">
				<h2 className="text-lg font-semibold text-custom-text">Thread</h2>
				<Button
					variant="ghost"
					size="icon"
					onClick={onClose}
					className="text-custom-text-secondary hover:text-custom-text"
				>
					<X className="h-4 w-4" />
				</Button>
			</div>

			{/* Parent Message */}
			{parentMessage && (
				<div className="border-b border-custom-ui-medium p-4">
					<div className="flex items-start gap-3">
						<UserAvatar
							fullName={parentMessage.profile?.full_name || "User"}
							displayName={parentMessage.profile?.display_name}
							avatarUrl={parentMessage.profile?.avatar_url}
							avatarCache={parentMessage.profile?.avatar_cache}
							avatarColor={
								parentMessage.profile?.avatar_color || "rgb(20, 148, 132)"
							}
							size={8}
						/>
						<div className="flex-1 min-w-0">
							<div className="flex items-baseline gap-2">
								<span className="font-semibold text-custom-text">
									{parentMessage.profile?.display_name ||
										parentMessage.profile?.full_name}
								</span>
							</div>
							<MessageContent content={parentMessage.content} />
						</div>
					</div>
				</div>
			)}

			{/* Thread Messages */}
			<div className="flex flex-col h-[calc(100%-200px)] sm:h-[500px]">
				<div className="flex-1 overflow-y-auto">
					<MessageList
						channelId={channelId}
						conversationId={conversationId}
						parentId={selectedMessageId}
					/>
				</div>
				<div className="shrink-0 border-t border-custom-ui-medium">
					<MessageInput
						channelId={channelId}
						conversationId={conversationId}
						parentId={selectedMessageId}
					/>
				</div>
			</div>
		</div>
	);
}
