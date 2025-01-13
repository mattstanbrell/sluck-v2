import type { Database } from "@/lib/database.types";
import type { ProfileDisplay } from "./profile";

// Base type that matches the database schema
export type DatabaseWorkspace =
	Database["public"]["Tables"]["workspaces"]["Row"];

// Type for workspace member info
export interface WorkspaceMember {
	workspace_id: string;
	user_id: string;
	role: "owner" | "admin" | "member";
	joined_at: string;
}

// Type for basic workspace info (used in sidebar)
export interface WorkspaceBasic {
	id: string;
	name: string;
	slug: string;
	description: string | null;
}

// Type for workspace with invite info
export interface WorkspaceWithInvite extends WorkspaceBasic {
	invite_code: string | null;
	invite_expires_at: string | null;
	invite_is_revoked: boolean;
}

// Type for workspace with member info
export interface WorkspaceWithMembers extends WorkspaceBasic {
	members: {
		user_id: string;
		role: "owner" | "admin" | "member";
		profile: ProfileDisplay;
	}[];
}
