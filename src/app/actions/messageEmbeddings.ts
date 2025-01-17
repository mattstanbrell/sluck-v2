import { createClient } from "@/utils/supabase/server";
import { generateEmbeddings } from "@/utils/embeddings";
import {
	ONE_HOUR_MS,
	formatTimestamp,
	getFormattedMessageHistory,
	getContextualInformation,
} from "@/utils/messageUtils";

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
        display_name,
        full_name
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
		console.error("Error fetching original message:", originalError);
		return;
	}

	// Type the message and extract profile info
	const typedMessage = originalMessage as unknown as MessageWithProfile;

	// 2) Fetch chain messages (all messages from same channel or convo, same user)
	const { data: chainMessages, error: chainError } = await supabaseClient
		.from("messages")
		.select(
			`
      *,
      profile:profiles!user_id (
        id,
        display_name,
        full_name
      ),
      files (
        id,
        file_name,
        file_type,
        description
      )
    `,
		)
		.eq("user_id", typedMessage.user_id)
		.eq(
			typedMessage.channel_id ? "channel_id" : "conversation_id",
			typedMessage.channel_id || typedMessage.conversation_id,
		)
		.order("created_at", { ascending: false });

	if (chainError) {
		console.error("Error fetching chain messages:", chainError);
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
	const latestMessage = filteredChain[0] as unknown as MessageWithProfile;
	if (!latestMessage) return;

	// 3) Attempt to get channel or DM info - we don't use these variables but they might be useful later
	if (latestMessage.channel_id) {
		/* const { data: _channel } = */ await supabaseClient
			.from("channels")
			.select("name")
			.eq("id", latestMessage.channel_id)
			.single();
	} else if (latestMessage.conversation_id) {
		// DM scenario, fetch the other participant's profile
		/* const { data: _partData } = */ await supabaseClient
			.from("conversation_participants")
			.select(
				`
        profile:profiles!user_id (
          id,
          display_name,
          full_name
        )
      `,
			)
			.eq("conversation_id", latestMessage.conversation_id)
			.neq("user_id", latestMessage.user_id)
			.single();
	}

	// 4) Build the chunk from the filtered chain
	const chunkLines: string[] = [];
	const promptChunkLines: string[] = [];

	for (const msg of filteredChain) {
		const typedMsg = msg as unknown as MessageWithProfile;
		const senderProfile = typedMsg.profile;
		const senderName =
			senderProfile?.display_name || senderProfile?.full_name || "Unknown User";

		// For logging or final chunk
		const msgTimestamp = new Date(msg.created_at);
		const lineTimestamp = `[${senderName}, ${formatTimestamp(msgTimestamp, false)}]`;
		chunkLines.push(`${lineTimestamp}: ${msg.content}`);

		// For prompt chunk
		promptChunkLines.push(`${lineTimestamp}: ${msg.content}`);

		// Add file descriptions if present
		if (typedMsg.files?.length) {
			for (const file of typedMsg.files) {
				const rawDescription = file.description || "";
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
				if (file.description) {
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
			console.error("Error updating message with embedding:", updateError);
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
				console.error("Error clearing older embeddings:", clearError);
			}
		}
	}
}
