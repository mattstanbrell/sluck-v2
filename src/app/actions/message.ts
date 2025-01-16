/*
Message Embedding Chain Logic:

We want to create embeddings that capture the context of message chains, where a chain is a sequence
of messages from the same user with no gaps larger than 1 hour. When adding a new message to a chain,
we include all previous messages in the chain up until we hit a gap > 1 hour.

Example:
[12:00] Message A: "First message"
[12:55] Message B: "Second message"
[14:00] Message C: "Third message"  <-- Gap > 1 hour after B
[14:05] Message D: "Fourth message"
[14:10] Message E: "Fifth message" (Current message being sent)

When sending Message E:
1. Start from most recent (D) and work backwards
2. Include D (5 min gap to E)
3. Include C (5 min gap to D)
4. Stop at B (65 min gap to C > 1 hour)
5. Generate embedding for E with context of C, D, and E
6. Clear D's embedding (now included in E's context)
7. Keep C's embedding (it's the start of its own chain)
*/

"use server";

import { createClient } from "@/utils/supabase/server";
import { generateEmbeddings } from "@/utils/embeddings";
import type { MessageChainContext } from "@/types/message";
import type { Database } from "@/lib/database.types";

type DatabaseMessage = Database["public"]["Tables"]["messages"]["Row"];
type DatabaseProfile = Database["public"]["Tables"]["profiles"]["Row"];

// Type for the message with joined profile data from our query
type MessageWithProfile = DatabaseMessage & {
	profiles: Pick<DatabaseProfile, "id" | "full_name" | "display_name"> | null;
};

const ONE_HOUR_MS = 60 * 60 * 1000;

function formatTimestamp(date: Date): string {
	return date.toLocaleDateString("en-GB", {
		weekday: "long",
		day: "numeric",
		month: "long",
		year: "numeric",
		hour: "2-digit",
		minute: "2-digit",
	});
}

function formatMessageContext(messageContext: MessageChainContext): string {
	// Get all messages including the current one
	const allMessages = [
		...messageContext.chainMessages,
		messageContext.currentMessage,
	].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime()); // Sort chronologically

	console.log("[formatMessageContext] Current message sender:", {
		id: messageContext.currentMessage.sender.id,
		displayName: messageContext.currentMessage.sender.displayName,
	});

	// Start with the context (channel or DM)
	const contextLines = [
		messageContext.currentMessage.channelName
			? `Channel: ${messageContext.currentMessage.channelName}`
			: `Direct Message Recipient: ${messageContext.currentMessage.recipientName}`,
		`Sender: ${messageContext.currentMessage.sender.displayName}`,
	];

	console.log("[formatMessageContext] Context lines:", contextLines);

	// Add all messages in chronological order
	const messageLines = allMessages.flatMap((msg) => [
		`Message: ${msg.content}`,
		`Time: ${formatTimestamp(msg.timestamp)}`,
	]);

	// Combine everything
	const result = [...contextLines, ...messageLines].join("\n");
	console.log("[formatMessageContext] Final formatted context:", result);
	return result;
}

