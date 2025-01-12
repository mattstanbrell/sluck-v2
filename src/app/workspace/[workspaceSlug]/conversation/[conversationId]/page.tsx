import { createClient } from "@/utils/supabase/server";
import { notFound } from "next/navigation";
import { MessageContainer } from "@/components/messages/MessageContainer";
import { UserAvatar } from "@/components/ui/UserAvatar";

type Profile = {
	full_name: string;
	display_name: string | null;
	avatar_url: string | null;
	avatar_cache: string | null;
};

type DatabaseConversation = {
	id: string;
	conversation_participants: {
		user_id: string;
		profiles: Profile;
	}[];
};

export default async function ConversationPage({
	params,
}: {
	params: Promise<{ workspaceSlug: string; conversationId: string }>;
}) {
	const { workspaceSlug, conversationId } = await params;
	console.log("[ConversationPage] Params =>", {
		workspaceSlug,
		conversationId,
	});

	const supabase = await createClient();

	// Get current user for logging
	const {
		data: { user },
		error: userError,
	} = await supabase.auth.getUser();
	console.log("[ConversationPage] Current user =>", user?.id);
	if (userError) {
		console.error("[ConversationPage] Error getting user:", userError);
	}

	// Get workspace ID from slug
	console.log(
		"[ConversationPage] Getting workspace for slug =>",
		workspaceSlug,
	);
	const { data: workspace, error: workspaceError } = await supabase
		.from("workspaces")
		.select("id, name")
		.eq("slug", workspaceSlug)
		.single();

	if (workspaceError) {
		console.error("[ConversationPage] Workspace error:", workspaceError);
	}
	console.log("[ConversationPage] Workspace =>", workspace);

	if (!workspace) {
		console.log("[ConversationPage] Workspace not found");
		notFound();
	}

	// Log the query parameters
	console.log("[ConversationPage] Query params =>", {
		conversationId,
		workspaceId: workspace.id,
		type: "direct",
	});

	// Get conversation and other participant's profile
	console.log("[ConversationPage] Getting conversation =>", conversationId);
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

	if (conversationError) {
		console.error("[ConversationPage] Conversation error:", conversationError);
	}
	console.log("[ConversationPage] Conversation =>", conversation);

	if (!conversation) {
		console.log("[ConversationPage] Conversation not found");
		notFound();
	}

	// Get the other participant (not the current user)
	const otherParticipant = (
		conversation as unknown as DatabaseConversation
	).conversation_participants.find((p) => p.user_id !== user?.id)?.profiles;

	console.log("[ConversationPage] Other participant =>", otherParticipant);

	if (!otherParticipant) {
		console.log("[ConversationPage] Other participant not found");
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
				<div className="mx-4 border-t border-custom-ui-medium" />
			</div>

			{/* Messages */}
			<div className="flex-1 min-h-0">
				<MessageContainer conversationId={conversation.id} />
			</div>
		</div>
	);
}
