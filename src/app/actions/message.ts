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

Message Context Format Examples:

1. Multiple messages on the same day:
"""
Discussion about feature development progress in response to a general check-in
[John Doe said in General channel on 15 March 2024]:
[14:32]: How's progress on that?
[14:33]: It's going ok?
"""

2. Single message:
"""
Discussion about feature development progress in response to a general check-in
[John Doe said in General channel on 15 March 2024, 14:32]: How's the progress on that?
"""

3. Messages spanning multiple days:
"""
Discussion about feature development progress in response to a general check-in
[John Doe said in General channel on 15 March 2024]:
[23:59]: How's progress on that?
[16 March 2024, 00:01]: It's going ok?
[00:03]: Guys?
"""
*/

"use server";

import { createClient } from "@/utils/supabase/server";
import { generateEmbeddings } from "@/utils/embeddings";
import type { MessageChainContext } from "@/types/message";
import type { Database } from "@/lib/database.types";
import OpenAI from "openai";

type DatabaseMessage = Database["public"]["Tables"]["messages"]["Row"];
type DatabaseProfile = Database["public"]["Tables"]["profiles"]["Row"];

// Updated type: store a single "profile" object instead of an array
type MessageWithProfile = Omit<DatabaseMessage, "profiles"> & {
	profile: {
		id: string;
		full_name: string | null;
		display_name: string | null;
	} | null;
	context: string | null;
	embedding: number[] | null;
};

const ONE_HOUR_MS = 60 * 60 * 1000;

const openai = new OpenAI({
	apiKey: process.env.OPENAI_API_KEY,
});

function formatTimestamp(date: Date, includeDate: boolean = true): string {
	if (includeDate) {
		return date.toLocaleDateString("en-GB", {
			weekday: "long",
			day: "numeric",
			month: "long",
			year: "numeric",
			hour: "2-digit",
			minute: "2-digit",
		});
	}
	return date.toLocaleTimeString("en-GB", {
		hour: "2-digit",
		minute: "2-digit",
	});
}

function formatMessageContext(messageContext: MessageChainContext): string {
	const allMessages = [
		...messageContext.chainMessages,
		messageContext.currentMessage,
	].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

	const contextLines = [];

	// Add the generated context if available
	if (messageContext.currentMessage.generatedContext) {
		contextLines.push(messageContext.currentMessage.generatedContext);
	}

	// Single message format
	if (allMessages.length === 1) {
		const msg = allMessages[0];
		const timestamp = formatTimestamp(msg.timestamp, true);
		const channelInfo = msg.channelName
			? `in ${msg.channelName} channel`
			: `to ${msg.recipientName}`;

		contextLines.push(
			`[${msg.sender.displayName} said ${channelInfo} on ${timestamp}]: ${msg.content}`,
		);
		return contextLines.join("\n");
	}

	// Multiple messages format
	let currentDate: Date | null = null;
	let headerWritten = false;

	for (const msg of allMessages) {
		const msgDate = msg.timestamp;

		// Check if we need to write a new header (first message or date changed)
		if (
			!headerWritten ||
			(currentDate && msgDate.getDate() !== currentDate.getDate())
		) {
			const channelInfo = msg.channelName
				? `in ${msg.channelName} channel`
				: `to ${msg.recipientName}`;

			contextLines.push(
				`[${msg.sender.displayName} said ${channelInfo} on ${formatTimestamp(
					msgDate,
					true,
				)}]:`,
			);
			headerWritten = true;
		}

		// Add message with appropriate timestamp
		const needsDate =
			currentDate && msgDate.getDate() !== currentDate.getDate();
		const timestamp = needsDate
			? `[${formatTimestamp(msgDate, true)}]`
			: `[${formatTimestamp(msgDate, false)}]`;

		contextLines.push(`${timestamp}: ${msg.content}`);
		currentDate = msgDate;
	}

	return contextLines.join("\n");
}

