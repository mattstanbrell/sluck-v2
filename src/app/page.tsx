import { createClient } from "@/utils/supabase/server";
import { redirect } from "next/navigation";
import { CreateWorkspaceDialog } from "@/components/workspace/CreateWorkspaceDialog";
import { JoinWorkspaceForm } from "@/components/workspace/JoinWorkspaceForm";
import type { WorkspaceMember } from "@/types/workspace";

type WorkspaceMemberWithSlug = WorkspaceMember & {
	workspaces: {
		slug: string;
	};
};

export default async function Home() {
	const supabase = await createClient();
	const {
		data: { user },
		error,
	} = await supabase.auth.getUser();

	if (error || !user) {
		redirect("/auth");
	}

	// Check if user is in any workspaces
	const { data: workspaceMemberships } = (await supabase
		.from("workspace_members")
		.select("workspace_id, joined_at, workspaces(slug)")
		.eq("user_id", user.id)
		.order("joined_at", { ascending: true })
		.limit(1)) as { data: WorkspaceMemberWithSlug[] | null };

	// If user is in at least one workspace, redirect to their first workspace
	if (
		workspaceMemberships &&
		workspaceMemberships.length > 0 &&
		workspaceMemberships[0].workspaces
	) {
		redirect(`/workspace/${workspaceMemberships[0].workspaces.slug}`);
	}

	return (
		<main className="min-h-screen flex flex-col items-center justify-center">
			<div className="max-w-md w-full px-4">
				<div className="text-center mb-8">
					<h1 className="text-4xl font-bold mb-2 text-custom-text">
						Welcome to Sluck
					</h1>
					<p className="text-custom-text-secondary">
						Get started by creating a workspace or joining an existing one.
					</p>
				</div>

				<div className="space-y-8">
					{/* Create Workspace Section */}
					<div className="bg-custom-background-secondary p-6 rounded-lg border border-custom-ui-medium">
						<h2 className="text-xl font-semibold mb-4 text-custom-text">
							Create a Workspace
						</h2>
						<p className="text-custom-text-secondary mb-4">
							Start fresh with a new workspace for your team.
						</p>
						<CreateWorkspaceDialog />
					</div>

					{/* Join Workspace Section */}
					<div className="bg-custom-background-secondary p-6 rounded-lg border border-custom-ui-medium">
						<h2 className="text-xl font-semibold mb-4 text-custom-text">
							Join a Workspace
						</h2>
						<p className="text-custom-text-secondary mb-4">
							Have an invite code? Enter it below to join an existing workspace.
						</p>
						<JoinWorkspaceForm />
					</div>
				</div>
			</div>
		</main>
	);
}
