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
import type { ProfileWithId } from "@/types/profile";

type UserProfile = ProfileWithId;

interface CreateDirectMessageDialogProps {
	workspaceId: string;
	workspaceSlug: string;
	trigger?: React.ReactNode;
}

export function CreateDirectMessageDialog({
	workspaceId,
	workspaceSlug,
	trigger,
}: CreateDirectMessageDialogProps) {
	const [availableUsers, setAvailableUsers] = useState<UserProfile[]>([]);
	const [isLoading, setIsLoading] = useState(false);
	const [open, setOpen] = useState(false);
	const { toast } = useToast();
	const router = useRouter();
	const supabase = createClient();

	const loadAvailableUsers = useCallback(async () => {
		setIsLoading(true);
		console.log("[loadAvailableUsers] Start");
		try {
			// 1) Get current user
			const {
				data: { user },
				error: userError,
			} = await supabase.auth.getUser();
			if (userError) {
				console.error("[loadAvailableUsers] Error fetching user:", userError);
			}
			console.log("[loadAvailableUsers] Current user =>", user?.id);

			if (!user) {
				console.warn(
					"[loadAvailableUsers] No authenticated user found; exiting.",
				);
				return;
			}

			// 2) Get all workspace members for this workspace
			console.log(
				"[loadAvailableUsers] Querying workspace_members => workspace_id:",
				workspaceId,
			);
			const { data: workspaceMembers, error: membersError } = await supabase
				.from("workspace_members")
				.select("user_id")
				.eq("workspace_id", workspaceId);

			if (membersError) {
				console.error(
					"[loadAvailableUsers] Error fetching workspace_members:",
					membersError,
				);
			}
			console.log(
				"[loadAvailableUsers] workspace_members data =>",
				workspaceMembers?.map((m) => m.user_id),
			);

			if (!workspaceMembers) {
				console.warn(
					"[loadAvailableUsers] workspaceMembers is null or undefined.",
				);
				return;
			}

			// Exclude current user from the list
			const memberIds = workspaceMembers.map((m) => m.user_id);
			console.log("[loadAvailableUsers] Found memberIds =>", memberIds);

			// 3) Fetch existing DM conversations for user
			console.log(
				"[loadAvailableUsers] Fetching existing direct conversations...",
			);
			const { data: existingDMs, error: dmError } = await supabase
				.from("conversations")
				.select(`
					id,
					conversation_participants!inner(user_id)
				`)
				.eq("workspace_id", workspaceId)
				.eq("type", "direct")
				.eq("conversation_participants.user_id", user.id);

			if (dmError) {
				console.error("[loadAvailableUsers] Error fetching DMs:", dmError);
			}
			console.log("[loadAvailableUsers] existingDMs =>", existingDMs);

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
			console.log(
				"[loadAvailableUsers] existingDMUserIds =>",
				Array.from(existingDMUserIds),
			);

			// 5) Fetch profiles of members who are not the current user & not already in a DM
			console.log(
				"[loadAvailableUsers] Fetching profiles, excluding current user & existing DM participants.",
			);
			const dmUserIdsArray = Array.from(existingDMUserIds);

			// Construct a base query
			let query = supabase
				.from("profiles")
				.select("id, full_name, display_name, avatar_url, avatar_cache")
				.in("id", memberIds)
				.neq("id", user.id);

			// Only apply "not.in" if there are items to exclude
			if (dmUserIdsArray.length > 0) {
				query = query.filter("id", "not.in", dmUserIdsArray);
			}

			query = query.order("full_name");

			const { data: profiles, error: profilesError } = await query;

			if (profilesError) {
				console.error(
					"[loadAvailableUsers] Error fetching profiles:",
					profilesError,
				);
			}
			console.log(
				"[loadAvailableUsers] Final filtered profiles =>",
				profiles?.map((p) => p.id),
				profiles,
			);

			setAvailableUsers(profiles || []);
		} catch (error) {
			console.error("[loadAvailableUsers] Unexpected error:", error);
			toast({
				title: "Error",
				description: "Failed to load available users",
				variant: "destructive",
			});
		} finally {
			setIsLoading(false);
			console.log("[loadAvailableUsers] Complete");
		}
	}, [supabase, workspaceId, toast]);

	useEffect(() => {
		if (open) {
			loadAvailableUsers();
		}
	}, [open, loadAvailableUsers]);

	const startConversation = async (otherUserId: string) => {
		setIsLoading(true);
		console.log(
			"[startConversation] Attempting with otherUserId =>",
			otherUserId,
		);
		try {
			// Call the SECURITY DEFINER function
			const { data: conversationId, error } = await supabase.rpc(
				"create_direct_message",
				{
					workspace_id_param: workspaceId,
					other_user_id_param: otherUserId,
				},
			);

			if (error) {
				console.error(
					"[startConversation] Error creating conversation:",
					error,
				);
				throw error;
			}

			console.log("[startConversation] Conversation created successfully");
			setOpen(false);

			// Navigate to the new conversation
			console.log(
				"[startConversation] Navigating to =>",
				`/workspace/${workspaceSlug}/conversation/${conversationId}`,
			);
			router.push(`/workspace/${workspaceSlug}/conversation/${conversationId}`);
		} catch (error) {
			console.error("[startConversation] Unexpected error:", error);
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
