"use client";

import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useState } from "react";
import { createChannel } from "@/app/actions/channel";
import { useToast } from "@/hooks/use-toast";
import { useRouter } from "next/navigation";

interface CreateChannelDialogProps {
	workspaceId: string;
	workspaceSlug: string;
	trigger?: React.ReactNode;
}

export function CreateChannelDialog({
	workspaceId,
	workspaceSlug,
	trigger,
}: CreateChannelDialogProps) {
	const [channelName, setChannelName] = useState("");
	const [description, setDescription] = useState("");
	const [isLoading, setIsLoading] = useState(false);
	const [open, setOpen] = useState(false);
	const { toast } = useToast();
	const router = useRouter();

	const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
		e.preventDefault();
		if (!channelName.trim()) {
			toast({
				title: "Error",
				description: "Channel name is required",
				variant: "destructive",
			});
			return;
		}

		setIsLoading(true);
		try {
			const newChannel = await createChannel(
				workspaceId,
				channelName,
				description,
			);
			setOpen(false);
			setChannelName("");
			setDescription("");
			// Redirect to the new channel
			router.push(`/workspace/${workspaceSlug}/channel/${newChannel.slug}`);
		} catch (error: unknown) {
			toast({
				title: "Error",
				description:
					error instanceof Error ? error.message : "Failed to create channel",
				variant: "destructive",
			});
		} finally {
			setIsLoading(false);
		}
	};

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger asChild>
				{trigger || (
					<Button
						variant="ghost"
						size="icon"
						className="w-4 h-4 text-custom-text-secondary hover:text-custom-text hover:bg-custom-ui-faint"
					>
						<span className="text-xs">+</span>
					</Button>
				)}
			</DialogTrigger>
			<DialogContent className="sm:max-w-[425px] bg-custom-background border-custom-ui-medium">
				<DialogHeader>
					<DialogTitle className="text-custom-text">
						Create a channel
					</DialogTitle>
					<DialogDescription className="text-custom-text-secondary">
						Channels are where your team communicates. They&apos;re best when
						organized around a topic.
					</DialogDescription>
				</DialogHeader>
				<form onSubmit={handleSubmit}>
					<div className="grid gap-4 py-4">
						<div className="grid gap-2">
							<Label htmlFor="name" className="text-custom-text">
								Channel name
							</Label>
							<Input
								id="name"
								value={channelName}
								onChange={(e) => setChannelName(e.target.value)}
								className="bg-custom-ui-faint border-custom-ui-medium"
								placeholder="e.g. team-updates"
								disabled={isLoading}
							/>
						</div>
						<div className="grid gap-2">
							<Label htmlFor="description" className="text-custom-text">
								Description{" "}
								<span className="text-custom-text-tertiary">(optional)</span>
							</Label>
							<Textarea
								id="description"
								value={description}
								onChange={(e) => setDescription(e.target.value)}
								className="bg-custom-ui-faint border-custom-ui-medium resize-none"
								placeholder="What&apos;s this channel about?"
								rows={3}
								disabled={isLoading}
							/>
						</div>
					</div>
					<DialogFooter>
						<Button
							type="submit"
							className="bg-custom-accent text-white hover:bg-custom-accent/90"
							disabled={isLoading}
						>
							{isLoading ? "Creating..." : "Create"}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
