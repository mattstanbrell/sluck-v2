import { createClient } from "@/utils/supabase/server";
import { generateEmbeddings } from "@/utils/embeddings";
import {
	ONE_HOUR_MS,
	formatTimestamp,
	getFormattedMessageHistory,
	getContextualInformation,
} from "@/utils/messageUtils";
import type { MessageChainContext } from "@/types/message";

/**
 * For simplicity, define minimal types for the DB rows we fetch.
 */
type ProfileResponse = {
	id: string;
	full_name?: string | null;
	display_name?: string | null;
};

interface MessageWithProfile {
	id: string;
	content: string;
	created_at: string;
	channel_id: string | null;
	conversation_id: string | null;
	user_id: string;
	parent_id: string | null;
	context: string | null;
	embedding: number[] | null;
	profile?: ProfileResponse | null;
	files?: {
		id: string;
		file_name: string;
		file_type: string;
		description?: string | null;
	}[];
}

/**
 * embedLatestChainMessage:
 *  - Fetches the new message
 *  - Fetches chain messages from the same channel/convo, same user
 *  - Builds a chunk for GPT-4o-mini context
 *  - Generates embeddings
 *  - Updates the DB with the new embedding
 *  - Clears older embeddings in the chain
 */
export async function embedLatestChainMessage(
	messageId: string,
	messageContext: MessageChainContext,
): Promise<void> {
	const supabaseClient = await createClient();

	// 1) Fetch the original (new) message
	const { data: originalMessage, error: originalError } = await supabaseClient
		.from("messages")
		.select(
			`
      *,
      profile:profiles!user_id (
        id,
        full_name,
        display_name
      ),
      files (
        id,
        file_name,
        file_type,
        description
      )
    `,
		)
		.eq("id", messageId)
		.single();

	if (originalError || !originalMessage) {
		console.error(
			"[embedLatestChainMessage] Failed to get new message:",
			originalError,
		);
		return;
	}

	// 2) Fetch chain messages (all messages from same channel or convo, same user)
	const { data: chainMessages, error: chainError } = await supabaseClient
		.from("messages")
		.select(
			`
      id,
      content,
      created_at,
      channel_id,
      conversation_id,
      user_id,
      parent_id,
      context,
      embedding,
      profile:profiles!user_id (
        id,
        full_name,
        display_name
      ),
      files (
        id,
        file_name,
        file_type,
        description
      )
    `,
		)
		.eq(
			originalMessage.channel_id ? "channel_id" : "conversation_id",
			originalMessage.channel_id || originalMessage.conversation_id,
		)
		.eq("user_id", originalMessage.user_id)
		.order("created_at", { ascending: false });

	if (chainError) {
		console.error(
			"[embedLatestChainMessage] Failed to get chain messages:",
			chainError,
		);
		return;
	}

	if (!chainMessages?.length) return;

	// Determine the creation time of the newest message in the chain
	const latestTime = new Date(chainMessages[0].created_at).getTime();

	// Filter the chain to those within 1 hour of the newest
	const filteredChain = chainMessages.filter((m) => {
		const diff = latestTime - new Date(m.created_at).getTime();
		return diff <= ONE_HOUR_MS;
	});

	// The newest message in that filtered chain (should be originalMessage)
	const latestMessage = filteredChain[0];
	if (!latestMessage) return;

	// 3) Attempt to get channel or DM info
	let channelName: string | null = null;
	let recipientName: string | null = null;

	if (latestMessage.channel_id) {
		const { data: channel } = await supabaseClient
			.from("channels")
			.select("name")
			.eq("id", latestMessage.channel_id)
			.single();
		channelName = channel?.name || null;
	} else if (latestMessage.conversation_id) {
		// DM scenario, fetch the other participant's profile
		const { data: partData } = await supabaseClient
			.from("conversation_participants")
			.select(`
        profile:profiles!user_id (
          id,
          display_name,
          full_name
        )
      `)
			.eq("conversation_id", latestMessage.conversation_id)
			.neq("user_id", latestMessage.user_id)
			.single();

		const rec = partData?.profile as ProfileResponse;
		recipientName = rec?.display_name || rec?.full_name || null;
	}

	// 4) Build the chunk from the filtered chain
	const chunkLines: string[] = [];
	const promptChunkLines: string[] = [];

	for (const msg of filteredChain) {
		const senderProfile = msg.profile as ProfileResponse;
		const senderName =
			senderProfile?.display_name || senderProfile?.full_name || "Unknown User";

		// For logging or final chunk
		const msgTimestamp = new Date(msg.created_at);
		const lineTimestamp = `[${senderName}, ${formatTimestamp(msgTimestamp, false)}]`;
		chunkLines.push(`${lineTimestamp}: ${msg.content}`);
		promptChunkLines.push(`${lineTimestamp}: ${msg.content}`);

		// If there are files, incorporate them
		if (msg.files?.length) {
			for (const file of msg.files) {
				if (file.description) {
					const rawDescription = file.description
						.replace(/^\[.*?\. (Image|Audio|Video) description: /, "")
						.replace(/\]$/, "");
					if (file.file_type.startsWith("image/")) {
						promptChunkLines.push(
							`[Image: "${file.file_name}"] [Description: ${rawDescription}]`,
						);
					} else if (file.file_type.startsWith("audio/")) {
						promptChunkLines.push(
							`[Audio: "${file.file_name}"] [Description: ${rawDescription}]`,
						);
					} else if (file.file_type.startsWith("video/")) {
						promptChunkLines.push(
							`[Video: "${file.file_name}"] [Description: ${rawDescription}]`,
						);
					}
					// Also add descriptions to chunk
					chunkLines.push(file.description);
				}
			}
		}
	}

	const chunkToEmbed = chunkLines.join("\n");
	const promptChunk = promptChunkLines.join("\n");

	// 5) Retrieve the full conversation history for context building
	const completeHistory = await getFormattedMessageHistory(
		latestMessage.channel_id,
		latestMessage.conversation_id,
	);

	// 6) Use GPT-4o-mini to get an additional context snippet
	const context = await getContextualInformation(completeHistory, promptChunk);
	const contextualizedChunk = context
		? `Context: ${context}\n${chunkToEmbed}`
		: chunkToEmbed;

	// 7) Generate embeddings
	const embeddings = await generateEmbeddings(
		[contextualizedChunk],
		"document",
	);
	const embedding = embeddings[0];

	// 8) Store embedding and context in the DB
	if (embedding) {
		const { error: updateError } = await supabaseClient
			.from("messages")
			.update({
				embedding,
				context: context || null,
				formatted_chain: promptChunk,
			})
			.eq("id", latestMessage.id);

		if (updateError) {
			console.error(
				"[embedLatestChainMessage] Failed to update message with embedding:",
				updateError,
			);
			return;
		}

		// Clear older chain messages' embeddings/context
		// (For those that came after first in the filteredChain)
		const olderMessageIds = filteredChain.slice(1).map((m) => m.id);
		if (olderMessageIds.length > 0) {
			const { error: clearError } = await supabaseClient
				.from("messages")
				.update({
					embedding: null,
					context: null,
					formatted_chain: null,
				})
				.in("id", olderMessageIds);

			if (clearError) {
				console.error(
					"[embedLatestChainMessage] Failed to clear older embeddings:",
					clearError,
				);
			}
		}
	}
}
