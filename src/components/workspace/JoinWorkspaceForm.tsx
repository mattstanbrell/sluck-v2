"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/hooks/use-toast";
import { joinWorkspaceWithCode } from "@/app/actions/workspace";

export function JoinWorkspaceForm() {
	const [inviteInput, setInviteInput] = useState("");
	const [isLoading, setIsLoading] = useState(false);
	const router = useRouter();
	const { toast } = useToast();

	const parseInviteInput = (input: string) => {
		// Try to parse as URL first
		try {
			const url = new URL(input);
			const pathParts = url.pathname.split("/");
			// Find /join/[workspaceSlug]/[inviteCode] pattern
			const joinIndex = pathParts.findIndex((part) => part === "join");
			if (joinIndex !== -1 && pathParts.length >= joinIndex + 3) {
				return pathParts[joinIndex + 2]; // Return just the invite code
			}
		} catch {
			// Not a URL, treat as invite code
		}

		// If not a URL or invalid URL format, treat as raw invite code
		return input.trim();
	};

	const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
		e.preventDefault();
		if (!inviteInput.trim()) {
			toast({
				title: "Error",
				description: "Please enter an invite code or link",
				variant: "destructive",
			});
			return;
		}

		setIsLoading(true);
		try {
			const inviteCode = parseInviteInput(inviteInput);
			const { slug } = await joinWorkspaceWithCode(inviteCode);

			toast({
				title: "Success",
				description: "You've joined the workspace",
			});

			router.push(`/workspace/${slug}/channel/general`);
		} catch (error) {
			toast({
				title: "Error",
				description:
					error instanceof Error ? error.message : "Failed to join workspace",
				variant: "destructive",
			});
		} finally {
			setIsLoading(false);
		}
	};

	return (
		<form className="flex gap-2" onSubmit={handleSubmit}>
			<Input
				placeholder="Enter invite code or link"
				className="bg-custom-ui-faint border-custom-ui-medium"
				value={inviteInput}
				onChange={(e) => setInviteInput(e.target.value)}
				disabled={isLoading}
			/>
			<Button
				type="submit"
				className="bg-custom-accent text-white hover:bg-custom-accent/90 whitespace-nowrap"
				disabled={isLoading}
			>
				{isLoading ? "Joining..." : "Join Workspace"}
			</Button>
		</form>
	);
}
