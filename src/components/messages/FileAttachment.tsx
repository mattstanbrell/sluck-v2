import { useEffect, useState, useRef } from "react";
import { FileText, RefreshCw, ChevronDown, ChevronUp } from "lucide-react";
import { useFileUrl } from "@/hooks/useFileUrl";
import Image from "next/image";
import type { DatabaseFile } from "@/types/file";

interface FileAttachmentProps {
	file: DatabaseFile;
}

export function FileAttachment({ file }: FileAttachmentProps) {
	console.log("[FileAttachment] Rendering file:", {
		id: file.id,
		name: file.file_name,
		type: file.file_type,
		caption: file.caption,
		url: file.file_url,
	});

	const [isImageLoading, setIsImageLoading] = useState(true);
	const [showDescription, setShowDescription] = useState(false);
	const { url, error, isLoading, getUrl } = useFileUrl(file.file_url);
	const mediaErrorRef = useRef<boolean>(false);

	// Load URL on mount for media files
	useEffect(() => {
		if (
			file.file_type.startsWith("image/") ||
			file.file_type.startsWith("video/") ||
			file.file_type.startsWith("audio/")
		) {
			getUrl();
		}
	}, [file.file_type, getUrl]);

	// Get file type category
	const isImage = file.file_type.startsWith("image/");
	const isVideo = file.file_type.startsWith("video/");
	const isAudio = file.file_type.startsWith("audio/");

	// Handle media errors (expired URLs)
	const handleMediaError = async () => {
		if (!mediaErrorRef.current) {
			mediaErrorRef.current = true;
			await getUrl(true); // Force refresh URL
			mediaErrorRef.current = false;
		}
	};

	// For non-media files, handle click to get fresh URL
	const handleFileClick = async () => {
		const button = document.createElement("a");
		button.style.display = "none";
		document.body.appendChild(button);

		try {
			const freshUrl = await getUrl(true); // Force refresh URL for downloads
			if (freshUrl) {
				button.href = freshUrl;
				button.target = "_blank";
				button.rel = "noopener noreferrer";
				button.click();
			}
		} finally {
			document.body.removeChild(button);
		}
	};

	if (error) {
		return (
			<div className="text-sm text-red-500">
				Failed to load file: {error.message || "Unknown error"}
			</div>
		);
	}

	// Render based on file type
	if (isImage) {
		return (
			<div className="max-w-lg">
				<div className="rounded-md flex">
					{url ? (
						<Image
							src={url}
							alt={
								file.description
									?.replace(/^\[.*?\. Image description: /, "")
									.replace(/\]$/, "") ||
								file.caption ||
								file.file_name ||
								""
							}
							width={800}
							height={600}
							className={`rounded-md max-h-96 object-contain transition-opacity duration-200 ${
								isImageLoading ? "opacity-0" : "opacity-100"
							}`}
							loading="lazy"
							onLoadingComplete={() => setIsImageLoading(false)}
							onError={handleMediaError}
						/>
					) : (
						<div className="flex items-center justify-center h-32 w-full">
							<RefreshCw className="w-6 h-6 animate-spin text-custom-text-secondary" />
						</div>
					)}
				</div>
				<div className="mt-1">
					{file.caption && (
						<div className="flex items-start gap-2">
							<div className="flex-1 text-sm text-custom-text-secondary italic">
								{file.caption}
							</div>
							{file.description && (
								<button
									type="button"
									onClick={() => setShowDescription(!showDescription)}
									className="flex items-center gap-1 text-xs text-custom-text-secondary hover:text-custom-text transition-colors px-2 py-1 rounded hover:bg-custom-background-secondary"
									aria-label={
										showDescription
											? "Hide full description"
											: "Show full description"
									}
								>
									{showDescription ? (
										<ChevronUp className="w-4 h-4" />
									) : (
										<ChevronDown className="w-4 h-4" />
									)}
									{showDescription ? "Less" : "More"}
								</button>
							)}
						</div>
					)}
					{showDescription && file.description && (
						<div className="mt-2 text-sm text-custom-text-secondary bg-custom-background-secondary p-3 rounded-md">
							{file.description
								.replace(/^\[.*?\. Image description: /, "")
								.replace(/\]$/, "")}
						</div>
					)}
				</div>
			</div>
		);
	}

	if (isVideo) {
		return (
			<div className="max-w-lg">
				{isLoading ? (
					<div className="flex items-center gap-2 text-custom-text-secondary">
						<RefreshCw className="w-4 h-4 animate-spin" />
						<span className="text-sm">Loading video...</span>
					</div>
				) : (
					<>
						<video
							controls
							className="rounded-md max-h-96 bg-black"
							onError={handleMediaError}
						>
							<source src={url || ""} type={file.file_type} />
							<track kind="captions" />
							Your browser does not support the video tag.
						</video>
						<div className="mt-1">
							{file.caption && (
								<div className="flex items-start gap-2">
									<div className="flex-1 text-sm text-custom-text-secondary italic">
										{file.caption}
									</div>
									{file.description && (
										<button
											type="button"
											onClick={() => setShowDescription(!showDescription)}
											className="flex items-center gap-1 text-xs text-custom-text-secondary hover:text-custom-text transition-colors px-2 py-1 rounded hover:bg-custom-background-secondary"
											aria-label={
												showDescription
													? "Hide full description"
													: "Show full description"
											}
										>
											{showDescription ? (
												<ChevronUp className="w-4 h-4" />
											) : (
												<ChevronDown className="w-4 h-4" />
											)}
											{showDescription ? "Less" : "More"}
										</button>
									)}
								</div>
							)}
							{showDescription && file.description && (
								<div className="mt-2 text-sm text-custom-text-secondary bg-custom-background-secondary p-3 rounded-md">
									{file.description
										.replace(/^\[.*?\. Video content: /, "")
										.replace(/\]$/, "")}
								</div>
							)}
						</div>
					</>
				)}
			</div>
		);
	}

	if (isAudio) {
		return (
			<div className="max-w-lg">
				{isLoading ? (
					<div className="flex items-center gap-2 text-custom-text-secondary">
						<RefreshCw className="w-4 h-4 animate-spin" />
						<span className="text-sm">Loading audio...</span>
					</div>
				) : (
					<>
						<audio controls className="w-full" onError={handleMediaError}>
							<source src={url || ""} type={file.file_type} />
							<track kind="captions" />
							Your browser does not support the audio tag.
						</audio>
						<div className="mt-1">
							{file.caption && (
								<div className="flex items-start gap-2">
									<div className="flex-1 text-sm text-custom-text-secondary italic">
										{file.caption}
									</div>
									{file.description && (
										<button
											type="button"
											onClick={() => setShowDescription(!showDescription)}
											className="flex items-center gap-1 text-xs text-custom-text-secondary hover:text-custom-text transition-colors px-2 py-1 rounded hover:bg-custom-background-secondary"
											aria-label={
												showDescription
													? "Hide full description"
													: "Show full description"
											}
										>
											{showDescription ? (
												<ChevronUp className="w-4 h-4" />
											) : (
												<ChevronDown className="w-4 h-4" />
											)}
											{showDescription ? "Less" : "More"}
										</button>
									)}
								</div>
							)}
							{showDescription && file.description && (
								<div className="mt-2 text-sm text-custom-text-secondary bg-custom-background-secondary p-3 rounded-md">
									{file.description
										.replace(/^\[.*?\. Audio description: /, "")
										.replace(/\]$/, "")}
								</div>
							)}
						</div>
					</>
				)}
			</div>
		);
	}

	// For PDFs and other files, render a button
	return (
		<button
			type="button"
			onClick={handleFileClick}
			className="inline-flex items-center gap-2 p-3 rounded-md bg-custom-background-secondary hover:bg-custom-ui-faint transition-colors"
			aria-label={`Open ${file.file_name} in new tab`}
		>
			<FileText className="w-4 h-4 text-custom-text-secondary" />
			{/* <div>
				<span className="text-sm text-custom-text">{file.file_name}</span>
				<span className="text-xs text-custom-text-secondary ml-2">
					({formatFileSize(file.file_size)})
				</span>
			</div> */}
		</button>
	);
}
