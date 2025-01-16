import { createClient } from "@/utils/supabase/server";
import { generateEmbeddings } from "@/utils/embeddings";
import type { Database } from "@/lib/database.types";

const ONE_HOUR_MS = 60 * 60 * 1000;

type MatchResult =
	Database["public"]["Functions"]["match_messages"]["Returns"][0];

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

type ChainMessage = {
	content: string;
	created_at: string;
};

export interface SearchResult {
	id: string;
	content: string;
	context: string | null;
	channel_name: string | null;
	sender_name: string;
	created_at: string;
	chain_messages?: ChainMessage[];
	similarity: number;
}

export async function searchMessages(query: string): Promise<SearchResult[]> {
	console.log("\n[searchMessages] Starting search with query:", query);
	const supabase = await createClient();

	// Generate embedding for the search query
	console.log("[searchMessages] Generating query embedding...");
	const embeddings = await generateEmbeddings([query], "query");
	const queryEmbedding = embeddings[0];

	if (!queryEmbedding) {
		console.error("[searchMessages] Failed to generate query embedding");
		return [];
	}
	console.log(
		"[searchMessages] Generated embedding of length:",
		queryEmbedding.length,
	);

	// Search for similar messages
	console.log("[searchMessages] Calling match_messages RPC...");
	const { data: matchResults, error: matchError } = await supabase.rpc(
		"match_messages",
		{
			query_embedding: queryEmbedding,
			match_threshold: 0.5,
			match_count: 5,
		} as Database["public"]["Functions"]["match_messages"]["Args"],
	);

	if (matchError) {
		console.error("[searchMessages] Match error:", matchError);
		return [];
	}

	if (!matchResults || !Array.isArray(matchResults)) {
		console.log("[searchMessages] No results array returned");
		return [];
	}

	const matches = matchResults as MatchResult[];

	console.log("[searchMessages] RPC results:", {
		count: matches.length,
		results: matches.map((result) => ({
			id: result.id,
			similarity: result.similarity,
			hasContent: !!result.content,
			hasContext: !!result.context,
		})),
	});

	if (!matches.length) {
		console.log("[searchMessages] No matches found");
		return [];
	}

	// Get additional context for matches
	console.log("[searchMessages] Getting additional context for matches...");
	const { data: rawMessages, error: contextError } = await supabase
		.from("messages")
		.select(
			`
			id,
			content,
			context,
			channel_id,
			conversation_id,
			user_id,
			created_at,
			profiles:user_id (
				id,
				full_name,
				display_name
			),
			channels:channel_id (
				id,
				name
			)
		`,
		)
		.in(
			"id",
			matches.map((result) => result.id),
		);

	if (contextError) {
		console.error("[searchMessages] Context error:", contextError);
		return [];
	}

	if (!rawMessages) {
		console.log("[searchMessages] No messages found");
		return [];
	}

	// Type assertion for the raw messages
	const messages: (Omit<MessageWithProfile, "chain_messages"> & {
		chain_messages?: ChainMessage[];
	})[] = (rawMessages as RawDatabaseMessage[]).map((msg) => ({
		...msg,
		profiles: Array.isArray(msg.profiles) ? msg.profiles[0] : msg.profiles,
		channels: Array.isArray(msg.channels) ? msg.channels[0] : msg.channels,
	}));

	// For each message, get its chain messages
	for (const msg of messages) {
		const { data: chainMessages } = await supabase
			.from("messages")
			.select(
				`
				content,
				created_at
			`,
			)
			.eq(
				msg.channel_id ? "channel_id" : "conversation_id",
				msg.channel_id || msg.conversation_id,
			)
			.eq("user_id", msg.user_id)
			.gte(
				"created_at",
				new Date(
					new Date(msg.created_at).getTime() - ONE_HOUR_MS,
				).toISOString(),
			)
			.lte("created_at", msg.created_at)
			.order("created_at", { ascending: true });

		msg.chain_messages = chainMessages || [];
	}

	// Format results by combining match results with message context
	const searchResults = matches
		.map((match): SearchResult | null => {
			const msg = messages.find((m) => m.id === match.id);
			if (!msg) {
				console.log("[searchMessages] No context found for match:", match.id);
				return null;
			}
			return {
				id: match.id,
				content: match.content,
				context: match.context,
				channel_name: msg.channels?.name ?? null,
				sender_name:
					msg.profiles?.display_name || msg.profiles?.full_name || "Unknown",
				created_at: msg.created_at,
				chain_messages: msg.chain_messages,
				similarity: match.similarity,
			};
		})
		.filter((result): result is SearchResult => result !== null);

	console.log("[searchMessages] Final results:", {
		count: searchResults.length,
		results: searchResults.map((r) => ({
			id: r.id,
			similarity: r.similarity,
			hasContent: !!r.content,
			hasContext: !!r.context,
			hasChannel: !!r.channel_name,
			hasSender: r.sender_name !== "Unknown",
		})),
	});

	return searchResults;
}
