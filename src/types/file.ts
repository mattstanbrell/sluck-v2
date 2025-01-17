import type { Database } from "@/lib/database.types";
import type { ProfileDisplay } from "./profile";

// Base type that matches the database schema
export type DatabaseFile = Database["public"]["Tables"]["files"]["Row"] & {
	caption?: string | null;
	description?: string | null;
	embedding?: number[] | null;
};

// Type for file with associated message and profile info
export interface FileWithMessage {
	id: string;
	message_id: string;
	file_name: string;
	file_type: string;
	file_size: number;
	file_url: string;
	created_at: string;
	message: {
		profile: Pick<ProfileDisplay, "full_name" | "display_name">;
	};
}

// Type for file upload payload
export interface FileUploadPayload {
	file_name: string;
	file_type: string;
	file_size: number;
	file_url: string;
}

// Helper type for file type categories
export type FileCategory = "image" | "video" | "audio" | "text" | "other";

// Helper function to get file category
export function getFileCategory(fileType: string): FileCategory {
	if (fileType.startsWith("image/")) return "image";
	if (fileType.startsWith("video/")) return "video";
	if (fileType.startsWith("audio/")) return "audio";
	if (fileType.startsWith("text/")) return "text";
	return "other";
}
