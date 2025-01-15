"use client";

import { useState } from "react";
import { MessageContainer } from "@/components/messages/MessageContainer";
import { Button } from "@/components/ui/button";
import { Files } from "lucide-react";

interface ChannelContentProps {
	channel: {
		id: string;
		name: string;
		description: string | null;
	};
}

export function ChannelContent({ channel }: ChannelContentProps) {
	const [showFiles, setShowFiles] = useState(false);

	return (
		<div className="flex flex-col h-full">
			{/* Channel Header */}
			<div className="shrink-0">
				<div className="px-4 py-3 flex items-center justify-between">
					<h1 className="font-semibold">
						<span className="text-custom-text-secondary">#</span> {channel.name}
					</h1>
					<Button
						variant="ghost"
						size="icon"
						onClick={() => setShowFiles(true)}
						className="text-custom-text-secondary hover:text-custom-text hover:bg-custom-ui-faint"
					>
						<Files className="h-4 w-4" />
					</Button>
				</div>
				<div className="border-t border-custom-ui-medium" />
			</div>

			{/* Messages */}
			<div className="flex-1 min-h-0">
				<MessageContainer
					channelId={channel.id}
					showFiles={showFiles}
					onCloseFiles={() => setShowFiles(false)}
				/>
			</div>
		</div>
	);
}
