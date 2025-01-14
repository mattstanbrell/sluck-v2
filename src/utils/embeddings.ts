import { VoyageAIClient } from "voyageai";
import type { EmbedResponse } from "voyageai/api/types";

export async function generateEmbeddings(
	inputs: string[],
	input_type?: "query" | "document",
): Promise<number[][]> {
	if (!process.env.VOYAGE_API_KEY) {
		throw new Error("VOYAGE_API_KEY environment variable is not set");
	}

	try {
		const client = new VoyageAIClient({ apiKey: process.env.VOYAGE_API_KEY });
		const result: EmbedResponse = await client.embed({
			input: inputs,
			model: "voyage-3-large",
			inputType: input_type,
		});

		if (!result.data?.length) {
			throw new Error("No embeddings returned");
		}

		return result.data.map((d) => d.embedding as number[]);
	} catch (error) {
		console.error("Error generating embeddings:", error);
		throw new Error("Failed to generate embeddings");
	}
}
