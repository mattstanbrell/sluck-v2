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
			profiles: {
				Row: {
					id: string;
					created_at: string;
					email: string;
					full_name: string;
					display_name: string | null;
					avatar_url: string | null;
					last_seen: string | null;
				};
				Insert: {
					id: string;
					created_at?: string;
					email: string;
					full_name: string;
					display_name?: string | null;
					avatar_url?: string | null;
					last_seen?: string | null;
				};
				Update: {
					id?: string;
					created_at?: string;
					email?: string;
					full_name?: string;
					display_name?: string | null;
					avatar_url?: string | null;
					last_seen?: string | null;
				};
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
					thread_participant: boolean | null;
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
					thread_participant?: boolean | null;
				};
				Update: {
					id?: string;
					conversation_id?: string | null;
					channel_id?: string | null;
					user_id?: string;
					content?: string;
					created_at?: string;
					parent_id?: string | null;
					thread_participant?: boolean | null;
				};
			};
		};
	};
}
