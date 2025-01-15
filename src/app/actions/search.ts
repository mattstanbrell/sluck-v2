import { createClient } from "@/utils/supabase/server";
import { generateEmbeddings } from "@/utils/embeddings";

export interface SearchResult {
	id: string;
	content: string;
	similarity: number;
	channel_name?: string;
	sender_name: string;
	created_at: string;
}

interface MatchResult {
	id: string;
	content: string;
	similarity: number;
}

export async function searchMessages(query: string): Promise<SearchResult[]> {
	console.log("\n[searchMessages] Starting search for query:", query);
	const supabase = await createClient();

	// Generate embedding for the search query
	console.log("[searchMessages] Generating embedding...");
	const embeddings = await generateEmbeddings([query], "query");
	const embedding = embeddings[0]; // Get the first (and only) embedding
	console.log(
		"[searchMessages] Generated embedding of length:",
		embedding.length,
	);

	// Search for similar messages using the match_messages function
	console.log("[searchMessages] Calling match_messages with:", {
		match_threshold: 0.1,
		match_count: 5,
	});

	const { data: results, error } = await supabase.rpc("match_messages", {
		query_embedding: embedding,
		match_threshold: 0.1,
		match_count: 5,
	});

	if (error) {
		console.error("[searchMessages] Error searching messages:", error);
		return [];
	}

	console.log("[searchMessages] Found matches:", results?.length || 0);
	if (results?.length) {
		console.log(
			"[searchMessages] First match similarity:",
			results[0].similarity,
		);
	}

	// Get additional context for each message
	console.log("[searchMessages] Fetching additional context for matches...");
	const messagesWithContext = await Promise.all(
		(results || []).map(async (result: MatchResult) => {
			console.log("[searchMessages] Fetching context for message:", result.id);

			// First get the matched message details
			const { data: message, error: messageError } = await supabase
				.from("messages")
				.select(`
					*,
					channels (name),
					profiles (full_name, display_name)
				`)
				.eq("id", result.id)
				.single();

			if (messageError || !message) {
				console.error(
					"[searchMessages] Error fetching message context:",
					messageError,
				);
				return null;
			}

			// Get all messages in the chain (messages from same user within 1 hour before this message)
			const oneHourBefore = new Date(message.created_at);
			oneHourBefore.setHours(oneHourBefore.getHours() - 1);

			const { data: chainMessages, error: chainError } = await supabase
				.from("messages")
				.select(`
					content,
					created_at,
					profiles!inner (
						full_name,
						display_name
					)
				`)
				.eq("user_id", message.user_id)
				.eq(
					message.channel_id ? "channel_id" : "conversation_id",
					message.channel_id || message.conversation_id,
				)
				.gte("created_at", oneHourBefore.toISOString())
				.lte("created_at", message.created_at)
				.order("created_at", { ascending: true });

			if (chainError) {
				console.error(
					"[searchMessages] Error fetching chain messages:",
					chainError,
				);
			}

			// Format the chain messages into a single context string
			const chainContent = [
				// Add channel/conversation context
				message.channel_id
					? `Channel: ${message.channels?.name}`
					: "Direct Message",
				// Add sender info
				`Sender: ${message.profiles?.display_name || message.profiles?.full_name || "Unknown"}`,
				// Add all messages in chronological order
				...(chainMessages?.flatMap((msg) => [
					`Message: ${msg.content}`,
					`Time: ${new Date(msg.created_at).toLocaleDateString("en-GB", {
						weekday: "long",
						day: "numeric",
						month: "long",
						year: "numeric",
						hour: "2-digit",
						minute: "2-digit",
					})}`,
				]) || [`Message: ${message.content}`]),
			].join("\n");

			const searchResult = {
				id: result.id,
				content: chainContent, // Use the full chain content instead of just the matched message
				similarity: result.similarity,
				channel_name: message.channels?.name,
				sender_name:
					message.profiles?.display_name ||
					message.profiles?.full_name ||
					"Unknown",
				created_at: message.created_at,
			};

			console.log("[searchMessages] Processed result:", {
				id: searchResult.id,
				similarity: searchResult.similarity,
				channel: searchResult.channel_name,
				sender: searchResult.sender_name,
				chainLength: chainMessages?.length || 1,
			});

			return searchResult;
		}),
	);

	const finalResults = messagesWithContext.filter(
		(m: SearchResult | null): m is SearchResult => m !== null,
	);
	console.log("[searchMessages] Final results count:", finalResults.length);

	return finalResults;
}
