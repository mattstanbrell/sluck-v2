import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { Vibrant } from "node-vibrant/node";
import { logDB } from "@/utils/logging";

export async function GET(request: Request) {
	const requestUrl = new URL(request.url);
	const code = requestUrl.searchParams.get("code");

	// If no code, redirect to homepage
	if (!code) {
		return NextResponse.redirect(new URL("/", request.url));
	}

	// Create Supabase client and exchange code for session
	const supabase = await createClient();
	const { error: sessionError } =
		await supabase.auth.exchangeCodeForSession(code);

	// If session exchange failed, redirect to homepage
	if (sessionError) {
		return NextResponse.redirect(new URL("/", request.url));
	}

	// Get the authenticated user
	const {
		data: { user },
	} = await supabase.auth.getUser();

	// If no user, redirect to homepage
	if (!user) {
		return NextResponse.redirect(new URL("/", request.url));
	}

	// Extract avatar URL from user metadata and process color
	const { id } = user;
	const avatar_url = user.user_metadata.avatar_url as string;

	if (avatar_url) {
		try {
			const response = await fetch(avatar_url);

			// If fetch failed, throw error to skip avatar processing
			if (!response.ok) {
				throw new Error(`Failed to fetch avatar: ${response.statusText}`);
			}

			const arrayBuffer = await response.arrayBuffer();
			const buffer = Buffer.from(arrayBuffer);

			// Get color from avatar
			const palette = await Vibrant.from(buffer).getPalette();
			const avatarColor = palette.Vibrant?.hex ?? "#999999";

			// Convert image to base64
			const base64Image = buffer.toString("base64");

			// Update profile with avatar data - if this fails, we'll still continue with auth
			const { error: updateError } = await supabase
				.from("profiles")
				.update({
					avatar_color: avatarColor,
					avatar_cache: base64Image,
				})
				.eq("id", id);

			logDB({
				operation: "UPDATE",
				table: "profiles",
				description: "Updating user profile with avatar data",
				error: updateError,
			});
		} catch (err: unknown) {
			// Log error but continue with auth flow
			console.error("Failed to process avatar - continuing with auth", err);
		}
	}

	// Always redirect to homepage, regardless of avatar processing success
	return NextResponse.redirect(new URL("/", request.url));
}
