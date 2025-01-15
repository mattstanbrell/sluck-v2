"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/utils/supabase/client";
import { useRouter, useParams } from "next/navigation";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { joinWorkspaceWithCode } from "@/app/actions/workspace";
import type { WorkspaceBasic } from "@/types/workspace";

export default function JoinWorkspacePage() {
	const params = useParams();
	const workspaceSlug = params.workspaceSlug as string;
	const inviteCode = params.inviteCode as string;
	const [isLoading, setIsLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [workspace, setWorkspace] = useState<WorkspaceBasic | null>(null);
	const supabase = createClient();
	const router = useRouter();
	const { toast } = useToast();

	useEffect(() => {
		async function validateInvite() {
			try {
				// Check if user is authenticated
				const {
					data: { user },
				} = await supabase.auth.getUser();
				if (!user) {
					// Save the invite URL to localStorage and redirect to auth
					localStorage.setItem("inviteRedirect", window.location.pathname);
					router.push("/auth");
					return;
				}

				// Just get the workspace name - the function will handle validation
				const { data: workspace, error: workspaceError } = await supabase
					.from("workspaces")
					.select("id, name, slug, description")
					.eq("slug", workspaceSlug)
					.single();

				if (workspaceError || !workspace) {
					setError("Workspace not found");
					setIsLoading(false);
					return;
				}

				// Check if user is already a member
				const { data: membership } = await supabase
					.from("workspace_members")
					.select("user_id")
					.eq("workspace_id", workspace.id)
					.eq("user_id", user.id)
					.single();

				if (membership) {
					router.push(`/workspace/${workspaceSlug}`);
					return;
				}

				setWorkspace(workspace);
				setIsLoading(false);
			} catch {
				setError("An unexpected error occurred");
				setIsLoading(false);
			}
		}

		validateInvite();
	}, [workspaceSlug, supabase, router]);

	const handleJoin = async () => {
		try {
			setIsLoading(true);
			const { slug } = await joinWorkspaceWithCode(inviteCode);

			toast({
				title: "Success",
				description: "You've joined the workspace",
			});

			router.push(`/workspace/${slug}`);
		} catch (error) {
			toast({
				title: "Error",
				description:
					error instanceof Error ? error.message : "Failed to join workspace",
				variant: "destructive",
			});
			setIsLoading(false);
		}
	};

	if (isLoading) {
		return (
			<div className="flex min-h-screen items-center justify-center bg-custom-background">
				<p className="text-custom-text">Loading...</p>
			</div>
		);
	}

	if (error) {
		return (
			<div className="flex min-h-screen items-center justify-center bg-custom-background">
				<div className="text-center space-y-4">
					<p className="text-custom-text-secondary">{error}</p>
					<Button
						onClick={() => router.push("/")}
						className="bg-custom-accent text-white hover:bg-custom-accent/90"
					>
						Return Home
					</Button>
				</div>
			</div>
		);
	}

	return (
		<div className="flex min-h-screen items-center justify-center bg-custom-background">
			<div className="text-center space-y-4">
				<h1 className="text-2xl font-semibold text-custom-text">
					Join {workspace?.name}
				</h1>
				<p className="text-custom-text-secondary">
					You&apos;ve been invited to join this workspace
				</p>
				<Button
					onClick={handleJoin}
					disabled={isLoading}
					className="bg-custom-accent text-white hover:bg-custom-accent/90"
				>
					{isLoading ? "Joining..." : "Join Workspace"}
				</Button>
			</div>
		</div>
	);
}
