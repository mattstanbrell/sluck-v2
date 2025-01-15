import { createClient } from "@/utils/supabase/server";
import { notFound } from "next/navigation";
import { MessageContainer } from "@/components/messages/MessageContainer";
import { UserAvatar } from "@/components/ui/UserAvatar";
import type { ConversationWithParticipants } from "@/types/conversation";
import { logDB } from "@/utils/logging";

type DatabaseConversation = ConversationWithParticipants;

export default async function ConversationPage({
	params,
}: {
	params: Promise<{ workspaceSlug: string; conversationId: string }>;
}) {
	const { workspaceSlug, conversationId } = await params;
	const supabase = await createClient();

	// Get current user for logging
	const {
		data: { user },
		error: userError,
	} = await supabase.auth.getUser();

	logDB({
		operation: "SELECT",
		table: "auth.users",
		description: "Getting current user for conversation page",
		result: user ? { id: user.id } : null,
		error: userError,
	});

	// Get workspace ID from slug
	const { data: workspace, error: workspaceError } = await supabase
		.from("workspaces")
		.select("id, name")
		.eq("slug", workspaceSlug)
		.single();

	logDB({
		operation: "SELECT",
		table: "workspaces",
		description: `Fetching workspace by slug (${workspaceSlug})`,
		result: workspace,
		error: workspaceError,
	});

	if (!workspace) {
		notFound();
	}

	// Get conversation and other participant's profile
	const { data: conversation, error: conversationError } = await supabase
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
		.eq("id", conversationId)
		.eq("workspace_id", workspace.id)
		.eq("type", "direct")
		.single();

	logDB({
		operation: "SELECT",
		table: "conversations",
		description: `Fetching conversation with participants (${conversationId})`,
		result: conversation,
		error: conversationError,
	});

	if (!conversation) {
		notFound();
	}

	// Get the other participant (not the current user)
	const otherParticipant = (
		conversation as unknown as DatabaseConversation
	).conversation_participants.find((p) => p.user_id !== user?.id)?.profiles;

	if (!otherParticipant) {
		notFound();
	}

	const displayName =
		otherParticipant.display_name || otherParticipant.full_name;

	return (
		<div className="flex flex-col h-full">
			{/* Conversation Header */}
			<div className="shrink-0">
				<div className="px-4 py-[18px] flex items-center gap-3">
					<UserAvatar
						fullName={otherParticipant.full_name}
						displayName={otherParticipant.display_name}
						avatarUrl={otherParticipant.avatar_url}
						avatarCache={otherParticipant.avatar_cache}
						size="xs"
					/>
					<h1 className="font-semibold">{displayName}</h1>
				</div>
				<div className="border-t border-custom-ui-medium" />
			</div>

			{/* Messages */}
			<div className="flex-1 min-h-0">
				<MessageContainer conversationId={conversation.id} />
			</div>
		</div>
	);
}
