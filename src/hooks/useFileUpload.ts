import { useState } from "react";
import { createClient } from "@/utils/supabase/client";
import { attachFileToMessage } from "@/app/actions/files";

interface UploadOptions {
	maxSizeMB?: number;
	allowedTypes?: string[];
}

interface UploadProgress {
	progress: number;
	state: "preparing" | "uploading" | "done" | "error";
	error?: string;
}

export const useFileUpload = (options: UploadOptions = {}) => {
	const [uploadProgress, setUploadProgress] = useState<
		Record<string, UploadProgress>
	>({});
	const supabase = createClient();

	const validateFile = (file: File) => {
		if (options.maxSizeMB && file.size > options.maxSizeMB * 1024 * 1024) {
			throw new Error(`File size must be less than ${options.maxSizeMB}MB`);
		}
		if (options.allowedTypes && options.allowedTypes.length > 0) {
			const isAllowed = options.allowedTypes.some((pattern) => {
				// Handle wildcards like "image/*"
				if (pattern.endsWith("/*")) {
					const type = pattern.split("/")[0];
					return file.type.startsWith(`${type}/`);
				}
				return pattern === file.type;
			});
			if (!isAllowed) {
				throw new Error(`File type ${file.type} is not allowed`);
			}
		}
	};

	const uploadFile = async (file: File, messageId: string) => {
		const uploadId = `${messageId}-${file.name}`;

		try {
			// Set initial state
			setUploadProgress((prev) => ({
				...prev,
				[uploadId]: { progress: 0, state: "preparing" },
			}));

			// Validate file
			validateFile(file);

			// Get presigned URL
			const response = await fetch("/api/s3-presign", {
				method: "POST",
				body: JSON.stringify({
					fileName: file.name,
					fileType: file.type,
				}),
			});

			if (!response.ok) {
				throw new Error("Failed to get upload URL");
			}

			const { url, key, error } = await response.json();
			if (error) throw new Error(error);
			if (!url || !key) throw new Error("Invalid response from server");

			// Upload to S3 with progress tracking
			setUploadProgress((prev) => ({
				...prev,
				[uploadId]: { progress: 0, state: "uploading" },
			}));

			const uploadResponse = await fetch(url, {
				method: "PUT",
				body: file,
				headers: {
					"Content-Type": file.type,
				},
			});

			if (!uploadResponse.ok) {
				throw new Error("Failed to upload file");
			}

			// Create file record in database using server action
			const fileRecord = await attachFileToMessage(
				messageId,
				key,
				file.name,
				file.type,
				file.size,
			);

			// Update progress to done
			setUploadProgress((prev) => ({
				...prev,
				[uploadId]: { progress: 100, state: "done" },
			}));

			return key;
		} catch (error) {
			console.error("Upload error:", error);
			setUploadProgress((prev) => ({
				...prev,
				[uploadId]: {
					progress: 0,
					state: "error",
					error: error instanceof Error ? error.message : "Upload failed",
				},
			}));
			throw error;
		}
	};

	return {
		uploadFile,
		uploadProgress,
	};
};
