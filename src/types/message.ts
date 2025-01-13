import type { Database } from "@/lib/database.types";
import type { ProfileDisplay } from "./profile";

export type DatabaseFile = Database["public"]["Tables"]["files"]["Row"];
export type DatabaseMessage = Database["public"]["Tables"]["messages"]["Row"];

export interface Message extends Omit<DatabaseMessage, "files" | "profiles"> {
	profile: ProfileDisplay & {
		id: string;
	};
	reply_count: number;
	reply_user_ids: string[];
	files: DatabaseFile[];
}

export interface MessageGroup {
	userId: string;
	messages: Message[];
}

export interface MessagePayload {
	new: {
		id: string;
		reply_count: number;
	};
}

export interface MessageInsertPayload {
	new: {
		id: string;
		channel_id: string | null;
		conversation_id: string | null;
		parent_id: string | null;
		user_id: string;
		content: string;
	};
}
