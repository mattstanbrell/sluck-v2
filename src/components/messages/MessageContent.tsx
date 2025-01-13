import React from "react";
import ReactMarkdown from "react-markdown";
import type { Components } from "react-markdown";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/cjs/styles/prism";
import { FileAttachment } from "./FileAttachment";
import type { Database } from "@/lib/database.types";

type File = Database["public"]["Tables"]["files"]["Row"];

interface MessageContentProps {
	content: string;
	files?: File[];
}

export function MessageContent({ content, files = [] }: MessageContentProps) {
	const customRenderers: Partial<Components> = {
		code(props) {
			const { children, className, ...rest } = props;
			const match = /language-(\w+)/.exec(className || "");
			const code = String(children).replace(/\n$/, "");

			if (!match) {
				return (
					<code {...rest} className={className}>
						{children}
					</code>
				);
			}

			return (
				<div className="syntax-highlighter">
					<SyntaxHighlighter language={match[1]} style={oneDark} PreTag="div">
						{code}
					</SyntaxHighlighter>
				</div>
			);
		},
	};

	return (
		<div className="space-y-2">
			<div className="prose prose-sm max-w-none text-custom-text prose-pre:bg-custom-background-secondary prose-pre:text-custom-text prose-code:text-custom-text prose-code:bg-custom-background-secondary">
				<ReactMarkdown components={customRenderers}>{content}</ReactMarkdown>
			</div>
			{files.length > 0 && (
				<div className="space-y-2">
					{files.map((file) => (
						<FileAttachment
							key={file.id}
							fileUrl={file.file_url}
							fileName={file.file_name}
							fileType={file.file_type}
							fileSize={file.file_size}
						/>
					))}
				</div>
			)}
		</div>
	);
}
