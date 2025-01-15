"use client";

import { Button } from "@/components/ui/button";
import { createClient } from "@/utils/supabase/client";
import { useEffect, useState, useCallback, useMemo } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import Link from "next/link";
import { CreateChannelDialog } from "./CreateChannelDialog";
import { WorkspaceSettingsDialog } from "./WorkspaceSettingsDialog";
import { CreateDirectMessageDialog } from "./CreateDirectMessageDialog";
import { UserAvatar } from "@/components/ui/UserAvatar";
import { ChannelPrefetcher } from "./ChannelPrefetcher";
import type { ProfileDisplay } from "@/types/profile";
import type {
	ConversationWithParticipants,
	ConversationWithParticipant,
} from "@/types/conversation";
import type { ChannelBasic } from "@/types/channel";
import type { WorkspaceBasic } from "@/types/workspace";
import { UnjoinedChannels } from "./UnjoinedChannels";
import { useProfileCache } from "@/components/providers/ProfileCacheProvider";
import { logDB } from "@/utils/logging";

// Initialize Supabase client outside component
const supabase = createClient();

type ConversationResponse = ConversationWithParticipants;
type Conversation = ConversationWithParticipant;
type UserProfile = ProfileDisplay;

export function Sidebar({ workspaceId }: { workspaceId: string }) {
	const [workspace, setWorkspace] = useState<WorkspaceBasic | null>(null);
	const [joinedChannels, setJoinedChannels] = useState<ChannelBasic[]>([]);
	const [unjoinedChannels, setUnjoinedChannels] = useState<ChannelBasic[]>([]);
	const [conversations, setConversations] = useState<Conversation[]>([]);
	const [profile, setProfile] = useState<UserProfile | null>(null);
	const [userId, setUserId] = useState<string | null>(null);
	const [isLoading, setIsLoading] = useState(true);
	const router = useRouter();
	const pathname = usePathname();
	const searchParams = useSearchParams();
	const { getProfile } = useProfileCache();

	// Get active channel ID from URL
	const activeChannelId = searchParams.get("channelId");

	const handleChannelsLoaded = useCallback(
		(joined: ChannelBasic[], unjoined: ChannelBasic[]) => {
			setJoinedChannels(joined);
			setUnjoinedChannels(unjoined);
		},
		[],
	);

	const loadInitialData = useCallback(async () => {
		try {
			setIsLoading(true);

			const {
				data: { user },
			} = await supabase.auth.getUser();
			if (!user) return;

			setUserId(user.id);

			// Load workspace
			const { data: workspace, error: workspaceError } = await supabase
				.from("workspaces")
				.select("id, name, slug, description")
				.eq("id", workspaceId)
				.single();

			await logDB({
				operation: "SELECT",
				table: "workspaces",
				description: `Loading workspace ${workspaceId} for sidebar`,
				result: workspace ? { id: workspace.id, name: workspace.name } : null,
				error: workspaceError,
			});

			// Load conversations
			const { data: conversations, error: conversationsError } = await supabase
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

			await logDB({
				operation: "SELECT",
				table: "conversations",
				description: `Loading direct message conversations for workspace ${workspaceId}`,
				result: conversations ? { count: conversations.length } : null,
				error: conversationsError,
			});

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
							participant: {
								user_id: otherParticipant.user_id,
								profiles: otherParticipant.profiles,
							},
						};
					})
					.filter((conv): conv is Conversation => conv !== null) || [];

			setWorkspace(workspace);
			setConversations(transformedConversations);
		} catch (error) {
			console.error("Error loading initial data:", error);
		} finally {
			setIsLoading(false);
		}
	}, [workspaceId]);

	// Load user profile when userId changes
	useEffect(() => {
		const loadProfile = async () => {
			if (!userId) return;
			const userProfile = await getProfile(userId);
			if (userProfile) {
				const { full_name, display_name, avatar_url, avatar_cache } =
					userProfile;
				setProfile({ full_name, display_name, avatar_url, avatar_cache });
			}
		};
		loadProfile();
	}, [userId, getProfile]);

	// Set up conversation subscription
	useEffect(() => {
		const setupSubscription = async () => {
			const {
				data: { user },
			} = await supabase.auth.getUser();
			if (!user) return;

			const subscription = supabase
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
						const { data: updatedConversations, error: updateError } =
							await supabase
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

						await logDB({
							operation: "SELECT",
							table: "conversations",
							description: `Reloading conversations after change in workspace ${workspaceId}`,
							result: updatedConversations
								? { count: updatedConversations.length }
								: null,
							error: updateError,
						});

						if (updatedConversations) {
							const transformedUpdatedConversations = (
								updatedConversations as ConversationResponse[]
							)
								.map((conv) => {
									const otherParticipant = conv.conversation_participants.find(
										(p) => p.user_id !== user.id,
									);
									if (!otherParticipant) return null;
									return {
										id: conv.id,
										participant: {
											user_id: otherParticipant.user_id,
											profiles: otherParticipant.profiles,
										},
									};
								})
								.filter((conv): conv is Conversation => conv !== null);

							setConversations(transformedUpdatedConversations);
						}
					},
				)
				.subscribe();

			return () => {
				subscription.unsubscribe();
			};
		};

		setupSubscription();
	}, [workspaceId]);

	// Load initial data
	useEffect(() => {
		loadInitialData();
	}, [loadInitialData]);

	return (
		<div className="w-64 bg-custom-background-secondary border-r border-custom-ui-medium flex flex-col">
			{/* Workspace Header */}
			<div className="px-4 py-4 flex items-center justify-between">
				<h1 className="font-semibold text-lg text-custom-text">
					{workspace?.name || ""}
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
					{joinedChannels.map((channel) => {
						const channelUrl = `/workspace/${workspace?.slug}/channel/${channel.slug}?channelId=${channel.id}&channelName=${encodeURIComponent(channel.name)}${channel.description ? `&description=${encodeURIComponent(channel.description)}` : ""}&isMember=true&workspaceId=${workspaceId}`;
						const basePath = `/workspace/${workspace?.slug}/channel/${channel.slug}`;
						const isActive = pathname === basePath;

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

					{/* Unjoined Channels */}
					<UnjoinedChannels
						channels={unjoinedChannels}
						workspaceSlug={workspace?.slug || ""}
						workspaceId={workspaceId}
					/>
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
							await logDB({
								operation: "DELETE",
								table: "auth.sessions",
								description: "User signing out",
								result: { success: true },
								error: null,
							});
							router.push("/auth");
						}}
						className="text-custom-text-secondary hover:text-custom-text hover:bg-custom-ui-faint"
					>
						Sign Out
					</Button>
				</div>
			</div>

			{/* Background Channel Prefetcher */}
			<ChannelPrefetcher
				workspaceId={workspaceId}
				activeChannelId={activeChannelId || undefined}
				onChannelsLoaded={handleChannelsLoaded}
			/>
		</div>
	);
}
