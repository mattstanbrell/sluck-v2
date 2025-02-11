import type { Database } from "@/lib/database.types";
import type { ProfileDisplay } from "./profile";

// Base type that matches the database schema
export type DatabaseConversation =
	Database["public"]["Tables"]["conversations"]["Row"];

// Type for conversation with participant info
export interface ConversationParticipant {
	user_id: string;
	profiles: ProfileDisplay;
}

// Type for API responses that include all participants
export interface ConversationWithParticipants {
	id: string;
	conversation_participants: ConversationParticipant[];
}

// Type for UI display with single participant (for DMs)
export interface ConversationWithParticipant {
	id: string;
	participant: ConversationParticipant;
}
