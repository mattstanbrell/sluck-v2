"use client";

import { useState } from "react";
import { MessageList } from "@/components/messages/MessageList";
import { MessageInput } from "@/components/messages/MessageInput";
import { ThreadPanel } from "@/components/messages/ThreadPanel";

export function MessageContainer({
	channelId,
	conversationId,
}: {
	channelId?: string;
	conversationId?: string;
}) {
	const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);

	return (
		<div className="flex h-full">
			{/* Main message list */}
			<div
				className={`flex flex-col ${selectedThreadId ? "flex-1" : "w-full"}`}
			>
				<div className="flex-1 overflow-y-auto min-h-0">
					<MessageList
						channelId={channelId}
						conversationId={conversationId}
						onThreadClick={setSelectedThreadId}
					/>
				</div>
				<div className="shrink-0">
					<MessageInput channelId={channelId} conversationId={conversationId} />
				</div>
			</div>

			{/* Thread panel */}
			{selectedThreadId && (
				<ThreadPanel
					selectedMessageId={selectedThreadId}
					channelId={channelId}
					conversationId={conversationId}
					onClose={() => setSelectedThreadId(null)}
				/>
			)}
		</div>
	);
}
