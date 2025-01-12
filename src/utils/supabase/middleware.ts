import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

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
	} = await supabase.auth.getUser();

	if (!user && !request.nextUrl.pathname.startsWith("/auth")) {
		const redirectUrl = new URL("/auth", request.url);
		return NextResponse.redirect(redirectUrl);
	}

	return supabaseResponse;
}
