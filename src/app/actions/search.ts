import { createClient } from "@/utils/supabase/server";
import { generateEmbeddings } from "@/utils/embeddings";
import type { Database } from "@/lib/database.types";

export interface SearchResult {
	id: string;
	content: string;
	similarity: number;
	channel_name?: string;
	sender_name: string;
	created_at: string;
}

type MatchResult =
	Database["public"]["Functions"]["match_messages"]["Returns"][number];

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

	const { data: results, error } = await supabase.rpc<
		Database["public"]["Functions"]["match_messages"]["Returns"][number],
		Database["public"]["Functions"]["match_messages"]["Args"]
	>("match_messages", {
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
			const { data: message, error: messageError } = await supabase
				.from("messages")
				.select(`
					*,
					channels (name),
					profiles (full_name, display_name)
				`)
				.eq("id", result.id)
				.single();

			if (messageError) {
				console.error(
					"[searchMessages] Error fetching message context:",
					messageError,
				);
				return null;
			}

			if (!message) {
				console.log("[searchMessages] No message found for id:", result.id);
				return null;
			}

			const searchResult = {
				id: result.id,
				content: result.content,
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
