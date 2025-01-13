import type { Database } from "@/lib/database.types";
import type { ProfileDisplay } from "./profile";

// Base type that matches the database schema
export type DatabaseChannel = Database["public"]["Tables"]["channels"]["Row"];

// Type for channel member info
export interface ChannelMember {
	channel_id: string;
	user_id: string;
	role: "admin" | "member";
	joined_at: string;
	last_read_at: string | null;
}

// Type for channel with basic info (used in sidebar)
export interface ChannelBasic {
	id: string;
	name: string;
	slug: string;
	description?: string | null;
}

// Type for channel with member info
export interface ChannelWithMembers extends ChannelBasic {
	members: {
		user_id: string;
		role: "admin" | "member";
		profile: ProfileDisplay;
	}[];
}
