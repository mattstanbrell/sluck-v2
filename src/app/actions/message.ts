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
import { logDB } from "@/utils/logging";

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

	// Start with the context (channel or DM)
	const contextLines = [
		messageContext.currentMessage.channelName
			? `Channel: ${messageContext.currentMessage.channelName}`
			: `Direct Message Recipient: ${messageContext.currentMessage.recipientName}`,
		`Sender: ${messageContext.currentMessage.sender.displayName}`,
	];

	// Add all messages in chronological order
	const messageLines = allMessages.flatMap((msg) => [
		`Message: ${msg.content}`,
		`Time: ${formatTimestamp(msg.timestamp)}`,
	]);

	// Combine everything
	return [...contextLines, ...messageLines].join("\n");
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

	// Get messages in the current chain
	const { data: chainMessages, error: chainMessagesError } = await supabase
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
			profiles!inner (
				id,
				full_name,
				display_name
			)
		`,
		)
		.eq(
			channelId ? "channel_id" : "conversation_id",
			channelId || conversationId,
		)
		.eq("user_id", user.id)
		.lt("created_at", new Date().toISOString())
		.order("created_at", { ascending: false })
		.returns<MessageWithProfile[]>();

	logDB({
		operation: "SELECT",
		table: "messages",
		description: "Fetching chain messages for context",
		result: chainMessages,
		error: chainMessagesError,
	});

	// Start with an empty array for our filtered chain
	const filteredChainMessages: MessageWithProfile[] = [];
	let lastIncludedTime = messageContext.currentMessage.timestamp.getTime();

	// Work backwards through messages, including them until we hit a gap > 1 hour
	for (const message of chainMessages || []) {
		const timeDiff = lastIncludedTime - new Date(message.created_at).getTime();

		// If gap is > 1 hour, stop including messages
		if (timeDiff > ONE_HOUR_MS) {
			break;
		}

		// Include this message and update our last included time
		filteredChainMessages.push(message);
		lastIncludedTime = new Date(message.created_at).getTime();
	}

	// Create filtered context for embedding
	const filteredContext: MessageChainContext = {
		currentMessage: messageContext.currentMessage,
		// Reverse the array to get chronological order for the context
		chainMessages: filteredChainMessages.reverse().map((msg) => ({
			content: msg.content,
			timestamp: new Date(
				Math.floor(new Date(msg.created_at).getTime() / 60000) * 60000,
			),
			sender: {
				id: msg.profiles?.id ?? "",
				displayName:
					msg.profiles?.display_name || msg.profiles?.full_name || "",
			},
			channelId: msg.channel_id,
			channelName: messageContext.currentMessage.channelName,
			conversationId: msg.conversation_id,
			recipientName: messageContext.currentMessage.recipientName,
		})),
	};

	// Generate embedding for the content with filtered context
	let embedding = null;
	try {
		const formattedContext = formatMessageContext(filteredContext);
		console.log(
			"[createMessage] Generating embedding for context:",
			formattedContext,
		);
		const embeddings = await generateEmbeddings([formattedContext], "document");
		embedding = embeddings[0];
	} catch (error) {
		console.error("Failed to generate embedding:", error);
		// Continue without embedding if generation fails
	}

	// If we have chain messages, clear the embedding from all messages in the chain
	// since their context is now included in our new embedding
	if (filteredChainMessages.length > 0) {
		const messageIds = filteredChainMessages
			.map((msg) => msg.id)
			.filter(Boolean);

		const { error: updateError } = await supabase
			.from("messages")
			.update({ embedding: null })
			.in("id", messageIds);

		logDB({
			operation: "UPDATE",
			table: "messages",
			description: `Clearing embeddings for ${messageIds.length} chain messages`,
			error: updateError,
		});
	}

	// Insert the message with the embedding
	const { data: message, error: messageError } = await supabase
		.from("messages")
		.insert({
			content: content.trim(),
			channel_id: channelId ?? null,
			conversation_id: conversationId ?? null,
			parent_id: parentId ?? null,
			user_id: user.id,
			embedding: embedding,
		})
		.select()
		.single();

	logDB({
		operation: "INSERT",
		table: "messages",
		description: "Creating new message",
		result: message,
		error: messageError,
	});

	if (messageError) {
		throw messageError;
	}

	// Update conversation's last_message_at if it's a DM
	if (conversationId) {
		const { error: conversationError } = await supabase
			.from("conversations")
			.update({
				last_message_at: new Date().toISOString(),
			})
			.eq("id", conversationId);

		logDB({
			operation: "UPDATE",
			table: "conversations",
			description: "Updating conversation last_message_at",
			error: conversationError,
		});
	}

	return message;
}
