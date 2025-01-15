"use server";

import { createClient } from "@/utils/supabase/server";
import { revalidatePath } from "next/cache";
import { logDB } from "@/utils/logging";

export async function createChannel(
	workspaceId: string,
	name: string,
	description?: string,
) {
	const supabase = await createClient();

	// Get current user
	const {
		data: { user },
		error: userError,
	} = await supabase.auth.getUser();
	if (userError || !user) {
		throw new Error("Unauthorized");
	}

	// Verify user is a member of the workspace
	const { data: membership, error: membershipError } = await supabase
		.from("workspace_members")
		.select()
		.eq("workspace_id", workspaceId)
		.eq("user_id", user.id)
		.single();

	logDB({
		operation: "SELECT",
		table: "workspace_members",
		description: "Verifying workspace membership",
		result: membership,
		error: membershipError,
	});

	if (membershipError || !membership) {
		throw new Error("You must be a member of the workspace to create channels");
	}

	// Create the channel
	const { data: channel, error: channelError } = await supabase
		.from("channels")
		.insert({
			workspace_id: workspaceId,
			name,
			description,
			created_by: user.id,
		})
		.select()
		.single();

	logDB({
		operation: "INSERT",
		table: "channels",
		description: "Creating new channel",
		result: channel,
		error: channelError,
	});

	if (channelError) {
		if (channelError.code === "23505") {
			throw new Error("A channel with this name already exists");
		}
		throw new Error("Failed to create channel");
	}

	// Add creator as channel member with admin role
	const { error: memberError } = await supabase.from("channel_members").insert({
		channel_id: channel.id,
		user_id: user.id,
		role: "admin",
	});

	logDB({
		operation: "INSERT",
		table: "channel_members",
		description: "Adding creator as channel admin",
		error: memberError,
	});

	if (memberError) {
		throw new Error("Failed to add you as channel member");
	}

	// Get workspace slug for revalidation
	const { data: workspace, error: workspaceError } = await supabase
		.from("workspaces")
		.select("slug")
		.eq("id", workspaceId)
		.single();

	logDB({
		operation: "SELECT",
		table: "workspaces",
		description: "Getting workspace slug for revalidation",
		result: workspace,
		error: workspaceError,
	});

	if (workspace) {
		revalidatePath(`/workspace/${workspace.slug}`);
	}

	return channel;
}
