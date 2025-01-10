"use client";

import { useSession } from "next-auth/react";
import { getAuthenticatedSupabaseClient } from "@/lib/supabase";
import { FormEvent, useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Bold, Italic, List, Code, Link2, Terminal } from "lucide-react";

interface MessageInputProps {
	channelId?: string | null;
	conversationId?: string | null;
	parentId?: string | null;
}

export default function MessageInput({
	channelId,
	conversationId,
	parentId,
}: MessageInputProps) {
	const { data: session } = useSession();
	const [message, setMessage] = useState("");
	const [isLoading, setIsLoading] = useState(false);
	const textareaRef = useRef<HTMLTextAreaElement>(null);
	const containerRef = useRef<HTMLDivElement>(null);
	const isResizingRef = useRef(false);
	const startHeightRef = useRef(0);
	const startYRef = useRef(0);

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
			isResizingRef.current = false;
			document.documentElement.style.userSelect = "";
			document.documentElement.style.webkitUserSelect = "";
		};

		document.addEventListener("mousemove", handleMouseMove);
		document.addEventListener("mouseup", handleMouseUp);

		return () => {
			document.removeEventListener("mousemove", handleMouseMove);
			document.removeEventListener("mouseup", handleMouseUp);
		};
	}, []);

	const handleResizeStart = (e: React.MouseEvent) => {
		if (!containerRef.current) return;
		isResizingRef.current = true;
		startHeightRef.current = containerRef.current.offsetHeight;
		startYRef.current = e.clientY;
		document.documentElement.style.userSelect = "none";
		document.documentElement.style.webkitUserSelect = "none";
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
		setMessage(newText);

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

		// Only add newlines if we're in the middle of text
		const needsNewlineBefore = before.length > 0 && !before.endsWith("\n");
		const needsNewlineAfter = after.length > 0 && !after.startsWith("\n");

		const prefix = needsNewlineBefore ? "\n```\n" : "```\n";
		const suffix = needsNewlineAfter ? "\n```\n" : "\n```";

		const newText = before + prefix + selection + suffix + after;
		setMessage(newText);

		// Force React to update the textarea value
		setTimeout(() => {
			textarea.focus();
			const newCursorPos = start + prefix.length;
			textarea.setSelectionRange(newCursorPos, newCursorPos + selection.length);
		}, 0);
	};

	const insertLink = () => {
		insertMarkdown("[", "](url)");
	};

	const sendMessage = async (e: FormEvent) => {
		e.preventDefault();
		if (!message.trim() || !session?.user?.id || isLoading) return;

		try {
			textareaRef.current?.focus();
			setIsLoading(true);
			const client = await getAuthenticatedSupabaseClient();

			// Insert the message
			await client.from("messages").insert({
				content: message.trim(),
				channel_id: channelId,
				conversation_id: conversationId,
				user_id: session.user.id,
				parent_id: parentId,
				thread_participant: parentId ? true : undefined,
			});

			// Update the conversation's last_message_at
			if (conversationId) {
				await client
					.from("conversations")
					.update({
						last_message_at: new Date().toISOString(),
					})
					.eq("id", conversationId);
			}

			setMessage("");
		} catch (error) {
			console.error("Error sending message:", error);
		} finally {
			setIsLoading(false);
			textareaRef.current?.focus();
		}
	};

	const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
		if (e.key === "Enter" && !e.shiftKey) {
			e.preventDefault();
			sendMessage(e);
		}
	};

	return (
		<form onSubmit={sendMessage} className="relative">
			<div
				ref={containerRef}
				className="min-h-[144px] max-h-[50vh] border-t border-t-[#E0DED2] relative bg-[#F2F0E5]"
				style={{ height: "144px" }}
			>
				<div
					className="absolute -top-1 left-0 right-0 h-2 cursor-row-resize hover:bg-[#E0DED2] dark:hover:bg-gray-700"
					onMouseDown={handleResizeStart}
				/>
				<div className="p-4 space-y-2 h-full flex flex-col">
					<div className="flex gap-1">
						<Button
							type="button"
							variant="ghost"
							size="sm"
							onClick={() => insertMarkdown("**")}
							title="Bold"
						>
							<Bold className="h-4 w-4" />
						</Button>
						<Button
							type="button"
							variant="ghost"
							size="sm"
							onClick={() => insertMarkdown("*")}
							title="Italic"
						>
							<Italic className="h-4 w-4" />
						</Button>
						<Button
							type="button"
							variant="ghost"
							size="sm"
							onClick={() => insertMarkdown("\n- ")}
							title="List"
						>
							<List className="h-4 w-4" />
						</Button>
						<Button
							type="button"
							variant="ghost"
							size="sm"
							onClick={() => insertMarkdown("`", "`")}
							title="Inline Code"
						>
							<Code className="h-4 w-4" />
						</Button>
						<Button
							type="button"
							variant="ghost"
							size="sm"
							onClick={insertCodeBlock}
							title="Code Block"
						>
							<Terminal className="h-4 w-4" />
						</Button>
						<Button
							type="button"
							variant="ghost"
							size="sm"
							onClick={insertLink}
							title="Link"
						>
							<Link2 className="h-4 w-4" />
						</Button>
					</div>
					<textarea
						ref={textareaRef}
						value={message}
						onChange={(e) => setMessage(e.target.value)}
						onKeyDown={handleKeyDown}
						placeholder="Type a message... (Markdown supported)"
						className="w-full p-2 rounded-md border border-transparent bg-[#FFFCF0] focus:border-[#1B1A19] dark:border-gray-700 dark:bg-gray-800 resize-none flex-1 focus:outline-none"
						style={{ height: "144px" }}
					/>
				</div>
			</div>
		</form>
	);
}
