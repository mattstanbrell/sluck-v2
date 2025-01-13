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

// Add a helper function to generate a unique key for files
const generateFileKey = (file: File, index: number) => {
	return `${file.name}-${file.size}-${index}`;
};

interface MessageInputProps {
	channelId?: string;
	conversationId?: string;
	parentId?: string;
}

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
			const {
				data: { user },
				error: userError,
			} = await supabase.auth.getUser();
			if (userError) throw userError;
			if (!user) throw new Error("Not authenticated");

			// Insert the message first
			const { data: message, error: messageError } = await supabase
				.from("messages")
				.insert({
					content: content.trim(),
					channel_id: channelId ?? null,
					conversation_id: conversationId ?? null,
					parent_id: parentId ?? null,
					user_id: user.id,
				})
				.select()
				.single();

			if (messageError) throw messageError;
			messageId = message.id;

			// Upload any pending files
			if (pendingFiles.length > 0) {
				try {
					await Promise.all(
						pendingFiles.map((file) => uploadFile(file, message.id)),
					);
				} catch (uploadError) {
					// If any file upload fails, delete the message and throw the error
					if (messageId) {
						await supabase.from("messages").delete().eq("id", messageId);
					}
					throw uploadError;
				}
			}

			// Update conversation's last_message_at if it's a DM
			if (conversationId) {
				await supabase
					.from("conversations")
					.update({
						last_message_at: new Date().toISOString(),
					})
					.eq("id", conversationId);
			}

			setContent("");
			setPendingFiles([]);
		} catch (error) {
			console.error("[MessageInput] Error sending message:", error);
			// If we created a message but something failed after, clean it up
			if (messageId) {
				await supabase.from("messages").delete().eq("id", messageId);
			}
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
