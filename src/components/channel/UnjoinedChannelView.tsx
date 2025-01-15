"use client";

import { createClient } from "@/utils/supabase/client";
import { Button } from "@/components/ui/button";
import { useRouter, useSearchParams } from "next/navigation";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";
import { ChannelContent } from "./ChannelContent";

interface UnjoinedChannelViewProps {
	channelId: string;
	channelName: string;
}

export function UnjoinedChannelView({
	channelId,
	channelName,
}: UnjoinedChannelViewProps) {
	const router = useRouter();
	const searchParams = useSearchParams();
	const supabase = createClient();
	const { toast } = useToast();
	const [hasJoined, setHasJoined] = useState(false);

	const handleJoinChannel = async () => {
		try {
			// Get current user
			const {
				data: { user },
				error: userError,
			} = await supabase.auth.getUser();
			if (userError || !user) {
				toast({
					title: "Error",
					description: "You must be logged in to join channels",
					variant: "destructive",
				});
				return;
			}

			// Join the channel
			const { error } = await supabase.from("channel_members").insert([
				{
					channel_id: channelId,
					user_id: user.id,
					role: "member",
				},
			]);

			if (error) {
				console.error("Error joining channel:", error);
				toast({
					title: "Error",
					description: "Failed to join channel. Please try again.",
					variant: "destructive",
				});
				return;
			}

			// Get the current workspace ID from the URL
			const workspaceId = window.location.pathname.split("/")[2];

			// Fetch updated channel lists
			const { data: allChannels } = await supabase
				.from("channels")
				.select("id, name, slug, description")
				.eq("workspace_id", workspaceId)
				.order("name");

			if (allChannels) {
				// Get joined channels
				const { data: joinedChannelIds } = await supabase
					.from("channel_members")
					.select("channel_id")
					.eq("user_id", user.id);

				const joinedIds = new Set(joinedChannelIds?.map((m) => m.channel_id));
				const joinedChannels = allChannels.filter((c) => joinedIds.has(c.id));
				const unjoinedChannels = allChannels.filter(
					(c) => !joinedIds.has(c.id),
				);

				// Dispatch a custom event to update the sidebar
				window.dispatchEvent(
					new CustomEvent("updateChannels", {
						detail: { joinedChannels, unjoinedChannels },
					}),
				);
			}

			toast({
				title: "Success",
				description: `You've joined #${channelName}`,
			});

			// Update local state to show channel content
			setHasJoined(true);

			// Update URL to reflect membership
			const currentUrl = new URL(window.location.href);
			const newParams = new URLSearchParams(searchParams);
			newParams.set("isMember", "true");
			const pathname = currentUrl.pathname;
			router.replace(`${pathname}?${newParams.toString()}`);
		} catch (error) {
			console.error("Unexpected error:", error);
			toast({
				title: "Error",
				description: "An unexpected error occurred. Please try again.",
				variant: "destructive",
			});
		}
	};

	if (hasJoined) {
		return (
			<ChannelContent
				channel={{ id: channelId, name: channelName, description: null }}
			/>
		);
	}

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
