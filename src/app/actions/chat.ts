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
		console.log("\n[streamChat] Starting semantic search...");
		console.log("[streamChat] Search query:", userMessage.content);

		// Check if there are any messages with embeddings
		const { count: embeddingCount } = await supabase
			.from("messages")
			.select("*", { count: "exact", head: true })
			.not("embedding", "is", null);

		console.log("[streamChat] Messages with embeddings:", embeddingCount);

		const searchResults = await searchMessages(userMessage.content);
		console.log("[streamChat] Search results:", {
			count: searchResults.length,
			results: searchResults.map((r) => ({
				similarity: r.similarity,
				channel: r.channel_name,
				preview: `${r.content.substring(0, 50)}...`,
				hasContext: !!r.context,
			})),
		});

		// Format context as a system message
		let contextMessage: Message | null = null;
		if (searchResults.length > 0) {
			console.log(
				"[streamChat] Building context from results:",
				searchResults.map((r) => ({
					similarity: r.similarity,
					channel: r.channel_name,
					preview: `${r.content.substring(0, 50)}...`,
					context: r.context ? `${r.context.substring(0, 50)}...` : null,
					chainMessages: r.chain_messages?.length || 0,
				})),
			);

			const contextStr = searchResults
				.map((msg) => {
					const date = new Date(msg.created_at);
					const formattedDate = date.toLocaleDateString("en-GB", {
						weekday: "long",
						day: "numeric",
						month: "long",
						year: "numeric",
					});

					// If there are chain messages, format them together
					if (msg.chain_messages?.length) {
						const lines = [];

						// Add the generated context if available
						if (msg.context) {
							lines.push(msg.context);
						}

						// Add the header with sender and channel
						lines.push(
							`[${msg.sender_name} said in ${msg.channel_name || "DM"} channel on ${formattedDate}]:`,
						);

						// Add all messages in the chain
						for (const chainMsg of msg.chain_messages) {
							const chainDate = new Date(chainMsg.created_at);
							const time = chainDate.toLocaleTimeString("en-GB", {
								hour: "2-digit",
								minute: "2-digit",
							});
							lines.push(`[${time}]: ${chainMsg.content}`);
						}

						// Add the final message
						const time = date.toLocaleTimeString("en-GB", {
							hour: "2-digit",
							minute: "2-digit",
						});
						lines.push(`[${time}]: ${msg.content}`);

						console.log("[streamChat] Formatted chain message:", {
							sender: msg.sender_name,
							channel: msg.channel_name,
							chainLength: msg.chain_messages.length + 1,
							context: msg.context || "(no context)",
							preview: `${lines.join("\n").substring(0, 200)}...`,
						});

						return lines.join("\n");
					}

					// Single message format
					const lines = [];
					if (msg.context) {
						lines.push(msg.context);
					}

					const time = date.toLocaleTimeString("en-GB", {
						hour: "2-digit",
						minute: "2-digit",
					});
					lines.push(
						`[${msg.sender_name} said in ${msg.channel_name || "DM"} channel on ${formattedDate}, ${time}]: ${msg.content}`,
					);

					console.log("[streamChat] Formatted single message:", {
						sender: msg.sender_name,
						channel: msg.channel_name,
						context: msg.context || "(no context)",
						preview: `${lines.join("\n").substring(0, 200)}...`,
					});

					return lines.join("\n");
				})
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
				preview: contextMessage.content,
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
