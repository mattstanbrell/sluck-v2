import { createClient } from "@/utils/supabase/server";
import type { Database } from "@/lib/database.types";

// "messages" table row from your Database
export type DatabaseMessage = Database["public"]["Tables"]["messages"]["Row"];

/**
 * Insert a new message in the DB, mirroring the logic from the original giant file.
 */
export async function insertMessage({
	content,
	channelId,
	conversationId,
	parentId,
	userId,
}: {
	content: string;
	channelId?: string;
	conversationId?: string;
	parentId?: string;
	userId: string;
}): Promise<DatabaseMessage> {
	const supabase = await createClient();

	const { data, error } = await supabase
		.from("messages")
		.insert({
			content: content.trim(),
			channel_id: channelId ?? null,
			conversation_id: conversationId ?? null,
			parent_id: parentId ?? null,
			user_id: userId,
		})
		.select()
		.single();

	if (error || !data) {
		console.error("[insertMessage] Failed to create message:", error);
		throw error || new Error("Failed to create message");
	}
	return data;
}

/**
 * Check if a user can post in a specific channel (membership check).
 * This matches the snippet from the giant file.
 */
export async function canUserPostInChannel(
	userId: string,
	channelId: string,
): Promise<boolean> {
	const supabase = await createClient();
	const { data, error } = await supabase
		.from("channel_members")
		.select("*")
		.eq("user_id", userId)
		.eq("channel_id", channelId)
		.maybeSingle();

	if (error) {
		console.error("[canUserPostInChannel] Error checking membership:", error);
		// We'll assume false in case of error
		return false;
	}
	return !!data;
}
