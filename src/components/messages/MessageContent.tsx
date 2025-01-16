import ReactMarkdown from "react-markdown";
import type { Components } from "react-markdown";
import { FileAttachment } from "./FileAttachment";
import type { DatabaseFile } from "@/types/file";
import type { Message } from "@/types/message";

interface MessageContentProps {
	message: Message;
}

const components: Components = {
	p: ({ children }) => <p className="whitespace-pre-wrap">{children}</p>,
};

export function MessageContent({ message }: MessageContentProps) {
	return (
		<div className="relative group">
			<div className="text-custom-text whitespace-pre-wrap break-words">
				{message?.content || ""}
			</div>
			{message?.status && (
				<div className="absolute -right-6 top-0 text-xs">
					{message.status === "sending" && (
						<span className="text-custom-text-secondary animate-pulse">
							sending...
						</span>
					)}
					{message.status === "sent" && (
						<span className="text-custom-text-secondary">sent</span>
					)}
					{message.status === "embedding" && (
						<span className="text-custom-text-secondary">indexing...</span>
					)}
					{message.status === "failed" && (
						<span className="text-red-500" title={message.error}>
							failed
						</span>
					)}
				</div>
			)}
			{message?.files && message.files.length > 0 && (
				<div className="mt-2 space-y-2">
					{message.files.map((file) => (
						<FileAttachment key={file.id} file={file} />
					))}
				</div>
			)}
		</div>
	);
}
