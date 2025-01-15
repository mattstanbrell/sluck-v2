import { createClient } from "@/utils/supabase/server";
import { Sidebar } from "@/components/workspace/Sidebar";
import { notFound } from "next/navigation";
import { logDB } from "@/utils/logging";

export default async function WorkspaceLayout({
	children,
	params,
}: {
	children: React.ReactNode;
	params: Promise<{ workspaceSlug: string }>;
}) {
	const { workspaceSlug } = await params;
	const supabase = await createClient();

	// Get workspace from slug
	const { data: workspace, error: workspaceError } = await supabase
		.from("workspaces")
		.select("id")
		.eq("slug", workspaceSlug)
		.single();

	logDB({
		operation: "SELECT",
		table: "workspaces",
		description: `Fetching workspace ID for layout (${workspaceSlug})`,
		result: workspace,
		error: workspaceError,
	});

	if (!workspace) {
		notFound();
	}

	return (
		<div className="flex h-screen">
			<Sidebar workspaceId={workspace.id} />
			<main className="flex-1 overflow-auto">{children}</main>
		</div>
	);
}
