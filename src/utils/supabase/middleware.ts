import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { logDB } from "@/utils/logging";

export async function updateSession(request: NextRequest) {
	let supabaseResponse = NextResponse.next({
		request,
	});

	const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
	const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

	if (!supabaseUrl || !supabaseAnonKey) {
		throw new Error("Missing Supabase environment variables");
	}

	const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
		cookies: {
			getAll() {
				return request.cookies.getAll();
			},
			setAll(cookiesToSet) {
				for (const { name, value } of cookiesToSet) {
					request.cookies.set(name, value);
				}
				supabaseResponse = NextResponse.next({
					request,
				});
				for (const { name, value } of cookiesToSet) {
					supabaseResponse.cookies.set(name, value);
				}
			},
		},
	});

	const {
		data: { user },
		error: authError,
	} = await supabase.auth.getUser();

	await logDB({
		operation: "SELECT",
		table: "auth.users",
		description: `Middleware auth check for ${request.nextUrl.pathname}`,
		result: user ? { id: user.id } : null,
		error: authError,
	});

	if (!user && !request.nextUrl.pathname.startsWith("/auth")) {
		const redirectUrl = new URL("/auth", request.url);
		await logDB({
			operation: "DELETE",
			table: "auth.sessions",
			description: `Redirecting unauthenticated user from ${request.nextUrl.pathname} to /auth`,
			result: { from: request.nextUrl.pathname, to: "/auth" },
			error: null,
		});
		return NextResponse.redirect(redirectUrl);
	}

	return supabaseResponse;
}
