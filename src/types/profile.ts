// Base profile type that matches the database schema
export interface Profile {
	id: string;
	created_at: string;
	email: string;
	full_name: string;
	display_name: string | null;
	avatar_url: string | null;
	avatar_color: string | null;
	avatar_cache: string | null;
	last_seen: string | null;
}

// Type for UI components that need profile display info
export interface ProfileDisplay {
	full_name: string;
	display_name: string | null;
	avatar_url: string | null;
	avatar_color?: string | null;
	avatar_cache: string | null;
}

// Type for UI components that need profile display info and ID
export interface ProfileWithId extends ProfileDisplay {
	id: string;
}

// Type specifically for the UserAvatar component
export interface UserAvatarProps {
	fullName: string | null;
	displayName?: string | null;
	avatarUrl?: string | null;
	avatarCache?: string | null;
	avatarColor?: string | null;
	className?: string;
	size?: "2xs" | "xs" | "sm" | "md" | "lg" | "xl";
}
