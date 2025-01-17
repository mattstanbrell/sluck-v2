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

async function processAudioWithGemini(
	audioUrl: string,
	fileName: string,
): Promise<{ caption: string; fileUri: string; mimeType: string }> {
	console.log("[processAudioWithGemini] Starting audio analysis...");
	let tempFilePath: string | null = null;

	try {
		// Fetch the audio data
		console.log(
			"[processAudioWithGemini] Fetching audio data from URL:",
			audioUrl,
		);
		const audioResponse = await fetch(audioUrl);
		const audioBuffer = await audioResponse.arrayBuffer();
		const mimeType = audioResponse.headers.get("content-type") || "audio/mp3";

		// Create a temporary file
		tempFilePath = join(tmpdir(), fileName);
		await writeFile(tempFilePath, Buffer.from(audioBuffer));
		console.log(
			"[processAudioWithGemini] Created temporary file:",
			tempFilePath,
		);

		// Upload the audio file
		console.log("[processAudioWithGemini] Uploading audio to Gemini...");
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
			throw new Error("Audio processing failed.");
		}

		console.log(
			`[processAudioWithGemini] Audio processed successfully: ${uploadResult.file.uri}`,
		);

		// Generate caption using the processed file
		const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash-exp" });

		// Generate concise caption
		console.log("[processAudioWithGemini] Generating caption...");
		const captionResult = await model.generateContent([
			{
				text: `Generate a single short sentence summarizing the key content of this audio file '${fileName}'. Be direct and factual. This will be displayed under the audio as a quick summary. Include speaker names if known. Include no other text in your response.`,
			},
			{
				fileData: {
					fileUri: uploadResult.file.uri,
					mimeType: uploadResult.file.mimeType,
				},
			},
		]);

		const caption = captionResult.response.text().trim();
		console.log("[processAudioWithGemini] Caption generated:", caption);

		return {
			caption,
			fileUri: uploadResult.file.uri,
			mimeType: uploadResult.file.mimeType,
		};
	} finally {
		// Clean up temporary file if it exists
		if (tempFilePath) {
			try {
				await unlink(tempFilePath);
			} catch (cleanupError) {
				console.error(
					"[processAudioWithGemini] Error cleaning up temp file:",
					cleanupError,
				);
			}
		}
	}
}

async function generateAudioDescription(
	fileUri: string,
	mimeType: string,
	fileName: string,
): Promise<string> {
	console.log("[generateAudioDescription] Generating description...");
	const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash-exp" });

	const descriptionResult = await model.generateContent([
		{
			text: `Describe the content and context of this audio file '${fileName}' in 2-3 sentences. Focus on what is being discussed and the interaction between speakers. Include speaker names if known. Include no other text in your response.`,
		},
		{
			fileData: {
				fileUri,
				mimeType,
			},
		},
	]);

	const description = descriptionResult.response.text().trim();
	console.log("[generateAudioDescription] Description generated:", description);
	return description;
}

export async function processAudioFile(
	fileId: string,
	fileKey: string,
	fileName: string,
	senderName: string,
	channelInfo: string,
	timestamp: string,
): Promise<void> {
	console.log("[processAudioFile] Starting audio processing...");
	const supabase = await createClient();

	try {
		console.log("[processAudioFile] Starting audio processing for:", fileId);

		// Get presigned URL for the audio
		const command = new GetObjectCommand({
			Bucket: bucketName,
			Key: fileKey,
		});

		const downloadURL = await getSignedUrl(s3Client, command, {
			expiresIn: 60,
		});

		// Process audio and get caption immediately
		const { caption, fileUri, mimeType } = await processAudioWithGemini(
			downloadURL,
			fileName,
		);

		// Update caption immediately
		console.log("[processAudioFile] Updating file with caption:", {
			fileId,
			hasCaption: !!caption,
		});

		const { error: captionUpdateError } = await supabase
			.from("files")
			.update({ caption })
			.eq("id", fileId);

		if (captionUpdateError) {
			console.error("[processAudioFile] Failed to update file with caption:", {
				error: captionUpdateError,
				fileId,
				caption: caption.substring(0, 50),
			});
			throw captionUpdateError;
		}

		// Generate description using the already processed file
		const description = await generateAudioDescription(
			fileUri,
			mimeType,
			fileName,
		);

		// Format the full text for embedding (including metadata)
		const textForEmbedding = `[${senderName} shared '${fileName}' in ${channelInfo} on ${timestamp}. Audio description: ${description}]`;

		// Generate embedding from the formatted text
		const embeddings = await generateEmbeddings([textForEmbedding], "document");
		const embedding = embeddings[0];

		// Update the file record with just the raw description and embedding
		console.log(
			"[processAudioFile] Updating file with description and embedding:",
			{
				fileId,
				hasDescription: !!description,
				hasEmbedding: !!embedding,
			},
		);

		const { data: updated, error: updateError } = await supabase
			.from("files")
			.update({
				description,
				embedding,
			})
			.eq("id", fileId)
			.select()
			.single();

		if (updateError) {
			console.error(
				"[processAudioFile] Failed to update file with description:",
				{
					error: updateError,
					fileId,
					descriptionLength: description.length,
				},
			);
			throw updateError;
		}

		console.log("[processAudioFile] Database update result:", {
			fileId,
			updatedCaption: updated?.caption?.substring(0, 50),
			hasUpdatedDescription: !!updated?.description,
			hasUpdatedEmbedding: !!updated?.embedding,
		});

		console.log("[processAudioFile] File record updated successfully:", fileId);
		console.log("[processAudioFile] Audio processing complete for:", fileId);
	} catch (error) {
		console.error("[processAudioFile] Audio processing failed:", error);
		throw error;
	}
}
