export type Json =
	| string
	| number
	| boolean
	| null
	| { [key: string]: Json | undefined }
	| Json[];

export interface Database {
	public: {
		Tables: {
			messages: {
				Row: {
					id: string;
					content: string;
					created_at: string;
					user_id: string;
					channel_id: string | null;
					conversation_id: string | null;
					parent_id: string | null;
					embedding: number[] | null;
				};
				Insert: {
					id?: string;
					content: string;
					created_at?: string;
					user_id: string;
					channel_id?: string | null;
					conversation_id?: string | null;
					parent_id?: string | null;
					embedding?: number[] | null;
				};
				Update: {
					id?: string;
					content?: string;
					created_at?: string;
					user_id?: string;
					channel_id?: string | null;
					conversation_id?: string | null;
					parent_id?: string | null;
					embedding?: number[] | null;
				};
			};
			channels: {
				Row: {
					id: string;
					name: string;
					description: string | null;
					workspace_id: string;
					created_at: string;
					created_by: string;
				};
			};
			profiles: {
				Row: {
					id: string;
					full_name: string;
					display_name: string | null;
					avatar_url: string | null;
					avatar_cache: string | null;
				};
			};
		};
		Functions: {
			match_messages: {
				Args: {
					query_embedding: number[];
					match_threshold: number;
					match_count: number;
				};
				Returns: {
					id: string;
					content: string;
					similarity: number;
				}[];
			};
		};
	};
}
