"use server";

import { createClient } from "@/utils/supabase/server";
import { revalidatePath } from "next/cache";
import { logDB } from "@/utils/logging";

export async function createWorkspace(name: string) {
	const supabase = await createClient();

	// Get the current user
	const {
		data: { user },
		error: userError,
	} = await supabase.auth.getUser();
	if (userError || !user) {
		throw new Error("Unauthorized");
	}

	// Start with workspace creation
	const { data: workspace, error: workspaceError } = await supabase
		.from("workspaces")
		.insert({
			name,
			created_by: user.id,
		})
		.select()
		.single();

	logDB({
		operation: "INSERT",
		table: "workspaces",
		description: "Creating new workspace",
		result: workspace,
		error: workspaceError,
	});

	if (workspaceError) {
		throw new Error(workspaceError.message);
	}

	revalidatePath("/");
	return workspace;
}

export async function generateWorkspaceInvite(workspaceId: string) {
	const supabase = await createClient();

	// Get the current user
	const {
		data: { user },
		error: userError,
	} = await supabase.auth.getUser();
	if (userError || !user) {
		throw new Error("Unauthorized");
	}

	// Generate a random code
	const code = Math.random().toString(36).substring(2, 10).toUpperCase();

	// Set expiration to 7 days from now
	const expiresAt = new Date();
	expiresAt.setDate(expiresAt.getDate() + 7);

	// Update the workspace - RLS policy will handle permission check
	const { data, error } = await supabase
		.from("workspaces")
		.update({
			invite_code: code,
			invite_expires_at: expiresAt.toISOString(),
			invite_is_revoked: false,
		})
		.eq("id", workspaceId)
		.select(
			"id, name, slug, description, invite_code, invite_expires_at, invite_is_revoked",
		)
		.single();

	logDB({
		operation: "UPDATE",
		table: "workspaces",
		description: "Generating workspace invite code",
		result: data,
		error: error,
	});

	if (error) {
		throw new Error("Failed to generate invite code");
	}

	return data;
}

export async function joinWorkspaceWithCode(inviteCode: string) {
	const supabase = await createClient();

	// Get the current user
	const {
		data: { user },
		error: userError,
	} = await supabase.auth.getUser();
	if (userError || !user) {
		throw new Error("Unauthorized");
	}

	// Call the database function to join the workspace
	const { data, error } = await supabase.rpc("join_workspace_with_code", {
		_invite_code: inviteCode,
	});

	logDB({
		operation: "INSERT",
		table: "workspace_members",
		description: "Joining workspace with invite code",
		result: data,
		error: error,
	});

	if (error) {
		throw new Error(error.message);
	}

	return data;
}