/**
 * Gets the complete message history for a channel/conversation and formats it chronologically
 */
async function getFormattedMessageHistory(
	channelId: string | null,
	conversationId: string | null,
): Promise<string> {
	const supabase = await createClient();

	console.log("[getFormattedMessageHistory] Fetching messages for:", {
		channelId,
		conversationId,
	});

	const { data: messages } = await supabase
		.from("messages")
		.select(`
			id,
			content,
			created_at,
			channel_id,
			conversation_id,
			user_id,
			profiles:user_id (
				id,
				full_name,
				display_name
			)
		`)
		.eq(
			channelId ? "channel_id" : "conversation_id",
			channelId || conversationId,
		)
		.order("created_at", { ascending: true });

	console.log(
		"[getFormattedMessageHistory] Found messages:",
		messages?.length || 0,
	);

	if (!messages?.length) return "";

	console.log("[getFormattedMessageHistory] Getting context name...");
	let contextName = "";
	if (channelId) {
		const { data: channel } = await supabase
			.from("channels")
			.select("name")
			.eq("id", channelId)
			.single();
		contextName = channel?.name || "";
		console.log("[getFormattedMessageHistory] Got channel name:", contextName);
	} else if (conversationId) {
		const { data: participants } = await supabase
			.from("conversation_participants")
			.select(`
				profiles:user_id (
					id,
					display_name,
					full_name
				)
			`)
			.eq("conversation_id", conversationId)
			.neq("user_id", messages[0].user_id);

		const recipient = participants?.[0]?.profiles;
		contextName = recipient?.display_name || recipient?.full_name || "";
		console.log(
			"[getFormattedMessageHistory] Got recipient name:",
			contextName,
		);
	}

	console.log("[getFormattedMessageHistory] Formatting messages...");
	const lines = [
		channelId
			? `Channel: ${contextName}`
			: `Direct Message Recipient: ${contextName}`,
	];

	for (const msg of messages) {
		const senderName =
			msg.profiles?.display_name || msg.profiles?.full_name || "Unknown User";
		lines.push(
			`Sender: ${senderName}`,
			`Message: ${msg.content}`,
			`Time: ${formatTimestamp(new Date(msg.created_at))}`,
		);
	}

	const result = lines.join("\n");
	console.log("[getFormattedMessageHistory] Formatted history:", {
		lineCount: lines.length,
		previewStart: `${result.substring(0, 100)}...`,
		previewEnd: `...${result.substring(result.length - 100)}`,
	});
	return result;
}

/**
 * Gets contextual information for a chunk of messages within the complete history
 */
