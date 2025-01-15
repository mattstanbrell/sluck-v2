import type { PostgrestError } from "@supabase/supabase-js";
import type { AuthError } from "@supabase/supabase-js";

export type DBOperation = "SELECT" | "INSERT" | "UPDATE" | "DELETE" | "UPSERT";

export interface DBLogContext {
	operation: DBOperation;
	table: string;
	description: string;
	result?: unknown;
	error?: PostgrestError | AuthError | null;
}

export function logDB({
	operation,
	table,
	description,
	result,
	error,
}: DBLogContext) {
	const timestamp = new Date().toISOString();
	const status = error ? "ERROR" : "SUCCESS";

	console.log(`[DB:${status}] ${timestamp} - ${operation} on ${table}`);
	console.log(`Description: ${description}`);

	if (error) {
		console.error("Error:", error);
	} else if (result) {
		// For arrays, log the length and first item as sample
		if (Array.isArray(result)) {
			console.log(`Results: ${result.length} items`);
			if (result.length > 0) {
				console.log("Sample:", result[0]);
			}
		} else {
			console.log("Result:", result);
		}
	}

	console.log("-------------------");
}
