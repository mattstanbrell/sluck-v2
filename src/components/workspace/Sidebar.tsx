"use client";

import { Button } from "@/components/ui/button";
import { createClient } from "@/utils/supabase/client";
import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { CreateChannelDialog } from "./CreateChannelDialog";
import { WorkspaceSettingsDialog } from "./WorkspaceSettingsDialog";
import { CreateDirectMessageDialog } from "./CreateDirectMessageDialog";
import { UserAvatar } from "@/components/ui/UserAvatar";
import type { ProfileDisplay } from "@/types/profile";
import type {
	ConversationWithParticipants,
	ConversationWithParticipant,
} from "@/types/conversation";
import type { ChannelBasic } from "@/types/channel";
import type { WorkspaceBasic } from "@/types/workspace";

type ConversationResponse = ConversationWithParticipants;
type Conversation = ConversationWithParticipant;
type UserProfile = ProfileDisplay;

export function Sidebar({ workspaceId }: { workspaceId: string }) {
	const [workspace, setWorkspace] = useState<WorkspaceBasic | null>(null);
	const [channels, setChannels] = useState<ChannelBasic[]>([]);
	const [conversations, setConversations] = useState<Conversation[]>([]);
	const [profile, setProfile] = useState<UserProfile | null>(null);
	const supabase = createClient();
	const router = useRouter();
	const pathname = usePathname();

	useEffect(() => {
		async function loadData() {
			// Get current user
			const {
				data: { user },
			} = await supabase.auth.getUser();
			if (!user) return;

			// Load workspace
			const { data: workspace } = await supabase
				.from("workspaces")
				.select("id, name, slug, description")
				.eq("id", workspaceId)
				.single();

			// Load channels
			const { data: channelsData, error: channelsError } = await supabase
				.from("channels")
				.select("id, name, slug, description")
				.eq("workspace_id", workspaceId)
				.order("name");

			if (channelsError) {
				console.error("[Sidebar] Error fetching channels:", channelsError);
				return;
			}

			if (channelsData) {
				setChannels(channelsData);
			}

			// Load conversations
			const { data: conversations } = await supabase
				.from("conversations")
				.select(`
					id,
					conversation_participants!inner (
						user_id,
						profiles!inner (
							full_name,
							display_name,
							avatar_url,
							avatar_cache
						)
					)
				`)
				.eq("workspace_id", workspaceId)
				.eq("type", "direct");

			// Transform conversations to get other participant
			const transformedConversations =
				(conversations as ConversationResponse[] | null)
					?.map((conv) => {
						const otherParticipant = conv.conversation_participants.find(
							(p) => p.user_id !== user.id,
						);
						if (!otherParticipant) return null;
						return {
							id: conv.id,
							participant: otherParticipant,
						};
					})
					.filter((conv): conv is Conversation => conv !== null) || [];

			// Load user profile
			const { data: profile } = await supabase
				.from("profiles")
				.select("full_name, display_name, avatar_url, avatar_cache")
				.eq("id", user.id)
				.single();

			setWorkspace(workspace);
			setConversations(transformedConversations || []);
			setProfile(profile);

			// Subscribe to channel changes
			const channelSubscription = supabase
				.channel("channel-changes")
				.on(
					"postgres_changes",
					{
						event: "*",
						schema: "public",
						table: "channels",
						filter: `workspace_id=eq.${workspaceId}`,
					},
					async () => {
						const { data: updatedChannels } = await supabase
							.from("channels")
							.select("id, name, slug")
							.eq("workspace_id", workspaceId)
							.order("name");

						setChannels(updatedChannels || []);
					},
				)
				.subscribe();

			// Subscribe to conversation changes
			const conversationSubscription = supabase
				.channel("conversation-changes")
				.on(
					"postgres_changes",
					{
						event: "*",
						schema: "public",
						table: "conversations",
						filter: `workspace_id=eq.${workspaceId}`,
					},
					async () => {
						const { data: updatedConversations } = await supabase
							.from("conversations")
							.select(`
								id,
								conversation_participants!inner (
									user_id,
									profiles!inner (
										full_name,
										display_name,
										avatar_url,
										avatar_cache
									)
								)
							`)
							.eq("workspace_id", workspaceId)
							.eq("type", "direct");

						const transformedConversations =
							(updatedConversations as ConversationResponse[] | null)
								?.map((conv) => {
									const otherParticipant = conv.conversation_participants.find(
										(p) => p.user_id !== user.id,
									);
									if (!otherParticipant) return null;
									return {
										id: conv.id,
										participant: otherParticipant,
									};
								})
								.filter((conv): conv is Conversation => conv !== null) || [];

						setConversations(transformedConversations);
					},
				)
				.subscribe();

			// Cleanup subscriptions
			return () => {
				channelSubscription.unsubscribe();
				conversationSubscription.unsubscribe();
			};
		}

		loadData();
	}, [workspaceId, supabase]);

	// Get display name in order of preference: display_name -> full_name -> 'User'
	// const displayName = profile?.display_name || profile?.full_name || "User";

	return (
		<div className="w-64 bg-custom-background-secondary border-r border-custom-ui-medium flex flex-col">
			{/* Workspace Header */}
			<div className="px-4 py-4 flex items-center justify-between">
				<h1 className="font-semibold text-lg text-custom-text">
					{workspace?.name || "Loading..."}
				</h1>
				<WorkspaceSettingsDialog
					workspaceId={workspaceId}
					workspaceSlug={workspace?.slug || ""}
				/>
			</div>
			<div className="mx-4 border-t border-custom-ui-medium" />

			{/* Channels Section */}
			<div className="flex-1 p-4 mt-6">
				<div className="flex items-center justify-between mb-3">
					<h2 className="font-medium text-sm text-custom-text-secondary">
						Channels
					</h2>
					<div className="scale-125">
						<CreateChannelDialog
							workspaceId={workspaceId}
							workspaceSlug={workspace?.slug || ""}
						/>
					</div>
				</div>
				<nav className="space-y-1">
					{channels.map((channel) => {
						const channelUrl = `/workspace/${workspace?.slug}/channel/${channel.slug}`;
						const isActive = pathname === channelUrl;

						return (
							<Link
								key={channel.id}
								href={channelUrl}
								className={`flex items-center px-2 py-1 text-sm rounded-md hover:bg-custom-ui-faint group ${
									isActive ? "bg-custom-ui-faint" : ""
								}`}
							>
								<span
									className={`${
										isActive
											? "text-custom-text-secondary"
											: "text-custom-text-tertiary"
									} group-hover:text-custom-text-secondary`}
								>
									#
								</span>
								<span
									className={`ml-2 ${
										isActive ? "text-custom-text" : "text-custom-text-secondary"
									} group-hover:text-custom-text`}
								>
									{channel.name}
								</span>
							</Link>
						);
					})}
				</nav>

				{/* Direct Messages Section */}
				<div className="mt-6">
					<div className="flex items-center justify-between mb-2">
						<h2 className="font-medium text-sm text-custom-text-secondary">
							Direct Messages
						</h2>
						<div className="scale-125">
							<CreateDirectMessageDialog
								workspaceId={workspaceId}
								workspaceSlug={workspace?.slug || ""}
							/>
						</div>
					</div>
					<nav className="space-y-1">
						{conversations.map((conversation) => {
							const displayName =
								conversation.participant.profiles.display_name ||
								conversation.participant.profiles.full_name;
							const conversationUrl = `/workspace/${workspace?.slug}/conversation/${conversation.id}`;
							const isActive = pathname === conversationUrl;

							return (
								<Link
									key={conversation.id}
									href={conversationUrl}
									className={`flex items-center px-2 py-1 text-sm rounded-md hover:bg-custom-ui-faint group ${
										isActive ? "bg-custom-ui-faint" : ""
									}`}
								>
									<UserAvatar
										fullName={conversation.participant.profiles.full_name}
										displayName={conversation.participant.profiles.display_name}
										avatarUrl={conversation.participant.profiles.avatar_url}
										avatarCache={conversation.participant.profiles.avatar_cache}
										size="sm"
										className="mr-2"
									/>
									<span className="truncate">{displayName}</span>
								</Link>
							);
						})}
					</nav>
				</div>
			</div>

			{/* User Section */}
			<div className="mx-4 border-t border-custom-ui-medium mt-auto" />
			<div className="px-4 py-4">
				<div className="flex items-center justify-between">
					<UserAvatar
						fullName={profile?.full_name || "User"}
						displayName={profile?.display_name}
						avatarUrl={profile?.avatar_url}
						avatarCache={profile?.avatar_cache}
						size="sm"
					/>
					<Button
						variant="ghost"
						size="sm"
						onClick={async () => {
							await supabase.auth.signOut();
							router.push("/auth");
						}}
						className="text-custom-text-secondary hover:text-custom-text hover:bg-custom-ui-faint"
					>
						Sign Out
					</Button>
				</div>
			</div>
		</div>
	);
}
