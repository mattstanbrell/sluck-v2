"use server";

import { GoogleGenerativeAI } from "@google/generative-ai";
import { GoogleAIFileManager, FileState } from "@google/generative-ai/server";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { createClient } from "@/utils/supabase/server";
import { generateEmbeddings } from "@/utils/embeddings";
import { writeFile, unlink } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

if (!process.env.GOOGLE_API_KEY) {
	throw new Error("Missing GOOGLE_API_KEY");
}

// Initialize file manager
const fileManager = new GoogleAIFileManager(process.env.GOOGLE_API_KEY);

// Validate required AWS environment variables
const region = process.env.AWS_S3_REGION;
const accessKeyId = process.env.AWS_S3_ACCESS_KEY_ID;
const secretAccessKey = process.env.AWS_S3_SECRET_ACCESS_KEY;
const bucketName = process.env.AWS_S3_BUCKET_NAME;

if (!region || !accessKeyId || !secretAccessKey || !bucketName) {
	throw new Error("Missing required AWS configuration");
}

const s3Client = new S3Client({
	region,
	credentials: {
		accessKeyId,
		secretAccessKey,
	},
});

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);

async function processVideoWithGemini(
	videoUrl: string,
	fileName: string,
	fileId: string,
	supabaseClient: SupabaseClient<Database>,
): Promise<{ description: string; fileUri: string; mimeType: string }> {
	console.log("[processVideoWithGemini] Starting video analysis...");
	let tempFilePath: string | null = null;

	try {
		// Fetch the video data
		console.log(
			"[processVideoWithGemini] Fetching video data from URL:",
			videoUrl,
		);
		const videoResponse = await fetch(videoUrl);
		const videoBuffer = await videoResponse.arrayBuffer();
		const mimeType = videoResponse.headers.get("content-type") || "video/mp4";

		// Create a temporary file
		tempFilePath = join(tmpdir(), fileName);
		await writeFile(tempFilePath, Buffer.from(videoBuffer));
		console.log(
			"[processVideoWithGemini] Created temporary file:",
			tempFilePath,
		);

		// Upload the video file
		console.log("[processVideoWithGemini] Uploading video to Gemini...");
		const uploadResult = await fileManager.uploadFile(tempFilePath, {
			mimeType,
			displayName: fileName,
		});

		// Wait for processing
		let file = await fileManager.getFile(uploadResult.file.name);
		while (file.state === FileState.PROCESSING) {
			process.stdout.write(".");
			await new Promise((resolve) => setTimeout(resolve, 10_000));
			file = await fileManager.getFile(uploadResult.file.name);
		}

		if (file.state === FileState.FAILED) {
			throw new Error("Video processing failed.");
		}

		console.log(
			`[processVideoWithGemini] Video processed successfully: ${uploadResult.file.uri}`,
		);

		// Generate caption and update immediately
		const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash-exp" });

		// Generate concise caption
		console.log("[processVideoWithGemini] Generating caption...");
		const captionResult = await model.generateContent([
			{
				text: `Generate a single short sentence summarizing what this video shows. Be direct and factual. This will be displayed under the video as a quick preview. Include no other text in your response.`,
			},
			{
				fileData: {
					fileUri: uploadResult.file.uri,
					mimeType: uploadResult.file.mimeType,
				},
			},
		]);

		const caption = captionResult.response.text().trim();
		console.log("[processVideoWithGemini] Caption generated:", caption);

		// Update caption immediately
		console.log("[processVideoWithGemini] Updating file with caption...");
		const { error: captionError } = await supabaseClient
			.from("files")
			.update({ caption })
			.eq("id", fileId);

		if (captionError) {
			console.error(
				"[processVideoWithGemini] Failed to update caption:",
				captionError,
			);
			// Continue processing despite caption update error
		}

		// Generate detailed description
		console.log("[processVideoWithGemini] Generating detailed description...");
		const descriptionResult = await model.generateContent([
			{
				text: `Provide a detailed description of this video in 2-3 paragraphs. Focus on the key events, visual content, and any dialogue or text shown. Be specific but concise. Include no other text in your response.`,
			},
			{
				fileData: {
					fileUri: uploadResult.file.uri,
					mimeType: uploadResult.file.mimeType,
				},
			},
		]);

		const description = descriptionResult.response.text().trim();
		console.log("[processVideoWithGemini] Description generated");

		return {
			description,
			fileUri: uploadResult.file.uri,
			mimeType: uploadResult.file.mimeType,
		};
	} finally {
		// Clean up temporary file if it exists
		if (tempFilePath) {
			try {
				await unlink(tempFilePath);
				console.log("[processVideoWithGemini] Cleaned up temp file");
			} catch (cleanupError) {
				console.error(
					"[processVideoWithGemini] Error cleaning up temp file:",
					cleanupError,
				);
			}
		}
	}
}

export async function processVideoFile(
	fileId: string,
	fileKey: string,
	fileName: string,
	senderName: string,
	channelInfo: string,
	timestamp: string,
): Promise<void> {
	console.log("[processVideoFile] Starting video processing...");
	const supabaseClient = await createClient();

	try {
		// Get presigned URL for the video
		const command = new GetObjectCommand({
			Bucket: bucketName,
			Key: fileKey,
		});

		const downloadURL = await getSignedUrl(s3Client, command, {
			expiresIn: 60,
		});

		// Process video and get description
		const { description, fileUri, mimeType } = await processVideoWithGemini(
			downloadURL,
			fileName,
			fileId,
			supabaseClient,
		);

		// Format the content for search
		const formattedContent = `[${senderName} shared '${fileName}' in ${channelInfo} on ${timestamp}. Video content: ${description}]`;

		// Generate embedding from the formatted content
		const embeddings = await generateEmbeddings([formattedContent], "document");
		const embedding = embeddings[0];

		// Update the file record with the description and embedding
		console.log(
			"[processVideoFile] Updating file with description and embedding:",
			{
				fileId,
				hasDescription: !!formattedContent,
				hasEmbedding: !!embedding,
			},
		);

		const { data: updated, error: updateError } = await supabaseClient
			.from("files")
			.update({
				description: formattedContent,
				embedding,
			})
			.eq("id", fileId)
			.select()
			.single();

		if (updateError) {
			console.error(
				"[processVideoFile] Failed to update file with description and embedding:",
				{
					error: updateError,
					fileId,
				},
			);
			throw updateError;
		}

		console.log("[processVideoFile] Database update result:", {
			fileId,
			hasUpdatedDescription: !!updated?.description,
			hasUpdatedEmbedding: !!updated?.embedding,
		});

		// Clean up the Gemini file now that we're done with it
		try {
			const fileNameParts = fileUri.split("/");
			const geminiFileName = fileNameParts[fileNameParts.length - 1];
			await fileManager.deleteFile(geminiFileName);
			console.log("[processVideoFile] Cleaned up Gemini file");
		} catch (deleteError) {
			console.error(
				"[processVideoFile] Error deleting Gemini file:",
				deleteError,
			);
			// Non-fatal error, continue
		}

		console.log("[processVideoFile] Video processing complete for:", fileId);
	} catch (error) {
		console.error("[processVideoFile] Video processing failed:", error);
		throw error;
	}
}
