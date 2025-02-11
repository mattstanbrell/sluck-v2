import { createClient } from "@/utils/supabase/server";
import { redirect } from "next/navigation";

interface WorkspacePageProps {
	params: Promise<{ workspaceSlug: string }>;
}

export default async function WorkspacePage({ params }: WorkspacePageProps) {
	const { workspaceSlug } = await params;
	const supabase = await createClient();
	const {
		data: { user },
	} = await supabase.auth.getUser();

	// Middleware will handle auth redirect, but we still need the user ID
	if (!user) {
		redirect("/");
	}

	// Check if user is a member of this workspace by slug
	const { data: memberData, error: memberError } = await supabase
		.from("workspace_members")
		.select(`
			workspace_id,
			workspaces!inner(
				slug
			)
		`)
		.eq("workspaces.slug", workspaceSlug)
		.eq("user_id", user.id)
		.maybeSingle();

	if (memberError) {
		console.error("Membership check error:", memberError);
		redirect("/");
	}

	// If no row returned, user is NOT a member
	if (!memberData) {
		redirect("/");
	}

	// If we get here, the user is authorized - redirect to general channel
	redirect(`/workspace/${workspaceSlug}/channel/general`);
}
