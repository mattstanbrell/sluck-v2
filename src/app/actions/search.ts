import { createClient } from "@/utils/supabase/server";
import { generateEmbeddings } from "@/utils/embeddings";
import type { Database } from "@/lib/database.types";

const ONE_HOUR_MS = 60 * 60 * 1000;

type MatchResult = {
	id: string;
	conversation_id: string | null;
	channel_id: string | null;
	user_id: string;
	content: string;
	context: string | null;
	formatted_chain: string | null;
	similarity: number;
};

type DatabaseMessage = Database["public"]["Tables"]["messages"]["Row"];

interface RawDatabaseMessage {
	id: string;
	content: string;
	context: string | null;
	channel_id: string | null;
	conversation_id: string | null;
	user_id: string;
	created_at: string;
	parent_id: string | null;
	embedding: number[] | null;
	formatted_chain: string | null;
	profiles:
		| {
				id: string;
				full_name: string;
				display_name: string | null;
		  }[]
		| null;
	channels:
		| {
				id: string;
				name: string;
		  }[]
		| null;
}

type MessageWithProfile = DatabaseMessage & {
	profiles: {
		id: string;
		full_name: string;
		display_name: string | null;
	} | null;
	channels: {
		id: string;
		name: string;
	} | null;
	chain_messages?: ChainMessage[];
};

interface ChainMessage {
	id: string;
	content: string;
	created_at: string;
}

interface RawSearchResult {
	id: string;
	content: string;
	created_at: string;
	channel_id: string | null;
	conversation_id: string | null;
	user_id: string;
	parent_id: string | null;
	context: string | null;
	embedding: number[] | null;
	formatted_chain: string | null;
	similarity: number;
	profile?: {
		id: string;
		display_name: string | null;
		full_name: string;
	} | null;
	channel?: {
		id: string;
		name: string;
	} | null;
	chain_messages?: ChainMessage[];
}

interface DatabaseSearchResult {
	id: string;
	content: string;
	created_at: string;
	channel_id: string | null;
	conversation_id: string | null;
	user_id: string;
	parent_id: string | null;
	context: string | null;
	embedding: number[] | null;
	formatted_chain: string | null;
	similarity: number;
	chain_messages: {
		id: string;
		content: string;
		created_at: string;
	}[];
	profile: {
		id: string;
		display_name: string | null;
		full_name: string;
	} | null;
	channel: {
		id: string;
		name: string;
	} | null;
}

interface RawDatabaseResult {
	id: string;
	content: string;
	created_at: string;
	channel_id: string | null;
	conversation_id: string | null;
	user_id: string;
	parent_id: string | null;
	context: string | null;
	embedding: number[] | null;
	formatted_chain: string | null;
	similarity: number;
	chain_messages?: {
		id: string;
		content: string;
		created_at: string;
	}[];
	profile?:
		| {
				id: string;
				display_name: string | null;
				full_name: string;
		  }[]
		| null;
	channel?:
		| {
				id: string;
				name: string;
		  }[]
		| null;
}

export interface SearchResult {
	id: string;
	content: string;
	created_at: string;
	channel_id: string | null;
	conversation_id: string | null;
	user_id: string;
	parent_id: string | null;
	context: string | null;
	embedding: number[] | null;
	formatted_chain: string | null;
	sender_name: string;
	channel_name: string | null;
	similarity: number;
	chain_messages?: ChainMessage[];
}

export async function searchMessages(query: string): Promise<SearchResult[]> {
	console.log("\n[searchMessages] Starting search with query:", query);

	const supabase = await createClient();

	// Generate embedding for the search query
	console.log("[searchMessages] Generating embeddings for query...");
	const embeddings = await generateEmbeddings([query], "query");
	const embedding = embeddings[0];

	if (!embedding) {
		console.error("[searchMessages] Failed to generate embedding for query");
		return [];
	}
	console.log(
		"[searchMessages] Successfully generated embedding of length:",
		embedding.length,
	);

	// Search messages using the embedding
	console.log("[searchMessages] Calling match_messages RPC with parameters:", {
		match_threshold: 0.3,
		match_count: 10,
	});

	const { data: matchResults, error: searchError } = await supabase.rpc(
		"match_messages",
		{
			query_embedding: embedding,
			match_threshold: 0.3,
			match_count: 10,
		},
	);

	if (searchError) {
		console.error("[searchMessages] Search RPC error:", searchError);
		return [];
	}

	if (!matchResults) {
		console.log("[searchMessages] No results found");
		return [];
	}

	console.log("[searchMessages] Found", matchResults.length, "results");

	// Get profile and channel info for each result
	const { data: profiles } = await supabase
		.from("profiles")
		.select("id, display_name, full_name")
		.in(
			"id",
			matchResults.map((r: MatchResult) => r.user_id),
		);

	const { data: channels } = await supabase
		.from("channels")
		.select("id, name")
		.in(
			"id",
			matchResults.map((r: MatchResult) => r.channel_id).filter(Boolean),
		);

	// Transform results
	const searchResults = matchResults.map(
		(result: MatchResult): SearchResult => {
			const profile = profiles?.find((p) => p.id === result.user_id);
			const channel = channels?.find((c) => c.id === result.channel_id);

			const transformedResult: SearchResult = {
				id: result.id,
				content: result.content,
				created_at: new Date().toISOString(), // match_messages doesn't return created_at
				channel_id: result.channel_id,
				conversation_id: result.conversation_id,
				user_id: result.user_id,
				parent_id: null, // match_messages doesn't return parent_id
				context: result.context,
				embedding: null, // We don't need to return the embedding
				formatted_chain: result.formatted_chain,
				similarity: result.similarity,
				sender_name:
					profile?.display_name || profile?.full_name || "Unknown User",
				channel_name: channel?.name || null,
			};

			console.log("[searchMessages] Transformed result:", {
				id: transformedResult.id,
				sender: transformedResult.sender_name,
				channel: transformedResult.channel_name,
				similarity: transformedResult.similarity,
			});

			return transformedResult;
		},
	);

	console.log(
		"[searchMessages] Returning",
		searchResults.length,
		"final results",
	);
	return searchResults;
}
