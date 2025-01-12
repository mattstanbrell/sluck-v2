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
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";

interface UserProfile {
	id: string;
	full_name: string;
	display_name: string | null;
	avatar_url: string | null;
	avatar_cache: string | null;
}

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
			const {
				data: { user },
				error: userError,
			} = await supabase.auth.getUser();
			if (userError) {
				console.error(
					"[startConversation] Error fetching current user:",
					userError,
				);
			}
			console.log("[startConversation] Current user =>", user?.id);

			if (!user) throw new Error("Not authenticated");

			// 1) Create conversation
			console.log(
				"[startConversation] Creating new conversation in workspace =>",
				workspaceId,
			);
			const { data: conversation, error: conversationError } = await supabase
				.from("conversations")
				.insert({
					workspace_id: workspaceId,
					type: "direct",
				})
				.select()
				.single();

			if (conversationError) {
				console.error(
					"[startConversation] Error creating conversation:",
					conversationError,
				);
				throw conversationError;
			}
			console.log("[startConversation] Created conversation =>", conversation);

			// 2) Add participants
			console.log(
				"[startConversation] Inserting conversation_participants =>",
				[user.id, otherUserId],
			);
			const { error: participantsError } = await supabase
				.from("conversation_participants")
				.insert([
					{ conversation_id: conversation.id, user_id: user.id },
					{ conversation_id: conversation.id, user_id: otherUserId },
				]);

			if (participantsError) {
				console.error(
					"[startConversation] Error inserting participants:",
					participantsError,
				);
				throw participantsError;
			}

			console.log(
				"[startConversation] Conversation participants added successfully.",
			);
			setOpen(false);

			// 3) Redirect user
			console.log(
				"[startConversation] Navigating to =>",
				`/workspace/${workspaceSlug}/conversation/${conversation.id}`,
			);
			router.push(
				`/workspace/${workspaceSlug}/conversation/${conversation.id}`,
			);
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
			<DialogContent className="sm:max-w-[425px] bg-custom-background border-custom-ui-medium">
				<DialogHeader>
					<DialogTitle className="text-custom-text">
						Start a conversation
					</DialogTitle>
					<DialogDescription className="text-custom-text-secondary">
						Select a workspace member to start a direct message conversation.
					</DialogDescription>
				</DialogHeader>

				<div className="py-4">
					{isLoading ? (
						<div className="text-sm text-custom-text-secondary">
							Loading users...
						</div>
					) : availableUsers.length === 0 ? (
						<div className="text-sm text-custom-text-secondary">
							No available users to start a conversation with.
						</div>
					) : (
						<div className="space-y-2">
							{availableUsers.map((user) => {
								const displayName = user.display_name || user.full_name;
								const initials = user.full_name
									.split(" ")
									.map((n) => n[0])
									.slice(0, 2)
									.join("")
									.toUpperCase();

								return (
									<Button
										key={user.id}
										variant="ghost"
										className="w-full justify-start gap-3 hover:bg-custom-ui-faint"
										onClick={() => startConversation(user.id)}
										disabled={isLoading}
									>
										<Avatar className="h-8 w-8 rounded-xl">
											<AvatarImage
												src={user.avatar_url || undefined}
												alt={displayName}
											/>
											<AvatarFallback className="bg-custom-text-secondary text-white rounded-xl">
												{initials}
											</AvatarFallback>
										</Avatar>
										<span className="text-custom-text">{displayName}</span>
									</Button>
								);
							})}
						</div>
					)}
				</div>
			</DialogContent>
		</Dialog>
	);
}
