"use client";

import { createClient } from "@/utils/supabase/client";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";
import { logDB } from "@/utils/logging";
import { useToast } from "@/hooks/use-toast";

interface UnjoinedChannelViewProps {
	channelId: string;
	channelName: string;
	onJoin?: () => void;
}

export function UnjoinedChannelView({
	channelId,
	channelName,
	onJoin,
}: UnjoinedChannelViewProps) {
	const router = useRouter();
	const supabase = createClient();
	const { toast } = useToast();

	const handleJoinChannel = async () => {
		// Get current user
		const {
			data: { user },
			error: authError,
		} = await supabase.auth.getUser();

		logDB({
			operation: "SELECT",
			table: "auth.users",
			description: "Getting current user for channel join",
			result: user ? { id: user.id } : null,
			error: authError,
		});

		if (!user) {
			toast({
				title: "Error",
				description: "You must be logged in to join a channel",
				variant: "destructive",
			});
			return;
		}

		// Check if already a member
		const { data: existingMembership } = await supabase
			.from("channel_members")
			.select()
			.eq("channel_id", channelId)
			.eq("user_id", user.id)
			.single();

		if (existingMembership) {
			// If already a member, call onJoin
			onJoin?.();
			return;
		}

		// Join channel
		const { error } = await supabase.from("channel_members").insert([
			{
				channel_id: channelId,
				user_id: user.id,
				role: "member",
			},
		]);

		logDB({
			operation: "INSERT",
			table: "channel_members",
			description: `User ${user.id} joining channel ${channelId}`,
			error: error,
		});

		if (error) {
			if (error.code === "23505") {
				// If we hit a race condition and the membership was created
				// between our check and insert, call onJoin
				onJoin?.();
				return;
			}

			toast({
				title: "Error",
				description: "Failed to join channel. Please try again.",
				variant: "destructive",
			});
			return;
		}

		toast({
			title: "Success",
			description: `You've joined #${channelName}`,
		});

		// Call onJoin callback
		onJoin?.();
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
