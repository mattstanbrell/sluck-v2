"use client";

import { createClient } from "@/utils/supabase/client";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";

interface UnjoinedChannelViewProps {
	channelId: string;
	channelName: string;
	workspaceId: string;
}

export function UnjoinedChannelView({
	channelId,
	channelName,
	workspaceId,
}: UnjoinedChannelViewProps) {
	const router = useRouter();
	const supabase = createClient();

	const handleJoinChannel = async () => {
		const { error } = await supabase.from("channel_members").insert([
			{
				channel_id: channelId,
				user_id: (await supabase.auth.getUser()).data.user?.id,
				role: "member",
			},
		]);

		if (error) {
			console.error("Error joining channel:", error);
			return;
		}

		router.refresh();
	};

	return (
		<div className="h-[calc(100vh-4rem)] flex flex-col items-center justify-center relative bg-custom-background">
			{/* Blurred background effect */}
			<div className="absolute inset-0 overflow-hidden">
				<div className="w-full h-full flex flex-wrap gap-6 p-8 opacity-40 blur-md">
					{Array.from({ length: 15 }).map((_, i) => (
						<div
							key={`message-placeholder-${i}-${channelId}`}
							className="flex items-start space-x-4 w-full max-w-2xl mx-auto"
						>
							<div className="w-10 h-10 rounded-full bg-custom-ui-strong" />
							<div className="flex-1 space-y-3">
								<div className="h-4 bg-custom-ui-strong rounded w-40" />
								<div className="space-y-2">
									<div className="h-4 bg-custom-ui-strong rounded w-full" />
									<div className="h-4 bg-custom-ui-strong rounded w-4/5" />
								</div>
							</div>
						</div>
					))}
				</div>
			</div>

			{/* Join channel overlay */}
			<div className="relative z-10 text-center p-10 bg-custom-background-secondary rounded-lg shadow-lg border border-custom-ui-medium max-w-md w-full mx-4">
				<h2 className="text-2xl font-semibold text-custom-text mb-4">
					Join #{channelName}
				</h2>
				<p className="text-custom-text-secondary mb-8">
					You need to join this channel to view messages and participate in the
					conversation.
				</p>
				<Button
					onClick={handleJoinChannel}
					className="bg-custom-accent hover:bg-custom-accent/90 text-white font-medium px-8 py-2 text-base"
				>
					Join Channel
				</Button>
			</div>
		</div>
	);
}