async function getContextualInformation(
	completeHistory: string,
	chunk: string,
): Promise<string> {
	const prompt = `<document>
${completeHistory}
</document>

Here is a sequence of chat messages we want to embed for search:
<chunk>
${chunk}
</chunk>

Please provide a brief context that captures:
1. The conversation topic or purpose
2. Any key references to previous messages
3. The relationship to the broader channel discussion

Be extremely concise (1-2 sentences max) and focus on what would make this chunk searchable later. Answer with just the context, no other text.`;

	try {
		console.log(
			"[getContextualInformation] Calling GPT-4o-mini with prompt:",
			prompt,
		);

		const response = await openai.chat.completions.create({
			model: "gpt-4o-mini",
			messages: [
				{
					role: "system",
					content:
						"You are a chat context analyzer that provides extremely concise context for chat message sequences. Your goal is to help make these messages more discoverable in future searches by capturing their key context and relationships to the broader conversation.",
				},
				{
					role: "user",
					content: prompt,
				},
			],
			temperature: 0.3,
			max_tokens: 100,
		});

		const context = response.choices[0].message?.content?.trim() || "";
		console.log("[getContextualInformation] Generated context:", context);
		return context;
	} catch (error) {
		console.error("[getContextualInformation] Error getting context:", error);
		return "";
	}
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
		.select(
			`
			*,
			profile: user_id (
				id,
				full_name,
				display_name
			)
		`,
		)
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
		profile: originalMessage.profile,
	});

	// Fetch chain messages
	const { data: rawMessages, error: chainError } = await supabase
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
			profile: user_id (
				id,
				full_name,
				display_name
			)
		`,
		)
		.eq(
			originalMessage.channel_id ? "channel_id" : "conversation_id",
			originalMessage.channel_id || originalMessage.conversation_id,
		)
		.eq("user_id", originalMessage.user_id)
		.order("created_at", { ascending: false });

	console.log(
		"[embedLatestChainMessage] Chain messages query result:",
		rawMessages?.[0],
	);

	if (chainError) {
		console.error(
			"[embedLatestChainMessage] Failed to get chain messages:",
			chainError,
		);
		return;
	}

	if (!rawMessages?.length) {
		console.log("[embedLatestChainMessage] No chain messages found");
		return;
	}

	// Transform raw messages
	const chainMessages: MessageWithProfile[] = rawMessages.map((msg) => ({
		...msg,
		profile: msg.profile || null,
		context: msg.context || null,
		embedding: msg.embedding || null,
	}));

	// The latest message in the chain
	const latestMessage = chainMessages[0];
	console.log("[embedLatestChainMessage] Latest message details:", {
		id: latestMessage.id,
		created_at: latestMessage.created_at,
		user_id: latestMessage.user_id,
		profile: latestMessage.profile,
	});

	// Filter chain messages within 1 hour of the latest
	const latestTime = new Date(latestMessage.created_at).getTime();
	const filteredChainMessages = chainMessages.filter((m) => {
		const timeDiff = latestTime - new Date(m.created_at).getTime();
		return timeDiff <= ONE_HOUR_MS;
	});

	console.log(
		"[embedLatestChainMessage] Chain messages with profile:",
		filteredChainMessages.map((m) => ({
			id: m.id,
			user_id: m.user_id,
			profile: m.profile,
			sender: {
				id: m.user_id,
				displayName:
					m.profile?.display_name || m.profile?.full_name || "Unknown User",
			},
		})),
	);

	// Get channel/conversation name for context
	let channelName: string | null = null;
	let recipientName: string | null = null;

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
				profile: user_id (
					id,
					display_name,
					full_name
				)
			`)
			.eq("conversation_id", latestMessage.conversation_id)
			.neq("user_id", latestMessage.user_id);

		const recipient = participants?.[0]?.profile;
		recipientName = recipient?.display_name || recipient?.full_name || null;
	}

	console.log(
		"[embedLatestChainMessage] Creating message context with profiles:",
		{
			originalProfile: originalMessage.profile,
			latestProfile: latestMessage.profile,
			messageContext,
		},
	);

	const embeddingContext: MessageChainContext = {
		currentMessage: {
			...messageContext.currentMessage,
			sender: {
				id: originalMessage.profile?.id || "",
				displayName:
					originalMessage.profile?.display_name ||
					originalMessage.profile?.full_name ||
					"Unknown User",
			},
		},
		chainMessages: filteredChainMessages
			.slice(1)
			.reverse()
			.map((msg) => ({
				content: msg.content,
				timestamp: new Date(
					Math.floor(new Date(msg.created_at).getTime() / 60000) * 60000,
				),
				sender: {
					id: msg.profile?.id || "",
					displayName:
						msg.profile?.display_name ||
						msg.profile?.full_name ||
						"Unknown User",
				},
				channelId: msg.channel_id,
				channelName,
				conversationId: msg.conversation_id,
				recipientName,
			})),
	};

	console.log("[embedLatestChainMessage] Created message context:", {
		sender: embeddingContext.currentMessage.sender,
		chainSenders: embeddingContext.chainMessages.map((m) => m.sender),
	});

	console.log(
		"[embedLatestChainMessage] Latest message profile:",
		latestMessage.profile,
	);
	console.log("[embedLatestChainMessage] Message context:", {
		sender: embeddingContext.currentMessage.sender,
		channelName: messageContext.currentMessage.channelName,
		recipientName: messageContext.currentMessage.recipientName,
	});

	console.log("[embedLatestChainMessage] Getting complete message history...");
	const completeHistory = await getFormattedMessageHistory(
		latestMessage.channel_id,
		latestMessage.conversation_id,
	);
	console.log(
		"[embedLatestChainMessage] Complete history length:",
		completeHistory.length,
	);

	console.log("[embedLatestChainMessage] Formatting chunk to embed...");

	// Build a small snippet for the chain
	const chunkLines = [];
	if (embeddingContext.chainMessages.length === 0) {
		const cm = embeddingContext.currentMessage;
		chunkLines.push(
			`[${cm.sender.displayName} said in ${cm.channelName} channel on ${formatTimestamp(
				cm.timestamp,
				true,
			)}]: ${cm.content}`,
		);
	} else {
		// We combine chainMessages plus currentMessage for the snippet
		const snippetMsgs = [
			...embeddingContext.chainMessages,
			embeddingContext.currentMessage,
		];
		for (const msg of snippetMsgs) {
			const channelInfo = msg.channelName
				? `in ${msg.channelName} channel`
				: `to ${msg.recipientName}`;
			chunkLines.push(
				`[${msg.sender.displayName} said ${channelInfo} on ${formatTimestamp(
					msg.timestamp,
					true,
				)}]: ${msg.content}`,
			);
		}
	}
	const chunkToEmbed = chunkLines.join("\n");
	console.log("[embedLatestChainMessage] Chunk to embed:", chunkToEmbed);

	console.log("[embedLatestChainMessage] Getting contextual information...");
	const context = await getContextualInformation(completeHistory, chunkToEmbed);
	console.log(
		"[embedLatestChainMessage] Got context:",
		context || "(no context)",
	);

	const contextualizedChunk = context
		? `Context: ${context}\n${chunkToEmbed}`
		: chunkToEmbed;

	console.log("[embedLatestChainMessage] Final contextualized chunk:", {
		hasContext: !!context,
		length: contextualizedChunk.length,
		preview: `${contextualizedChunk.substring(0, 200)}...`,
	});

	console.log(
		"[embedLatestChainMessage] Generating embedding for contextualized chunk:",
		contextualizedChunk,
	);
	const embeddings = await generateEmbeddings(
		[contextualizedChunk],
		"document",
	);
	const embedding = embeddings[0];

	if (embedding) {
		console.log(
			"[embedLatestChainMessage] Updating latest message with embedding and context...",
		);
		const { error: updateError } = await supabase
			.from("messages")
			.update({
				embedding,
				context: context || null,
			})
			.eq("id", latestMessage.id);

		if (updateError) {
			console.error(
				"[embedLatestChainMessage] Failed to update message with embedding:",
				updateError,
			);
			return;
		}

		console.log(
			"[embedLatestChainMessage] Message updated with embedding and context successfully",
		);

		// Clear embeddings and contexts of previous chain messages
		const previousMessageIds = filteredChainMessages.slice(1).map((m) => m.id);
		if (previousMessageIds.length > 0) {
			console.log(
				"[embedLatestChainMessage] Clearing embeddings and contexts for chain messages:",
				previousMessageIds,
			);
			const { error: clearError } = await supabase
				.from("messages")
				.update({
					embedding: null,
					context: null,
				})
				.in("id", previousMessageIds);

			if (clearError) {
				console.error(
					"[embedLatestChainMessage] Failed to clear embeddings and contexts:",
					clearError,
				);
			}
		}
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

	// Insert the message immediately
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

	// Schedule embedding work
	setTimeout(
		async () => {
			try {
				await embedLatestChainMessage(message.id, messageContext);
			} catch (error) {
				console.error("[createMessage] Error in delayed embedding:", error);
			}
		},
		0.1 * 60 * 1000,
	); // or your desired delay

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
