import ReactMarkdown from "react-markdown";
import type { Components } from "react-markdown";
import { FileAttachment } from "./FileAttachment";
import type { DatabaseFile } from "@/types/file";

interface MessageContentProps {
	content: string;
	files: DatabaseFile[];
}

const components: Components = {
	p: ({ children }) => <p className="whitespace-pre-wrap">{children}</p>,
};

export function MessageContent({ content, files }: MessageContentProps) {
	return (
		<div className="space-y-2">
			<ReactMarkdown components={components}>{content}</ReactMarkdown>
			{files.length > 0 && (
				<div className="block space-y-2">
					{files.map((file) => (
						<FileAttachment key={file.id} file={file} />
					))}
				</div>
			)}
		</div>
	);
}
