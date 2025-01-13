"use client";

import { useEffect, useState, useRef } from "react";
import { createClient } from "@/utils/supabase/client";
import { Button } from "@/components/ui/button";
import {
	X,
	Files,
	FileImage,
	FileText,
	FileVideo,
	FileAudio,
	File,
} from "lucide-react";
import type { FileWithMessage } from "@/types/file";

interface FilesPanelProps {
	channelId: string;
	onClose: () => void;
}

export function FilesPanel({ channelId, onClose }: FilesPanelProps) {
	const supabase = createClient();
	const [files, setFiles] = useState<FileWithMessage[]>([]);
	const [width, setWidth] = useState(400);
	const [isResizing, setIsResizing] = useState(false);
	const isResizingRef = useRef(false);
	const startXRef = useRef(0);
	const startWidthRef = useRef(0);
	const containerRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		async function fetchFiles() {
			console.log("[FilesPanel] Fetching files for channel:", channelId);

			const { data, error } = await supabase
				.from("files")
				.select(`
					*,
					message:messages!inner (
						profile:profiles (
							full_name,
							display_name
						)
					)
				`)
				.eq("messages.channel_id", channelId)
				.order("created_at", { ascending: false });

			if (error) {
				console.error("[FilesPanel] Error fetching files:", error);
				return;
			}

			console.log("[FilesPanel] Files data:", data);

			if (data) {
				const transformedData = data
					.filter((file) => file.message?.profile) // Only include files with valid message and profile
					.map((file) => ({
						id: file.id,
						message_id: file.message_id,
						file_name: file.file_name,
						file_type: file.file_type,
						file_size: file.file_size,
						file_url: file.file_url,
						created_at: file.created_at,
						message: {
							profile: file.message.profile,
						},
					}));
				console.log("[FilesPanel] Transformed files:", transformedData);
				setFiles(transformedData);
			}
		}

		fetchFiles();

		// Subscribe to file changes
		const channel = supabase
			.channel(`files:${channelId}`)
			.on(
				"postgres_changes",
				{
					event: "*",
					schema: "public",
					table: "files",
					filter: `message.channel_id=eq.${channelId}`,
				},
				(payload) => {
					console.log("[FilesPanel] File change detected:", payload);
					fetchFiles();
				},
			)
			.subscribe();

		return () => {
			channel.unsubscribe();
		};
	}, [channelId, supabase]);

	useEffect(() => {
		const handleMouseMove = (e: MouseEvent) => {
			if (!isResizingRef.current) return;

			const deltaX = startXRef.current - e.clientX;
			const newWidth = Math.min(
				Math.max(startWidthRef.current + deltaX, 320),
				800,
			);
			setWidth(newWidth);
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
		startXRef.current = e.clientX;
		startWidthRef.current = containerRef.current.offsetWidth;
		document.body.classList.add("select-none");
		document.body.classList.add("resizing");
	};

	const getFileIcon = (fileType: string) => {
		if (fileType.startsWith("image/")) return <FileImage className="h-4 w-4" />;
		if (fileType.startsWith("video/")) return <FileVideo className="h-4 w-4" />;
		if (fileType.startsWith("audio/")) return <FileAudio className="h-4 w-4" />;
		if (fileType.startsWith("text/")) return <FileText className="h-4 w-4" />;
		return <File className="h-4 w-4" />;
	};

	const formatFileSize = (bytes: number) => {
		if (bytes === 0) return "0 B";
		const k = 1024;
		const sizes = ["B", "KB", "MB", "GB"];
		const i = Math.floor(Math.log(bytes) / Math.log(k));
		return `${Number.parseFloat((bytes / k ** i).toFixed(1))} ${sizes[i]}`;
	};

	const groupedFiles = files.reduce(
		(acc, file) => {
			const type = file.file_type.split("/")[0] || "other";
			if (!acc[type]) acc[type] = [];
			acc[type].push(file);
			return acc;
		},
		{} as Record<string, FileWithMessage[]>,
	);

	return (
		<>
			{/* Resizer handle */}
			<div
				className="w-[1px] cursor-col-resize flex-none relative -mr-[1px]"
				onMouseDown={handleResizeStart}
			>
				<div className="absolute inset-y-0 -left-1 -right-1 hover:bg-custom-ui-medium" />
				<div className="absolute inset-0 bg-custom-ui-medium" />
			</div>

			{/* Files Panel */}
			<div
				ref={containerRef}
				style={{ "--panel-width": `${width}px` } as React.CSSProperties}
				className={`
          fixed inset-0 z-50 bg-custom-background flex flex-col border-l border-custom-ui-medium w-screen
          sm:w-[var(--panel-width)] sm:relative sm:h-full sm:z-auto ${isResizing ? "select-none" : ""}
        `}
			>
				{/* Header */}
				<div className="shrink-0 flex items-center justify-between px-4 py-2 border-b border-custom-ui-medium">
					<div className="flex items-center gap-2">
						<Files className="h-4 w-4 text-custom-text-secondary" />
						<span className="font-medium text-custom-text">Files</span>
					</div>
					<Button
						variant="ghost"
						size="icon"
						onClick={onClose}
						className="text-custom-text-secondary hover:text-custom-text hover:bg-custom-ui-faint"
					>
						<X className="h-4 w-4" />
					</Button>
				</div>

				{/* File Groups */}
				<div className="flex-1 overflow-y-auto p-4">
					{Object.entries(groupedFiles).map(([type, typeFiles]) => (
						<div key={type} className="mb-6 last:mb-0">
							<h3 className="text-sm font-medium text-custom-text-secondary capitalize mb-2">
								{type}
							</h3>
							<div className="space-y-2">
								{typeFiles.map((file) => (
									<a
										key={file.id}
										href={file.file_url}
										target="_blank"
										rel="noopener noreferrer"
										className="flex items-center gap-3 p-2 rounded-md hover:bg-custom-ui-faint group"
									>
										{getFileIcon(file.file_type)}
										<div className="flex-1 min-w-0">
											<div className="text-sm font-medium text-custom-text truncate">
												{file.file_name}
											</div>
											<div className="text-xs text-custom-text-tertiary">
												{formatFileSize(file.file_size)} • Shared by{" "}
												{file.message.profile.display_name ||
													file.message.profile.full_name}
											</div>
										</div>
									</a>
								))}
							</div>
						</div>
					))}
				</div>
			</div>
		</>
	);
}
