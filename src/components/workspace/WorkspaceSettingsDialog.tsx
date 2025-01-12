"use client";

import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import { Settings, Copy, RefreshCw, Check } from "lucide-react";
import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/utils/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { generateWorkspaceInvite } from "@/app/actions/workspace";

interface WorkspaceInviteData {
	invite_code: string | null;
	invite_expires_at: string | null;
	invite_is_revoked: boolean;
}

export function WorkspaceSettingsDialog({
	workspaceId,
	workspaceSlug,
}: { workspaceId: string; workspaceSlug: string }) {
	const [open, setOpen] = useState(false);
	const [isLoading, setIsLoading] = useState(false);
	const [isLoadingInitial, setIsLoadingInitial] = useState(true);
	const [inviteData, setInviteData] = useState<WorkspaceInviteData | null>(
		null,
	);
	const [copyConfirm, setCopyConfirm] = useState(false);
	const supabase = createClient();
	const { toast } = useToast();

	const loadInviteData = useCallback(async () => {
		const { data, error } = await supabase
			.from("workspaces")
			.select("invite_code, invite_expires_at, invite_is_revoked")
			.eq("id", workspaceId)
			.single();

		if (error) {
			console.error("Failed to load invite data:", error);
			return;
		}

		setInviteData(data);
	}, [workspaceId, supabase]);

	// Load invite data when dialog opens
	useEffect(() => {
		if (open) {
			setIsLoadingInitial(true);
			loadInviteData().finally(() => setIsLoadingInitial(false));
		}
	}, [open, loadInviteData]);

	const generateInviteCode = async () => {
		setIsLoading(true);
		try {
			const data = await generateWorkspaceInvite(workspaceId);

			// Update the local state immediately
			setInviteData(data);
		} catch {
			toast({
				title: "Error",
				description: "Failed to generate invite code",
				variant: "destructive",
			});
		} finally {
			setIsLoading(false);
		}
	};

	const copyInviteLink = async () => {
		if (!inviteData?.invite_code) return;
		const inviteLink = `${window.location.origin}/join/${workspaceSlug}/${inviteData.invite_code}`;
		await navigator.clipboard.writeText(inviteLink);

		// Show check mark for 1 second
		setCopyConfirm(true);
		setTimeout(() => setCopyConfirm(false), 1000);
	};

	const isInviteValid =
		inviteData?.invite_code &&
		!inviteData?.invite_is_revoked &&
		(!inviteData?.invite_expires_at ||
			new Date(inviteData.invite_expires_at) > new Date());

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger asChild>
				<Button
					variant="ghost"
					size="icon"
					className="w-5 h-5 text-custom-text-secondary hover:text-custom-text hover:bg-custom-ui-faint"
				>
					<Settings className="w-3 h-3" />
				</Button>
			</DialogTrigger>
			<DialogContent className="sm:max-w-[600px] bg-custom-background border-custom-ui-medium [&>button]:right-6 [&>button]:top-6 [&>button]:opacity-70 [&>button]:text-custom-text-secondary hover:[&>button]:text-custom-text hover:[&>button]:bg-custom-ui-faint hover:[&>button]:opacity-100 hover:[&>button]:shadow-lg">
				<DialogHeader>
					<DialogTitle className="text-custom-text">
						Workspace Settings
					</DialogTitle>
				</DialogHeader>

				<div className="pt-2">
					<h3 className="text-sm font-medium text-custom-text mb-4">
						Invite Link
					</h3>

					{isLoadingInitial ? (
						<div className="h-[120px] flex items-center justify-center">
							<RefreshCw className="w-4 h-4 animate-spin text-custom-text-secondary" />
						</div>
					) : isInviteValid ? (
						<div className="space-y-6">
							<div className="group flex items-center justify-between p-2 bg-custom-background-secondary rounded-md border border-custom-ui-medium">
								<code className="text-sm text-custom-text-secondary">
									{window.location.origin}/join/{workspaceSlug}/
									<span className="text-custom-text">
										{inviteData.invite_code}
									</span>
								</code>
								<Button
									onClick={copyInviteLink}
									variant="ghost"
									size="sm"
									className={`text-custom-text-secondary hover:text-custom-text shrink-0 ml-2 transition-colors duration-200 ${
										copyConfirm ? "text-green-500 hover:text-green-600" : ""
									}`}
									title={copyConfirm ? "Copied!" : "Copy link"}
								>
									{copyConfirm ? (
										<Check className="w-4 h-4" />
									) : (
										<Copy className="w-4 h-4" />
									)}
								</Button>
							</div>
							<div className="flex items-end justify-between">
								{inviteData.invite_expires_at && (
									<p className="text-xs text-custom-text-secondary">
										Expires{" "}
										{new Date(
											inviteData.invite_expires_at,
										).toLocaleDateString()}
									</p>
								)}
								<Button
									onClick={generateInviteCode}
									variant="outline"
									className="border-custom-ui-medium hover:bg-custom-ui-faint text-custom-text"
									disabled={isLoading}
								>
									<RefreshCw
										className={`w-4 h-4 mr-2 ${isLoading ? "animate-spin" : ""}`}
									/>
									Regenerate
								</Button>
							</div>
						</div>
					) : (
						<div className="space-y-4">
							<p className="text-sm text-custom-text-secondary">
								No active invite link. Generate one to invite people to your
								workspace.
							</p>
							<Button
								onClick={generateInviteCode}
								className="bg-custom-accent text-white hover:bg-custom-accent/90"
								disabled={isLoading}
							>
								{isLoading ? (
									<>
										<RefreshCw className="w-4 h-4 mr-2 animate-spin" />
										Generating...
									</>
								) : (
									"Generate Invite Link"
								)}
							</Button>
						</div>
					)}
				</div>
			</DialogContent>
		</Dialog>
	);
}
