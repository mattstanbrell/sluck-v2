"use server";

import OpenAI from "openai";
import { searchMessages } from "./search";

const openai = new OpenAI({
	apiKey: process.env.OPENAI_API_KEY,
});

export interface Message {
	id: string;
	role: "user" | "assistant" | "system";
	content: string;
}

export async function streamChat(messages: Message[]) {
	try {
		// Get the user's latest message
		const userMessage = messages[messages.length - 1];
		console.log("\n[streamChat] Processing user message:", userMessage.content);

		// Add current date and time context
		const now = new Date();
		const dateTimeContext: Message = {
			id: crypto.randomUUID(),
			role: "system",
			content: `Current date and time: ${now.toLocaleDateString("en-GB", {
				weekday: "long",
				day: "numeric",
				month: "long",
				year: "numeric",
				hour: "2-digit",
				minute: "2-digit",
			})}`,
		};

		// Search for relevant context
		console.log("[streamChat] Searching for relevant context...");
		const searchResults = await searchMessages(userMessage.content);
		console.log("[streamChat] Found context results:", searchResults.length);

		// Format context as a system message
		let contextMessage: Message | null = null;
		if (searchResults.length > 0) {
			console.log(
				"[streamChat] Building context from results:",
				searchResults.map((r) => ({
					similarity: r.similarity,
					channel: r.channel_name,
					preview: `${r.content.substring(0, 50)}...`,
				})),
			);

			const contextStr = searchResults
				.map(
					(msg) =>
						`[${msg.sender_name} in ${msg.channel_name || "DM"}]: ${msg.content}`,
				)
				.join("\n\n");

			contextMessage = {
				id: crypto.randomUUID(),
				role: "system",
				content: `Here are some relevant messages from the workspace that might help with the response:\n\n${contextStr}\n\nPlease use this context to inform your response when relevant.`,
			};

			console.log("[streamChat] Created context message:", {
				id: contextMessage.id,
				contentLength: contextMessage.content.length,
				contextCount: searchResults.length,
			});
		} else {
			console.log("[streamChat] No relevant context found");
		}

		// Add context to messages if available
		const messagesWithContext = [
			...messages.slice(0, -1),
			dateTimeContext,
			...(contextMessage ? [contextMessage] : []),
			userMessage,
		];

		console.log(
			"[streamChat] Final message count:",
			messagesWithContext.length,
		);
		console.log(
			"[streamChat] Message roles:",
			messagesWithContext.map((m) => m.role),
		);

		console.log("[streamChat] Calling OpenAI...");
		const response = await openai.chat.completions.create({
			model: "gpt-4o-mini",
			messages: messagesWithContext.map((msg) => ({
				role: msg.role,
				content: msg.content,
			})),
			stream: true,
		});

		return response;
	} catch (error) {
		console.error("[streamChat] Error:", error);
		throw error;
	}
}
