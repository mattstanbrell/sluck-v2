"use client";

import ReactMarkdown from "react-markdown";
import { Components } from "react-markdown";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/cjs/styles/prism";
import type { CodeProps } from "react-markdown/lib/ast-to-react";

interface MessageContentProps {
	content: string;
}

export function MessageContent({ content }: MessageContentProps) {
	const customRenderers: Partial<Components> = {
		code({ node, inline, className, children, ...props }: CodeProps) {
			const match = /language-(\w+)/.exec(className || "");
			const content = String(children).replace(/\n$/, "");

			if (!inline && match) {
				return (
					<SyntaxHighlighter
						style={oneDark}
						language={match[1]}
						PreTag="div"
						{...props}
					>
						{content}
					</SyntaxHighlighter>
				);
			}

			return (
				<code className={className} {...props}>
					{children}
				</code>
			);
		},
	};

	return (
		<div className="prose prose-sm max-w-none text-custom-text prose-pre:bg-custom-background-secondary prose-pre:text-custom-text prose-code:text-custom-text prose-code:bg-custom-background-secondary">
			<ReactMarkdown components={customRenderers}>{content}</ReactMarkdown>
		</div>
	);
}
