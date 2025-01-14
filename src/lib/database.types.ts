import type { Profile } from "@/types/profile";

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
			files: {
				Row: {
					id: string;
					message_id: string;
					file_name: string;
					file_type: string;
					file_size: number;
					file_url: string;
					created_at: string;
				};
				Insert: {
					id?: string;
					message_id: string;
					file_name: string;
					file_type: string;
					file_size: number;
					file_url: string;
					created_at?: string;
				};
				Update: {
					id?: string;
					message_id?: string;
					file_name?: string;
					file_type?: string;
					file_size?: number;
					file_url?: string;
					created_at?: string;
				};
			};
			channels: {
				Row: {
					id: string;
					workspace_id: string;
					name: string;
					slug: string;
					description: string | null;
					created_by: string | null;
					created_at: string;
				};
				Insert: {
					id?: string;
					workspace_id: string;
					name: string;
					slug?: string;
					description?: string | null;
					created_by?: string | null;
					created_at?: string;
				};
				Update: {
					id?: string;
					workspace_id?: string;
					name?: string;
					slug?: string;
					description?: string | null;
					created_by?: string | null;
					created_at?: string;
				};
			};
			channel_members: {
				Row: {
					channel_id: string;
					user_id: string;
					role: "admin" | "member";
					joined_at: string;
					last_read_at: string | null;
				};
				Insert: {
					channel_id: string;
					user_id: string;
					role?: "admin" | "member";
					joined_at?: string;
					last_read_at?: string | null;
				};
				Update: {
					channel_id?: string;
					user_id?: string;
					role?: "admin" | "member";
					joined_at?: string;
					last_read_at?: string | null;
				};
			};
			conversations: {
				Row: {
					id: string;
					workspace_id: string;
					type: "direct" | "group";
					created_at: string;
				};
				Insert: {
					id?: string;
					workspace_id: string;
					type?: "direct" | "group";
					created_at?: string;
				};
				Update: {
					id?: string;
					workspace_id?: string;
					type?: "direct" | "group";
					created_at?: string;
				};
			};
			workspaces: {
				Row: {
					id: string;
					name: string;
					slug: string;
					description: string | null;
					created_by: string | null;
					created_at: string;
					invite_code: string | null;
					invite_expires_at: string | null;
					invite_is_revoked: boolean;
				};
				Insert: {
					id?: string;
					name: string;
					slug?: string;
					description?: string | null;
					created_by?: string | null;
					created_at?: string;
					invite_code?: string | null;
					invite_expires_at?: string | null;
					invite_is_revoked?: boolean;
				};
				Update: {
					id?: string;
					name?: string;
					slug?: string;
					description?: string | null;
					created_by?: string | null;
					created_at?: string;
					invite_code?: string | null;
					invite_expires_at?: string | null;
					invite_is_revoked?: boolean;
				};
			};
			workspace_members: {
				Row: {
					workspace_id: string;
					user_id: string;
					role: "owner" | "admin" | "member";
					joined_at: string;
				};
				Insert: {
					workspace_id: string;
					user_id: string;
					role?: "owner" | "admin" | "member";
					joined_at?: string;
				};
				Update: {
					workspace_id?: string;
					user_id?: string;
					role?: "owner" | "admin" | "member";
					joined_at?: string;
				};
			};
			profiles: {
				Row: Profile;
				Insert: Omit<Profile, "created_at"> & { created_at?: string };
				Update: Partial<Profile>;
			};
			messages: {
				Row: {
					id: string;
					conversation_id: string | null;
					channel_id: string | null;
					user_id: string;
					content: string;
					created_at: string;
					parent_id: string | null;
					profiles?: {
						id: string;
						full_name: string;
						display_name: string | null;
						avatar_url: string | null;
					};
					files?: Database["public"]["Tables"]["files"]["Row"][];
				};
				Insert: {
					id?: string;
					conversation_id?: string | null;
					channel_id?: string | null;
					user_id?: string;
					content: string;
					created_at?: string;
					parent_id?: string | null;
				};
				Update: {
					id?: string;
					conversation_id?: string | null;
					channel_id?: string | null;
					user_id?: string;
					content?: string;
					created_at?: string;
					parent_id?: string | null;
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
