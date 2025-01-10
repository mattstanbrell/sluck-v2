"use client";

import ReactMarkdown from "react-markdown";
import hljs from "highlight.js";
import { useCallback, useEffect } from "react";

interface MessageContentProps {
	content: string;
}

export default function MessageContent({ content }: MessageContentProps) {
	// Initialize highlight.js
	useEffect(() => {
		hljs.configure({
			languages: [
				"javascript",
				"typescript",
				"python",
				"bash",
				"sql",
				"json",
				"html",
				"css",
			],
		});
	}, []);

	const highlightCode = useCallback((code: string, language: string) => {
		try {
			return hljs.highlight(code, {
				language: language || "plaintext",
				ignoreIllegals: true,
			}).value;
		} catch {
			return hljs.highlight(code, {
				language: "plaintext",
				ignoreIllegals: true,
			}).value;
		}
	}, []);

	return (
		<div className="prose dark:prose-invert prose-pre:w-fit prose-pre:min-w-0 prose-pre:max-w-full">
			<ReactMarkdown
				components={{
					code(props) {
						const { children = "", className = "" } = props;
						const content = String(children).replace(/\n$/, "");

						// Check if this is a code block (has language class or contains newlines)
						const isCodeBlock =
							className?.includes("language-") || content.includes("\n");

						if (!isCodeBlock) {
							return <code>{content}</code>;
						}

						const language = /language-(\w+)/.exec(className)?.[1] || "";
						const highlighted = highlightCode(content, language);

						return (
							<pre className="overflow-x-auto">
								<code
									className={`hljs ${language ? `language-${language}` : ""}`}
									dangerouslySetInnerHTML={{ __html: highlighted }}
								/>
							</pre>
						);
					},
				}}
			>
				{content}
			</ReactMarkdown>
		</div>
	);
}
