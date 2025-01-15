"use server";

import OpenAI from "openai";
import { searchMessages } from "./search";
import { createClient } from "@/utils/supabase/server";

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
		const supabase = await createClient();

		// Get current user's profile
		const {
			data: { user },
			error: userError,
		} = await supabase.auth.getUser();
		if (userError || !user) {
			throw new Error("Unauthorized");
		}

		const { data: profile } = await supabase
			.from("profiles")
			.select("full_name, display_name")
			.eq("id", user.id)
			.single();

		if (!profile) {
			throw new Error("User profile not found");
		}

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

		// Add system prompt with user info
		const systemPrompt: Message = {
			id: crypto.randomUUID(),
			role: "system",
			content: `You are Slucky, a helpful AI assistant for the Sluck workspace chat application. You are chatting with ${profile.display_name || profile.full_name}. You should be friendly and conversational while remaining professional. You can help with questions about messages in the workspace, provide general assistance, or engage in casual conversation.`,
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
			systemPrompt,
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

		// Add detailed logging of the full context
		console.log("[streamChat] Full messages context:");
		messagesWithContext.forEach((msg, i) => {
			console.log(`\n[Message ${i + 1}]`);
			console.log("Role:", msg.role);
			console.log("Content:", msg.content);
		});

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
