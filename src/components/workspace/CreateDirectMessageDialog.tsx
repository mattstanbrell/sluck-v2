"use client";

import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/utils/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useRouter } from "next/navigation";
import { UserAvatar } from "@/components/ui/UserAvatar";
import { RefreshCw } from "lucide-react";
import type { Profile } from "@/types/profile";
import { useProfileCache } from "@/components/providers/ProfileCacheProvider";
import { logDB } from "@/utils/logging";

interface CreateDirectMessageDialogProps {
	workspaceId: string;
	workspaceSlug: string;
	trigger: React.ReactNode;
}

export function CreateDirectMessageDialog({
	workspaceId,
	workspaceSlug,
	trigger,
}: CreateDirectMessageDialogProps) {
	const [isLoading, setIsLoading] = useState(false);
	const [availableUsers, setAvailableUsers] = useState<Profile[]>([]);
	const [selectedUser, setSelectedUser] = useState<Profile | null>(null);
	const [open, setOpen] = useState(false);
	const { toast } = useToast();
	const router = useRouter();
	const supabase = createClient();
	const { getProfiles } = useProfileCache();

	const loadAvailableUsers = useCallback(async () => {
		try {
			setIsLoading(true);

			// 1) Get current user
			const {
				data: { user },
				error: authError,
			} = await supabase.auth.getUser();

			logDB({
				operation: "SELECT",
				table: "auth.users",
				description: "Getting current user for DM dialog",
				result: user ? { id: user.id } : null,
				error: authError,
			});

			if (!user) {
				return;
			}

			// 2) Get all workspace members
			const { data: members, error: membersError } = await supabase
				.from("workspace_members")
				.select("user_id")
				.eq("workspace_id", workspaceId);

			logDB({
				operation: "SELECT",
				table: "workspace_members",
				description: `Getting members for workspace ${workspaceId}`,
				result: members ? { count: members.length } : null,
				error: membersError,
			});

			if (membersError) {
				return;
			}

			const memberIds = members.map((m) => m.user_id);

			// 3) Fetch existing DM conversations for user
			const { data: existingDMs, error: dmError } = await supabase
				.from("conversations")
				.select(`
					id,
					conversation_participants!inner(user_id)
				`)
				.eq("workspace_id", workspaceId)
				.eq("type", "direct")
				.eq("conversation_participants.user_id", user.id);

			logDB({
				operation: "SELECT",
				table: "conversations",
				description: `Getting existing DMs for user ${user.id} in workspace ${workspaceId}`,
				result: existingDMs ? { count: existingDMs.length } : null,
				error: dmError,
			});

			if (dmError) {
				return;
			}

			// 4) Build list of user IDs already in a DM with current user
			const existingDMUserIds = new Set<string>();
			if (existingDMs) {
				for (const dm of existingDMs) {
					for (const participant of dm.conversation_participants) {
						if (participant.user_id !== user.id) {
							existingDMUserIds.add(participant.user_id);
						}
					}
				}
			}

			// 5) Get profiles for members who are not the current user & not already in a DM
			const availableUserIds = memberIds.filter(
				(id) => id !== user.id && !existingDMUserIds.has(id),
			);

			if (availableUserIds.length > 0) {
				const profilesMap = await getProfiles(availableUserIds);
				const profiles = Array.from(profilesMap.values());
				setAvailableUsers(
					profiles.sort((a, b) => a.full_name.localeCompare(b.full_name)),
				);
			} else {
				setAvailableUsers([]);
			}
		} catch (error) {
			toast({
				title: "Error",
				description: "Failed to load available users",
				variant: "destructive",
			});
		} finally {
			setIsLoading(false);
		}
	}, [workspaceId, supabase, getProfiles, toast]);

	useEffect(() => {
		if (open) {
			loadAvailableUsers();
		}
	}, [open, loadAvailableUsers]);

	const startConversation = async (otherUserId: string) => {
		setIsLoading(true);
		try {
			// Call the SECURITY DEFINER function
			const { data: conversationId, error } = await supabase.rpc(
				"create_direct_message",
				{
					workspace_id_param: workspaceId,
					other_user_id_param: otherUserId,
				},
			);

			logDB({
				operation: "INSERT",
				table: "conversations",
				description: `Creating DM between users in workspace ${workspaceId}`,
				result: conversationId ? { id: conversationId } : null,
				error,
			});

			if (error) {
				throw error;
			}

			setOpen(false);
			router.push(`/workspace/${workspaceSlug}/conversation/${conversationId}`);
		} catch (error) {
			toast({
				title: "Error",
				description: "Failed to start conversation",
				variant: "destructive",
			});
		} finally {
			setIsLoading(false);
		}
	};

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger asChild>
				{trigger || (
					<Button
						variant="ghost"
						size="icon"
						className="w-4 h-4 text-custom-text-secondary hover:text-custom-text hover:bg-custom-ui-faint"
					>
						<span className="text-xs">+</span>
					</Button>
				)}
			</DialogTrigger>
			<DialogContent className="sm:max-w-[600px] bg-custom-background border-custom-ui-medium [&>button]:right-6 [&>button]:top-6 [&>button]:opacity-70 [&>button]:text-custom-text-secondary hover:[&>button]:text-custom-text hover:[&>button]:bg-custom-ui-faint hover:[&>button]:opacity-100 hover:[&>button]:shadow-lg">
				<DialogHeader>
					<DialogTitle className="text-custom-text">
						Start Direct Message
					</DialogTitle>
					<DialogDescription className="text-custom-text-secondary">
						Choose a workspace member to start a direct message conversation.
					</DialogDescription>
				</DialogHeader>

				{isLoading ? (
					<div className="h-[120px] flex items-center justify-center">
						<RefreshCw className="w-4 h-4 animate-spin text-custom-text-secondary" />
					</div>
				) : (
					<div className="space-y-1">
						{availableUsers.map((user) => {
							const displayName = user.display_name || user.full_name;

							return (
								<button
									key={user.id}
									onClick={() => startConversation(user.id)}
									className="w-full flex items-center gap-3 px-3 py-2 rounded-md hover:bg-custom-ui-faint text-left"
									type="button"
								>
									<UserAvatar
										fullName={user.full_name}
										displayName={user.display_name}
										avatarUrl={user.avatar_url}
										avatarCache={user.avatar_cache}
										size="sm"
									/>
									<span className="text-sm text-custom-text">
										{displayName}
									</span>
								</button>
							);
						})}
					</div>
				)}
			</DialogContent>
		</Dialog>
	);
}
