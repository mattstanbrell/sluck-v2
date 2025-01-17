"use server";

import { createClient } from "@/utils/supabase/server";
import type { Database } from "@/lib/database.types";
import type { MessageChainContext } from "@/types/message";

import { insertMessage, canUserPostInChannel } from "@/app/actions/messageData";
import { embedLatestChainMessage } from "@/app/actions/messageEmbeddings";

type DatabaseMessage = Database["public"]["Tables"]["messages"]["Row"];

/**
 * createMessage - replicates the logic to insert a new message,
 * wait 0.8 minutes, and call embedLatestChainMessage.
 */
export async function createMessage({
	content,
	channelId,
	conversationId,
	parentId,
	messageContext,
}: {
	content: string;
	channelId?: string;
	conversationId?: string;
	parentId?: string;
	messageContext: MessageChainContext;
}): Promise<DatabaseMessage> {
	const supabase = await createClient();

	// 1) Get current user
	const {
		data: { user },
		error: userError,
	} = await supabase.auth.getUser();

	if (userError || !user) {
		throw new Error("Unauthorized");
	}

	// 2) Insert message
	const message = await insertMessage({
		content,
		channelId,
		conversationId,
		parentId,
		userId: user.id,
	});

	// 3) Schedule embedding in 0.8 minutes (48 seconds)
	setTimeout(
		async () => {
			try {
				await embedLatestChainMessage(message.id, messageContext);
			} catch (err) {
				console.error("[createMessage] Embedding error:", err);
			}
		},
		0.8 * 60 * 1000,
	); // 48 seconds

	// 4) If this is a DM, update conversations.last_message_at
	if (conversationId) {
		await supabase
			.from("conversations")
			.update({ last_message_at: new Date().toISOString() })
			.eq("id", conversationId);
	}

	return message;
}

/**
 * Optionally re-export canUserPostInChannel if needed in other places.
 */
export { canUserPostInChannel };
