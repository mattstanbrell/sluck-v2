"use client";

import { Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createClient } from "@/utils/supabase/client";
import { useEffect, useState } from "react";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { CreateChannelDialog } from "./CreateChannelDialog";
import { WorkspaceSettingsDialog } from "./WorkspaceSettingsDialog";

interface WorkspaceData {
	name: string;
	slug: string;
}

interface Channel {
	id: string;
	name: string;
	slug: string;
}

interface UserProfile {
	full_name: string;
	display_name: string | null;
	avatar_url: string | null;
	avatar_cache: string | null;
}

export function Sidebar({ workspaceId }: { workspaceId: string }) {
	const [workspace, setWorkspace] = useState<WorkspaceData | null>(null);
	const [channels, setChannels] = useState<Channel[]>([]);
	const [profile, setProfile] = useState<UserProfile | null>(null);
	const [avatarSrc, setAvatarSrc] = useState<string | undefined>(undefined);
	const supabase = createClient();
	const router = useRouter();
	const pathname = usePathname();

	// Handle avatar loading and fallbacks
	useEffect(() => {
		if (!profile) return;

		// Try primary URL first
		const img = new Image();
		img.onload = () => {
			setAvatarSrc(profile.avatar_url || undefined);
		};
		img.onerror = () => {
			// Try cache if primary URL fails
			if (profile.avatar_cache) {
				setAvatarSrc(`data:image/jpeg;base64,${profile.avatar_cache}`);
			} else {
				setAvatarSrc(undefined);
			}
		};
		img.src = profile.avatar_url || "";
	}, [profile]);

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
				.select("name, slug")
				.eq("id", workspaceId)
				.single();

			// Load channels
			const { data: channels } = await supabase
				.from("channels")
				.select("id, name, slug")
				.eq("workspace_id", workspaceId)
				.order("name");

			// Load user profile
			const { data: profile } = await supabase
				.from("profiles")
				.select("full_name, display_name, avatar_url, avatar_cache")
				.eq("id", user.id)
				.single();

			setWorkspace(workspace);
			setChannels(channels || []);
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
						// Reload channels to get fresh data
						const { data: updatedChannels } = await supabase
							.from("channels")
							.select("id, name, slug")
							.eq("workspace_id", workspaceId)
							.order("name");

						setChannels(updatedChannels || []);
					},
				)
				.subscribe();

			// Cleanup subscription
			return () => {
				channelSubscription.unsubscribe();
			};
		}

		loadData();
	}, [workspaceId, supabase]);

	// Get display name in order of preference: display_name -> full_name -> 'User'
	const displayName = profile?.display_name || profile?.full_name || "User";

	// Get initials from full name
	const initials =
		profile?.full_name
			?.split(" ")
			.map((n) => n[0])
			.slice(0, 2)
			.join("")
			.toUpperCase() || "U";

	return (
		<div className="w-64 bg-custom-background-secondary border-r border-custom-ui-medium flex flex-col">
			{/* Workspace Header */}
			<div className="px-4 py-4 flex items-center justify-between">
				<h1 className="font-semibold text-lg text-custom-text px-1">
					{workspace?.name || "Loading..."}
				</h1>
				<WorkspaceSettingsDialog
					workspaceId={workspaceId}
					workspaceSlug={workspace?.slug || ""}
				/>
			</div>
			<div className="mx-4 border-t border-custom-ui-medium" />

			{/* Channels Section */}
			<div className="flex-1 p-4 mt-6 space-y-4">
				<div className="flex items-center justify-between">
					<h2 className="font-medium text-sm text-custom-text-secondary">
						Channels
					</h2>
					<CreateChannelDialog workspaceId={workspaceId} />
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
				<div>
					<h2 className="font-medium text-sm text-custom-text-secondary mb-2">
						Direct Messages
					</h2>
					<nav className="space-y-1">{/* Will implement DM list later */}</nav>
				</div>
			</div>

			{/* User Section */}
			<div className="mx-4 border-t border-custom-ui-medium mt-auto" />
			<div className="px-4 py-4">
				<div className="flex items-center justify-between px-1">
					<Avatar className="h-8 w-8 rounded-xl">
						<AvatarImage src={avatarSrc} alt={displayName} />
						<AvatarFallback className="bg-custom-text-secondary text-white rounded-xl">
							{initials}
						</AvatarFallback>
					</Avatar>
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