async function embedLatestChainMessage(
	messageId: string,
	messageContext: MessageChainContext,
) {
	const supabase = await createClient();

	console.log("[embedLatestChainMessage] Starting for message:", messageId);

	// First get our original message to get its details
	const { data: originalMessage, error: originalError } = await supabase
		.from("messages")
		.select(`
			*,
			profiles:user_id (
				id,
				full_name,
				display_name
			)
		`)
		.eq("id", messageId)
		.single();

	if (originalError || !originalMessage) {
		console.error(
			"[embedLatestChainMessage] Failed to get original message:",
			originalError,
		);
		return;
	}

	console.log("[embedLatestChainMessage] Original message details:", {
		id: originalMessage.id,
		user_id: originalMessage.user_id,
		profiles: originalMessage.profiles,
	});

	// Find the most recent message in this chain
	const { data: chainMessages, error: chainError } = await supabase
		.from("messages")
		.select(`
			id,
			content,
			created_at,
			channel_id,
			conversation_id,
			user_id,
			parent_id,
			profiles:user_id (
				id,
				full_name,
				display_name
			)
		`)
		.eq(
			originalMessage.channel_id ? "channel_id" : "conversation_id",
			originalMessage.channel_id || originalMessage.conversation_id,
		)
		.eq("user_id", originalMessage.user_id)
		.gte(
			"created_at",
			new Date(
				new Date(originalMessage.created_at).getTime() - ONE_HOUR_MS,
			).toISOString(),
		)
		.lte(
			"created_at",
			new Date(
				new Date(originalMessage.created_at).getTime() + ONE_HOUR_MS,
			).toISOString(),
		)
		.order("created_at", { ascending: false });

	console.log(
		"[embedLatestChainMessage] Chain messages query result:",
		chainMessages?.[0],
	);

	if (chainError) {
		console.error(
			"[embedLatestChainMessage] Failed to get chain messages:",
			chainError,
		);
		return;
	}

	if (!chainMessages?.length) {
		console.log("[embedLatestChainMessage] No chain messages found");
		return;
	}

	// Get the latest message in the chain
	const latestMessage = chainMessages[0];
	console.log("[embedLatestChainMessage] Latest message details:", {
		id: latestMessage.id,
		created_at: latestMessage.created_at,
		user_id: latestMessage.user_id,
		profiles: latestMessage.profiles,
	});

	// Check if it already has an embedding
	const { data: messageWithEmbedding } = await supabase
		.from("messages")
		.select("embedding")
		.eq("id", latestMessage.id)
		.single();

	if (messageWithEmbedding?.embedding) {
		console.log(
			"[embedLatestChainMessage] Latest message already has embedding, skipping",
		);
		return;
	}

	// Filter chain messages to only include those within 1 hour before the latest message
	const latestTime = new Date(latestMessage.created_at).getTime();
	const filteredChainMessages = chainMessages.filter((msg) => {
		const timeDiff = latestTime - new Date(msg.created_at).getTime();
		return timeDiff <= ONE_HOUR_MS;
	});

	// Get channel/conversation name for context
	let channelName = null;
	let recipientName = null;

	if (latestMessage.channel_id) {
		const { data: channel } = await supabase
			.from("channels")
			.select("name")
			.eq("id", latestMessage.channel_id)
			.single();
		channelName = channel?.name || null;
	} else if (latestMessage.conversation_id) {
		const { data: participants } = await supabase
			.from("conversation_participants")
			.select(`
				profiles:user_id (
					id,
					display_name,
					full_name
				)
			`)
			.eq("conversation_id", latestMessage.conversation_id)
			.neq("user_id", latestMessage.user_id);

		const recipient = participants?.[0]?.profiles;
		if (recipient) {
			recipientName =
				recipient[0]?.display_name || recipient[0]?.full_name || null;
		}
	}

	// Create context for embedding
	console.log(
		"[embedLatestChainMessage] Creating message context with profiles:",
		{
			originalProfiles: originalMessage.profiles,
			latestProfiles: latestMessage.profiles,
			messageContext: messageContext,
		},
	);

	const embeddingContext: MessageChainContext = {
		currentMessage: messageContext.currentMessage,
		chainMessages: filteredChainMessages
			.slice(1)
			.reverse()
			.map((msg) => ({
				content: msg.content,
				timestamp: new Date(
					Math.floor(new Date(msg.created_at).getTime() / 60000) * 60000,
				),
				sender: messageContext.currentMessage.sender,
				channelId: msg.channel_id,
				channelName,
				conversationId: msg.conversation_id,
				recipientName,
			})),
	};

	console.log("[embedLatestChainMessage] Created message context:", {
		sender: embeddingContext.currentMessage.sender,
		chainSenders: embeddingContext.chainMessages.map((msg) => msg.sender),
	});

	console.log(
		"[embedLatestChainMessage] Latest message profiles:",
		latestMessage.profiles,
	);
	console.log("[embedLatestChainMessage] Message context:", {
		sender: embeddingContext.currentMessage.sender,
		channelName: embeddingContext.currentMessage.channelName,
		recipientName: embeddingContext.currentMessage.recipientName,
	});

	// Generate embedding
	try {
		const formattedContext = formatMessageContext(embeddingContext);
		console.log(
			"[embedLatestChainMessage] Generating embedding for context:",
			formattedContext,
		);
		const embeddings = await generateEmbeddings([formattedContext], "document");
		const embedding = embeddings[0];

		// Update the latest message with the embedding
		if (embedding) {
			console.log(
				"[embedLatestChainMessage] Updating latest message with embedding...",
			);
			const { error: updateError } = await supabase
				.from("messages")
				.update({ embedding })
				.eq("id", latestMessage.id);

			if (updateError) {
				console.error(
					"[embedLatestChainMessage] Failed to update message with embedding:",
					updateError,
				);
				return;
			}

			console.log(
				"[embedLatestChainMessage] Message updated with embedding successfully",
			);

			// Clear embeddings of previous chain messages
			const previousMessageIds = filteredChainMessages
				.slice(1)
				.map((msg) => msg.id);
			if (previousMessageIds.length > 0) {
				console.log(
					"[embedLatestChainMessage] Clearing embeddings for chain messages:",
					previousMessageIds,
				);
				const { error: clearError } = await supabase
					.from("messages")
					.update({ embedding: null })
					.in("id", previousMessageIds);

				if (clearError) {
					console.error(
						"[embedLatestChainMessage] Failed to clear embeddings:",
						clearError,
					);
				}
			}
		}
	} catch (error) {
		console.error(
			"[embedLatestChainMessage] Error generating embedding:",
			error,
		);
	}
}

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
}) {
	const supabase = await createClient();

	// Get the current user
	const {
		data: { user },
		error: userError,
	} = await supabase.auth.getUser();
	if (userError || !user) {
		throw new Error("Unauthorized");
	}

	// Insert the message immediately without waiting for anything
	console.log("[createMessage] Creating message in database...");
	const { data: message, error: messageError } = await supabase
		.from("messages")
		.insert({
			content: content.trim(),
			channel_id: channelId ?? null,
			conversation_id: conversationId ?? null,
			parent_id: parentId ?? null,
			user_id: user.id,
		})
		.select()
		.single();

	if (messageError) {
		console.error("[createMessage] Failed to create message:", messageError);
		throw messageError;
	}

	console.log("[createMessage] Message created successfully:", {
		id: message.id,
		channel: message.channel_id,
		content:
			message.content.substring(0, 50) +
			(message.content.length > 50 ? "..." : ""),
	});

	// Schedule the embedding work for 5 minutes later
	setTimeout(
		async () => {
			try {
				await embedLatestChainMessage(message.id, messageContext);
			} catch (error) {
				console.error("[createMessage] Error in delayed embedding:", error);
			}
		},
		5 * 60 * 1000, // 5 minutes
	);

	// Update conversation's last_message_at if it's a DM
	if (conversationId) {
		await supabase
			.from("conversations")
			.update({
				last_message_at: new Date().toISOString(),
			})
			.eq("id", conversationId);
	}

	return message;
}
