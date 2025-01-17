import { createClient } from "@/utils/supabase/server";
import OpenAI from "openai";

/**
 * Minimal interface for a user profile
 */
type ProfileResponse = {
	id: string;
	full_name?: string | null;
	display_name?: string | null;
};

// Export the one hour constant used in other files
export const ONE_HOUR_MS = 60 * 60 * 1000;

/**
 * Format a timestamp for display
 */
export function formatTimestamp(date: Date, includeDate = true): string {
	if (includeDate) {
		// e.g. Thursday, 5 October 2023, 10:30
		return date.toLocaleDateString("en-GB", {
			weekday: "long",
			day: "numeric",
			month: "long",
			year: "numeric",
			hour: "2-digit",
			minute: "2-digit",
		});
	}
	// e.g. 10:30
	return date.toLocaleTimeString("en-GB", {
		hour: "2-digit",
		minute: "2-digit",
	});
}

/**
 * Get the entire message history for a channel or conversation in chronological order,
 * replicating the snippet in the giant file that merges "profiles" and "files."
 */
export async function getFormattedMessageHistory(
	channelId: string | null,
	conversationId: string | null,
): Promise<string> {
	console.log(
		`[getFormattedMessageHistory] Starting for ${channelId ? "channel" : "conversation"} ID: ${channelId || conversationId}`,
	);

	const supabase = await createClient();
	const { data: messages, error } = await supabase
		.from("messages")
		.select(`
      id,
      content,
      created_at,
      channel_id,
      conversation_id,
      user_id,
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
    `)
		.eq(
			channelId ? "channel_id" : "conversation_id",
			channelId || conversationId,
		)
		.order("created_at", { ascending: true });

	if (error) {
		console.error(
			"[getFormattedMessageHistory] Error fetching messages:",
			error,
		);
		return "";
	}
	if (!messages || !messages.length) {
		console.log("[getFormattedMessageHistory] No messages found");
		return "";
	}

	console.log(`[getFormattedMessageHistory] Found ${messages.length} messages`);

	// Determine channel name or DM recipient
	let heading = "";
	if (channelId) {
		// Attempt to fetch channel name
		const { data: channelData } = await supabase
			.from("channels")
			.select("name")
			.eq("id", channelId)
			.single();

		heading = channelData?.name
			? `Channel: ${channelData.name}`
			: "Channel: (unknown)";
	} else if (conversationId) {
		// Attempt to fetch DM recipient
		const firstMsgUserId = messages[0].user_id;
		const { data: participant } = await supabase
			.from("conversation_participants")
			.select(`
        profile:profiles!user_id (
          id,
          display_name,
          full_name
        )
      `)
			.eq("conversation_id", conversationId)
			.neq("user_id", firstMsgUserId)
			.single();

		const p = participant?.profile as unknown as ProfileResponse;
		const recipientName = p?.display_name || p?.full_name || "Unknown User";
		heading = `Direct Message Recipient: ${recipientName}`;
	}

	const lines: string[] = [];
	if (heading) lines.push(heading);

	let currentDate: string | null = null;

	for (const msg of messages) {
		const sender = msg.profile as unknown as ProfileResponse;
		const senderName =
			sender?.display_name || sender?.full_name || "Unknown User";

		const dt = new Date(msg.created_at);
		const dateStr = dt.toLocaleDateString("en-GB", {
			weekday: "long",
			day: "numeric",
			month: "long",
			year: "numeric",
		});

		if (currentDate !== dateStr) {
			lines.push(`Date: ${dateStr}`);
			currentDate = dateStr;
		}

		// Write the message
		lines.push(
			`[${senderName}, ${formatTimestamp(dt, false)}]: ${msg.content}`,
		);

		// If there are files
		if (msg.files && msg.files.length > 0) {
			for (const file of msg.files) {
				if (file.description) {
					const rawDescription = file.description
						.replace(/^\[.*?\. (Image|Audio|Video) description: /, "")
						.replace(/\]$/, "");
					if (file.file_type.startsWith("image/")) {
						lines.push(
							`[Image: "${file.file_name}"] [Description: ${rawDescription}]`,
						);
					} else if (file.file_type.startsWith("audio/")) {
						lines.push(
							`[Audio: "${file.file_name}"] [Description: ${rawDescription}]`,
						);
					} else if (file.file_type.startsWith("video/")) {
						lines.push(
							`[Video: "${file.file_name}"] [Description: ${rawDescription}]`,
						);
					}
				}
			}
		}
	}

	const formattedHistory = lines.join("\n");
	console.log("[Message History]:\n", formattedHistory);
	return formattedHistory;
}

/**
 * getContextualInformation - calls GPT-4o-mini to derive a brief snippet of context
 * for future semantic search, exactly as the giant file does.
 */
const openai = new OpenAI({
	apiKey: process.env.OPENAI_API_KEY,
});

export async function getContextualInformation(
	completeHistory: string,
	chunk: string,
): Promise<string> {
	console.log("[getContextualInformation] Starting context generation");
	console.log(
		"[getContextualInformation] Complete history length:",
		completeHistory.length,
	);
	console.log("[getContextualInformation] Chunk length:", chunk.length);

	const prompt = `
<conversation>
${completeHistory}
</conversation>

<chunk>
${chunk}
</chunk>

Please provide a brief (1-2 sentences) context summarizing the chunk's relevance in the conversation.
Return only the context, no extraneous text.
`;

	try {
		const response = await openai.chat.completions.create({
			model: "gpt-4o-mini",
			messages: [
				{
					role: "system",
					content:
						"You are a chat context analyzer. Please respond with an extremely concise context summary only.",
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
		console.log("[Contextual Information]:\n", context);
		return context;
	} catch (error) {
		console.error("[getContextualInformation] Error:", error);
		return "";
	}
}
