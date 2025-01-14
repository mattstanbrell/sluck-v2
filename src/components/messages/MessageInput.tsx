"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { createClient } from "@/utils/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
	Bold,
	Italic,
	List,
	Code,
	Link2,
	Terminal,
	Upload,
	X,
	MoreHorizontal,
} from "lucide-react";
import { useFileUpload } from "@/hooks/useFileUpload";
import { useDropzone } from "react-dropzone";
import { Alert } from "@/components/ui/Alert";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { createMessage } from "@/app/actions/message";
import type { MessageChainContext } from "@/types/message";
import type { Database } from "@/lib/database.types";

// Add a helper function to generate a unique key for files
const generateFileKey = (file: File, index: number) => {
	return `${file.name}-${file.size}-${index}`;
};

interface MessageInputProps {
	channelId?: string;
	conversationId?: string;
	parentId?: string;
}

type ChainMessage = Database["public"]["Tables"]["messages"]["Row"] & {
	profiles: Database["public"]["Tables"]["profiles"]["Row"];
};

export function MessageInput({
	channelId,
	conversationId,
	parentId,
}: MessageInputProps) {
	const [content, setContent] = useState("");
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [isResizing, setIsResizing] = useState(false);
	const [pendingFiles, setPendingFiles] = useState<File[]>([]);
	const [error, setError] = useState<string | null>(null);
	const supabase = createClient();
	const textareaRef = useRef<HTMLTextAreaElement>(null);
	const containerRef = useRef<HTMLDivElement>(null);
	const isResizingRef = useRef(false);
	const startHeightRef = useRef(0);
	const startYRef = useRef(0);
	const fileInputRef = useRef<HTMLInputElement>(null);

	const { uploadFile } = useFileUpload({
		maxSizeMB: 50,
		allowedTypes: ["image/*", "video/*", "audio/*", "application/pdf"],
	});

	const onDrop = useCallback((acceptedFiles: File[]) => {
		setPendingFiles((prev) => [...prev, ...acceptedFiles]);
	}, []);

	const { getRootProps, isDragActive } = useDropzone({
		onDrop,
		noClick: true,
	});

	const removePendingFile = (file: File) => {
		setPendingFiles((prev) => prev.filter((f) => f !== file));
	};

	useEffect(() => {
		textareaRef.current?.focus();
	}, []);

	useEffect(() => {
		const handleMouseMove = (e: MouseEvent) => {
			if (!isResizingRef.current || !containerRef.current) return;

			const dy = startYRef.current - e.clientY;
			const newHeight = Math.min(
				Math.max(startHeightRef.current + dy, 144),
				window.innerHeight * 0.5,
			);
			containerRef.current.style.height = `${newHeight}px`;
		};

		const handleMouseUp = () => {
			if (!isResizingRef.current) return;
			isResizingRef.current = false;
			setIsResizing(false);
			document.body.classList.remove("select-none");
			document.body.classList.remove("resizing");
		};

		document.addEventListener("mousemove", handleMouseMove);
		document.addEventListener("mouseup", handleMouseUp);

		return () => {
			document.removeEventListener("mousemove", handleMouseMove);
			document.removeEventListener("mouseup", handleMouseUp);
			document.body.classList.remove("select-none");
			document.body.classList.remove("resizing");
		};
	}, []);

	const handleResizeStart = (e: React.MouseEvent) => {
		if (!containerRef.current) return;
		isResizingRef.current = true;
		setIsResizing(true);
		startHeightRef.current = containerRef.current.offsetHeight;
		startYRef.current = e.clientY;
		document.body.classList.add("select-none");
		document.body.classList.add("resizing");
	};

	const insertMarkdown = (prefix: string, suffix: string = prefix) => {
		const textarea = textareaRef.current;
		if (!textarea) return;

		const start = textarea.selectionStart;
		const end = textarea.selectionEnd;
		const text = textarea.value;
		const before = text.substring(0, start);
		const selection = text.substring(start, end);
		const after = text.substring(end);

		const newText = before + prefix + selection + suffix + after;
		setContent(newText);

		// Force React to update the textarea value
		setTimeout(() => {
			textarea.focus();
			textarea.setSelectionRange(start + prefix.length, end + prefix.length);
		}, 0);
	};

	const insertCodeBlock = () => {
		const textarea = textareaRef.current;
		if (!textarea) return;

		const start = textarea.selectionStart;
		const end = textarea.selectionEnd;
		const text = textarea.value;
		const before = text.substring(0, start);
		const selection = text.substring(start, end);
		const after = text.substring(end);

		const needsNewlineBefore = before.length > 0 && !before.endsWith("\n");
		const needsNewlineAfter = after.length > 0 && !after.startsWith("\n");

		const prefix = needsNewlineBefore ? "\n```\n" : "```\n";
		const suffix = needsNewlineAfter ? "\n```\n" : "\n```";

		const newText = before + prefix + selection + suffix + after;
		setContent(newText);

		setTimeout(() => {
			textarea.focus();
			const newCursorPos = start + prefix.length;
			textarea.setSelectionRange(newCursorPos, newCursorPos + selection.length);
		}, 0);
	};

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		if ((!content.trim() && pendingFiles.length === 0) || isSubmitting) return;

		setIsSubmitting(true);
		setError(null);
		let messageId: string | null = null;

		try {
			console.log("[MessageInput] Getting user profile...");
			const {
				data: { user },
			} = await supabase.auth.getUser();
			if (!user) {
				throw new Error("Not authenticated");
			}

			const { data: profile, error: profileError } = await supabase
				.from("profiles")
				.select("id, full_name, display_name")
				.eq("id", user.id)
				.single();

			if (profileError) {
				console.error("[MessageInput] Profile query error:", profileError);
				throw new Error("Failed to get user profile");
			}

			if (!profile) {
				console.error("[MessageInput] No profile found");
				throw new Error("Failed to get user profile");
			}

			console.log("[MessageInput] Got profile:", profile);

			// Round current time to nearest minute for the current message
			const now = new Date();
			const nearestMinute = new Date(Math.round(now.getTime() / 60000) * 60000);

			console.log("[MessageInput] Getting latest message...");
			// Get messages in the current chain
			const { data: latestMessage, error: latestMessageError } = await supabase
				.from("messages")
				.select(`
					user_id,
					created_at
				`)
				.eq(
					channelId ? "channel_id" : "conversation_id",
					channelId || conversationId,
				)
				.order("created_at", { ascending: false })
				.limit(1);

			if (latestMessageError) {
				console.error(
					"[MessageInput] Latest message query error:",
					latestMessageError,
				);
			} else {
				console.log("[MessageInput] Latest message:", latestMessage);
			}

			// Get channel name if in a channel
			let channelName = null;
			if (channelId) {
				console.log("[MessageInput] Getting channel name for:", channelId);
				const { data: channel, error: channelError } = await supabase
					.from("channels")
					.select("name")
					.eq("id", channelId)
					.single();

				if (channelError) {
					console.error("[MessageInput] Channel query error:", channelError);
				} else {
					console.log("[MessageInput] Got channel:", channel);
					channelName = channel?.name || null;
				}
			}

			// Get recipient name if in a DM
			let recipientName = null;
			if (conversationId) {
				console.log(
					"[MessageInput] Getting recipient for conversation:",
					conversationId,
				);
				const { data: participants, error: participantsError } = await supabase
					.from("conversation_participants")
					.select(`
						profiles:user_id (
							id,
							display_name,
							full_name
						)
					`)
					.eq("conversation_id", conversationId)
					.neq("user_id", profile.id);

				if (participantsError) {
					console.error(
						"[MessageInput] Participants query error:",
						participantsError,
					);
				} else {
					console.log("[MessageInput] Got participants:", participants);
					const recipient = participants?.[0]?.profiles;
					if (recipient) {
						recipientName =
							recipient.display_name || recipient.full_name || null;
					}
				}
			}

			console.log("[MessageInput] Getting chain messages...");
			// If we found a latest message, get all consecutive messages from that user
			const { data: chainMessages, error: chainMessagesError } = await supabase
				.from("messages")
				.select(`
					id,
					content,
					created_at,
					channel_id,
					conversation_id,
					profiles (
						id,
						full_name,
						display_name
					)
				`)
				.eq(
					channelId ? "channel_id" : "conversation_id",
					channelId || conversationId,
				)
				.eq("user_id", latestMessage?.[0]?.user_id || profile.id)
				.lt(
					"created_at",
					latestMessage?.[0]?.created_at || new Date().toISOString(),
				)
				.order("created_at", { ascending: false });

			if (chainMessagesError) {
				console.error(
					"[MessageInput] Chain messages query error:",
					chainMessagesError,
				);
			} else {
				console.log(
					"[MessageInput] Got chain messages:",
					chainMessages?.length || 0,
				);
			}

			// Create message context
			const messageContext: MessageChainContext = {
				currentMessage: {
					content: content.trim(),
					timestamp: nearestMinute,
					sender: {
						id: profile.id,
						displayName: profile.display_name || profile.full_name,
					},
					channelId: channelId || null,
					channelName,
					conversationId: conversationId || null,
					recipientName,
				},
				chainMessages: (chainMessages || []).map((msg) => ({
					content: msg.content,
					// Round down to minute for chain messages
					timestamp: new Date(
						Math.floor(new Date(msg.created_at).getTime() / 60000) * 60000,
					),
					sender: {
						id: msg.profiles?.id,
						displayName: msg.profiles?.display_name || msg.profiles?.full_name,
					},
					channelId: msg.channel_id,
					channelName, // Use same channel name for all messages in chain
					conversationId: msg.conversation_id,
					recipientName, // Use same recipient name for all messages in chain
				})),
			};

			console.log("[MessageInput] Creating message with context:", {
				content: content.trim(),
				channelId,
				conversationId,
				messageContext,
			});

			// Create message using server action
			const message = await createMessage({
				content: content.trim(),
				channelId,
				conversationId,
				parentId,
				messageContext,
			});
			messageId = message.id;
			console.log("[MessageInput] Message created:", message);

			// Upload any pending files
			if (pendingFiles.length > 0) {
				try {
					console.log("[MessageInput] Uploading files...");
					await Promise.all(
						pendingFiles.map((file) => uploadFile(file, message.id)),
					);
					console.log("[MessageInput] Files uploaded successfully");
				} catch (uploadError) {
					console.error("[MessageInput] File upload error:", uploadError);
					// If any file upload fails, delete the message and throw the error
					if (messageId) {
						console.log(
							"[MessageInput] Deleting message due to file upload error",
						);
						await supabase.from("messages").delete().eq("id", messageId);
					}
					throw uploadError;
				}
			}

			setContent("");
			setPendingFiles([]);
		} catch (error) {
			console.error("[MessageInput] Error sending message:", error);
			setError(
				error instanceof Error ? error.message : "Failed to send message",
			);
		} finally {
			setIsSubmitting(false);
		}
	};

	const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
		if (e.key === "Enter" && !e.shiftKey) {
			e.preventDefault();
			handleSubmit(e as unknown as React.FormEvent);
		}
	};

	const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
		if (e.target.files) {
			setPendingFiles((prev) => [...prev, ...Array.from(e.target.files || [])]);
		}
	};

	return (
		<>
			{error && <Alert message={error} onDismiss={() => setError(null)} />}
			<form onSubmit={handleSubmit} className="relative" {...getRootProps()}>
				<div
					ref={containerRef}
					className={`min-h-[144px] max-h-[50vh] border-t border-custom-ui-medium relative bg-custom-background-secondary ${
						isResizing ? "select-none" : ""
					} ${isDragActive ? "border-2 border-dashed border-blue-500" : ""}`}
					style={{ height: "144px" }}
				>
					<div
						className="absolute -top-1 left-0 right-0 h-2 cursor-row-resize hover:bg-custom-ui-medium"
						onMouseDown={handleResizeStart}
					/>
					<div className="p-4 space-y-2 h-full flex flex-col">
						<div className="flex flex-wrap gap-2 items-center">
							<div className="flex gap-1">
								<Button
									type="button"
									variant="ghost"
									size="sm"
									onClick={() => insertMarkdown("**")}
									title="Bold"
									className="text-custom-text hover:bg-custom-ui-medium hover:text-custom-text"
								>
									<Bold className="h-4 w-4" />
								</Button>
								<Button
									type="button"
									variant="ghost"
									size="sm"
									onClick={() => insertMarkdown("*")}
									title="Italic"
									className="text-custom-text hover:bg-custom-ui-medium hover:text-custom-text"
								>
									<Italic className="h-4 w-4" />
								</Button>

								<Popover>
									<PopoverTrigger asChild>
										<Button
											type="button"
											variant="ghost"
											size="sm"
											className="text-custom-text hover:bg-custom-ui-medium hover:text-custom-text"
											title="More formatting options"
										>
											<MoreHorizontal className="h-4 w-4" />
										</Button>
									</PopoverTrigger>
									<PopoverContent
										className="w-auto p-2 flex gap-1 bg-custom-background border border-custom-ui-medium rounded-md shadow-sm"
										align="start"
										side="top"
										sideOffset={4}
									>
										<Button
											type="button"
											variant="ghost"
											size="sm"
											onClick={() => insertMarkdown("\n- ")}
											title="List"
											className="text-custom-text hover:bg-custom-ui-medium hover:text-custom-text"
										>
											<List className="h-4 w-4" />
										</Button>
										<Button
											type="button"
											variant="ghost"
											size="sm"
											onClick={() => insertMarkdown("`")}
											title="Inline Code"
											className="text-custom-text hover:bg-custom-ui-medium hover:text-custom-text"
										>
											<Code className="h-4 w-4" />
										</Button>
										<Button
											type="button"
											variant="ghost"
											size="sm"
											onClick={insertCodeBlock}
											title="Code Block"
											className="text-custom-text hover:bg-custom-ui-medium hover:text-custom-text"
										>
											<Terminal className="h-4 w-4" />
										</Button>
										<Button
											type="button"
											variant="ghost"
											size="sm"
											onClick={() => insertMarkdown("[", "](url)")}
											title="Link"
											className="text-custom-text hover:bg-custom-ui-medium hover:text-custom-text"
										>
											<Link2 className="h-4 w-4" />
										</Button>
									</PopoverContent>
								</Popover>

								<Button
									type="button"
									variant="ghost"
									size="sm"
									onClick={() => fileInputRef.current?.click()}
									title="Upload File"
									className="text-custom-text hover:bg-custom-ui-medium hover:text-custom-text"
								>
									<Upload className="h-4 w-4" />
								</Button>
								<input
									ref={fileInputRef}
									type="file"
									className="hidden"
									multiple
									onChange={handleFileSelect}
								/>
							</div>

							{pendingFiles.length > 0 && (
								<div className="flex flex-wrap gap-2">
									{pendingFiles.map((file, i) => (
										<div
											key={generateFileKey(file, i)}
											className="flex items-center gap-2 px-2 py-1 bg-custom-ui-medium rounded"
										>
											<span className="text-sm truncate max-w-[200px]">
												{file.name}
											</span>
											<button
												type="button"
												onClick={() => removePendingFile(file)}
												className="text-custom-text hover:text-red-500"
											>
												<X className="h-4 w-4" />
											</button>
										</div>
									))}
								</div>
							)}
						</div>

						<Textarea
							ref={textareaRef}
							value={content}
							onChange={(e) => setContent(e.target.value)}
							onKeyDown={handleKeyDown}
							placeholder={`Message ${channelId ? "#general" : "User"}`}
							className="flex-1 resize-none bg-custom-background border border-custom-ui-faint p-2 focus:border-2 focus:border-custom-ui-strong outline-none ring-0 focus:ring-0 focus-visible:ring-0 focus-visible:ring-offset-0 text-custom-text placeholder:text-custom-text-muted rounded-md"
						/>
					</div>
				</div>
			</form>
		</>
	);
}
