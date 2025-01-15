import type { Profile, ProfileDisplay } from "@/types/profile";
import { logDB } from "@/utils/logging";

class ProfileCache {
	private static instance: ProfileCache;
	private cache: Map<string, Profile>;
	private fetchPromises: Map<string, Promise<Profile | null>>;

	private constructor() {
		this.cache = new Map();
		this.fetchPromises = new Map();
	}

	public static getInstance(): ProfileCache {
		if (!ProfileCache.instance) {
			ProfileCache.instance = new ProfileCache();
		}
		return ProfileCache.instance;
	}

	public async getProfile(userId: string): Promise<Profile | null> {
		// Check cache first
		const cachedProfile = this.cache.get(userId);
		if (cachedProfile) {
			return cachedProfile;
		}

		// Check if there's an ongoing fetch for this userId
		const existingPromise = this.fetchPromises.get(userId);
		if (existingPromise) {
			return existingPromise;
		}

		// Create new fetch promise
		const fetchPromise = this.fetchProfileFromDB(userId);
		this.fetchPromises.set(userId, fetchPromise);

		try {
			const profile = await fetchPromise;
			if (profile) {
				this.cache.set(userId, profile);
			}
			return profile;
		} finally {
			this.fetchPromises.delete(userId);
		}
	}

	public async getProfiles(userIds: string[]): Promise<Map<string, Profile>> {
		const result = new Map<string, Profile>();
		const missingIds = new Set<string>();

		// Check cache first
		for (const userId of userIds) {
			const cachedProfile = this.cache.get(userId);
			if (cachedProfile) {
				result.set(userId, cachedProfile);
			} else {
				missingIds.add(userId);
			}
		}

		if (missingIds.size > 0) {
			const profiles = await this.fetchProfilesFromDB(Array.from(missingIds));
			for (const profile of profiles) {
				this.cache.set(profile.id, profile);
				result.set(profile.id, profile);
			}
		}

		return result;
	}

	public updateProfile(userId: string, profile: Profile): void {
		this.cache.set(userId, profile);
	}

	public clearCache(): void {
		this.cache.clear();
		this.fetchPromises.clear();
	}

	private async fetchProfileFromDB(userId: string): Promise<Profile | null> {
		const { createClient } = await import("@/utils/supabase/client");
		const supabase = createClient();

		const { data, error } = await supabase
			.from("profiles")
			.select("*")
			.eq("id", userId)
			.single();

		logDB({
			operation: "SELECT",
			table: "profiles",
			description: `Fetching single profile for user ${userId}`,
			result: data,
			error: error,
		});

		if (error || !data) {
			return null;
		}

		return data;
	}

	private async fetchProfilesFromDB(userIds: string[]): Promise<Profile[]> {
		const { createClient } = await import("@/utils/supabase/client");
		const supabase = createClient();

		const { data, error } = await supabase
			.from("profiles")
			.select("*")
			.in("id", userIds);

		logDB({
			operation: "SELECT",
			table: "profiles",
			description: `Fetching multiple profiles for ${userIds.length} users`,
			result: data,
			error: error,
		});

		if (error || !data) {
			return [];
		}

		return data;
	}
}

export const profileCache = ProfileCache.getInstance();
