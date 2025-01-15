"use client";

import {
	createContext,
	useContext,
	useCallback,
	useState,
	useRef,
	useEffect,
} from "react";
import { createClient } from "@/utils/supabase/client";
import { logDB } from "@/utils/logging";
import type { ProfileWithId } from "@/types/profile";

type ProfileCache = Record<string, ProfileWithId>;

interface ProfileCacheContextType {
	getProfile: (userId: string) => Promise<ProfileWithId | null>;
	bulkCacheProfiles: (profiles: ProfileWithId[]) => void;
	getCachedProfile: (userId: string) => ProfileWithId | null;
}

const ProfileCacheContext = createContext<ProfileCacheContextType | null>(null);

// Initialize Supabase client outside component
const supabase = createClient();

export function ProfileCacheProvider({
	children,
}: {
	children: React.ReactNode;
}) {
	const [cache, setCache] = useState<ProfileCache>({});
	const renderCount = useRef(0);
	const getProfileCallCount = useRef(0);

	// Log every render
	useEffect(() => {
		renderCount.current++;
		console.log(`[ProfileCache] Render #${renderCount.current}`, {
			cacheSize: Object.keys(cache).length,
			cacheKeys: Object.keys(cache),
		});
	});

	const getCachedProfile = useCallback(
		(userId: string) => {
			console.log(
				`[ProfileCache] getCachedProfile called for userId=${userId}`,
				{
					cacheHit: !!cache[userId],
				},
			);
			return cache[userId] || null;
		},
		[cache],
	);

	const bulkCacheProfiles = useCallback((profiles: ProfileWithId[]) => {
		console.log(
			"[ProfileCache] bulkCacheProfiles called with " +
				profiles.length +
				" profiles",
			{
				profileIds: profiles.map((p) => p.id),
			},
		);

		// First check if we actually have any new profiles to add
		setCache((prev) => {
			const hasNewProfiles = profiles.some((p) => !prev[p.id]);
			if (!hasNewProfiles) {
				console.log(
					"[ProfileCache] bulkCacheProfiles - no new profiles to add, skipping update",
				);
				return prev;
			}

			const updates: ProfileCache = { ...prev };
			for (const profile of profiles) {
				if (profile?.id) {
					updates[profile.id] = profile;
				}
			}
			const added = profiles.filter((p) => !prev[p.id]).length;
			console.log("[ProfileCache] bulkCacheProfiles updating cache", {
				previousSize: Object.keys(prev).length,
				newSize: Object.keys(updates).length,
				added,
			});
			return updates;
		});
	}, []);

	const getProfile = useCallback(
		async (userId: string) => {
			getProfileCallCount.current++;
			const callId = getProfileCallCount.current;

			console.log(
				"[ProfileCache] getProfile(" + callId + ") called for userId=" + userId,
				{
					cacheState: cache,
					stackTrace: new Error().stack,
				},
			);

			// First check cache
			const cachedProfile = cache[userId];
			if (cachedProfile) {
				console.log(
					"[ProfileCache] getProfile(" +
						callId +
						") cache hit for userId=" +
						userId,
				);
				return cachedProfile;
			}

			console.log(
				"[ProfileCache] getProfile(" +
					callId +
					") cache miss for userId=" +
					userId +
					", fetching from DB",
			);

			// If not in cache, fetch from DB
			const { data: profile, error } = await supabase
				.from("profiles")
				.select("*")
				.eq("id", userId)
				.single();

			await logDB({
				operation: "SELECT",
				table: "profiles",
				description: "Loading profile for user " + userId,
				result: profile ? { id: profile.id } : null,
				error,
			});

			if (error || !profile) {
				console.error(
					"[ProfileCache] getProfile(" + callId + ") error fetching profile",
					{ error },
				);
				return null;
			}

			console.log(
				"[ProfileCache] getProfile(" +
					callId +
					") updating cache with fetched profile",
				{
					userId,
					profile,
				},
			);

			// Update cache with new profile
			setCache((prev) => {
				console.log("[ProfileCache] getProfile(" + callId + ") cache update", {
					prev,
					adding: profile,
				});
				return {
					...prev,
					[userId]: profile,
				};
			});

			return profile;
		},
		[cache],
	);

	return (
		<ProfileCacheContext.Provider
			value={{
				getProfile,
				bulkCacheProfiles,
				getCachedProfile,
			}}
		>
			{children}
		</ProfileCacheContext.Provider>
	);
}

export function useProfileCache() {
	const context = useContext(ProfileCacheContext);
	if (!context) {
		throw new Error(
			"useProfileCache must be used within a ProfileCacheProvider",
		);
	}
	return context;
}
