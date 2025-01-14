"use client";

import * as React from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Eraser, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import { streamChat, type Message } from "@/app/actions/chat";

export function ChatDialog() {
	const [open, setOpen] = React.useState(false);
	const [messages, setMessages] = React.useState<Message[]>([]);
	const [input, setInput] = React.useState("");
	const [isLoading, setIsLoading] = React.useState(false);
	const messagesEndRef = React.useRef<HTMLDivElement>(null);

	React.useEffect(() => {
		const down = (e: KeyboardEvent) => {
			if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
				e.preventDefault();
				setOpen((open) => !open);
			}
		};

		document.addEventListener("keydown", down);
		return () => document.removeEventListener("keydown", down);
	}, []);

	const scrollToBottom = React.useCallback(() => {
		messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
	}, []);

	React.useEffect(() => {
		scrollToBottom();
	}, [scrollToBottom]);

	const handleClear = React.useCallback(() => {
		setMessages([]);
	}, []);

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		if (!input.trim() || isLoading) return;

		// Add user message
		const userMessage: Message = {
			id: crypto.randomUUID(),
			role: "user",
			content: input,
		};
		setMessages((prev) => [...prev, userMessage]);
		setInput("");
		setIsLoading(true);

		// Create a placeholder message for the assistant's response
		const assistantMessageId = crypto.randomUUID();
		setMessages((prev) => [
			...prev,
			{
				id: assistantMessageId,
				role: "assistant",
				content: "",
			},
		]);

		try {
			const stream = await streamChat(messages.concat(userMessage));

			let accumulatedContent = "";
			for await (const chunk of stream) {
				const content = chunk.choices[0]?.delta?.content || "";
				accumulatedContent += content;

				// Update the assistant's message with the accumulated content
				setMessages((prev) =>
					prev.map((msg) =>
						msg.id === assistantMessageId
							? { ...msg, content: accumulatedContent }
							: msg,
					),
				);
			}
		} catch (error) {
			console.error("Error calling OpenAI:", error);
			// Update the assistant's message to show the error
			setMessages((prev) =>
				prev.map((msg) =>
					msg.id === assistantMessageId
						? {
								...msg,
								content: "Sorry, I encountered an error. Please try again.",
							}
						: msg,
				),
			);
		} finally {
			setIsLoading(false);
		}
	};

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogContent
				className={cn(
					"sm:max-w-[600px]",
					"h-[80vh]",
					"flex flex-col",
					"bg-custom-background-secondary",
				)}
			>
				<div className="flex justify-between items-center p-4 border-b border-custom-ui-medium">
					<h2 className="text-custom-text font-medium">Ask Slucky</h2>
					<Button
						variant="ghost"
						size="icon"
						onClick={handleClear}
						className="text-custom-text-secondary hover:text-custom-text hover:bg-custom-ui-faint"
						disabled={messages.length === 0 || isLoading}
					>
						<Eraser className="h-4 w-4" />
					</Button>
				</div>
				<div className="flex-1 overflow-y-auto p-4 space-y-4">
					{messages.length === 0 ? (
						<div className="flex items-center justify-center h-full text-custom-text-secondary">
							Ask me anything...
						</div>
					) : (
						messages.map((message) => (
							<div
								key={message.id}
								className={cn(
									"p-4 rounded-lg",
									message.role === "user"
										? "bg-custom-ui-faint ml-8"
										: message.role === "system"
											? "bg-custom-ui-medium mx-8 text-sm border border-custom-ui-strong"
											: "bg-custom-ui-medium mr-8",
									message.role === "assistant" &&
										!message.content &&
										"animate-pulse",
								)}
							>
								{message.role === "system" && (
									<div className="flex items-center gap-2 mb-2 text-custom-text-secondary">
										<Info className="h-4 w-4" />
										<span>Using context from previous messages</span>
									</div>
								)}
								<p className="text-custom-text whitespace-pre-wrap">
									{message.content || "..."}
								</p>
							</div>
						))
					)}
					<div ref={messagesEndRef} />
				</div>

				<form
					onSubmit={handleSubmit}
					className="p-4 border-t border-custom-ui-medium"
				>
					<Input
						value={input}
						onChange={(e) => setInput(e.target.value)}
						placeholder={
							messages.length === 0
								? "What's on your mind?"
								: "Ask a follow-up question..."
						}
						className={cn(
							"bg-custom-background",
							"border-custom-ui-medium",
							"text-custom-text",
							"placeholder:text-custom-text-tertiary",
						)}
						disabled={isLoading}
					/>
				</form>
			</DialogContent>
		</Dialog>
	);
}
