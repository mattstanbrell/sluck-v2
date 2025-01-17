"use server";

import { GoogleGenerativeAI } from "@google/generative-ai";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { createClient } from "@/utils/supabase/server";
import { generateEmbeddings } from "@/utils/embeddings";
import type { DatabaseFile } from "@/types/message";

if (!process.env.GOOGLE_API_KEY) {
	throw new Error("Missing GOOGLE_API_KEY");
}

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

export async function generateImageCaptionAndDescription(
	imageUrl: string,
): Promise<{ caption: string; description: string }> {
	console.log(
		"[generateImageCaptionAndDescription] Starting image analysis...",
	);
	try {
		// Fetch the image data
		console.log(
			"[generateImageCaptionAndDescription] Fetching image data from URL:",
			imageUrl,
		);
		const imageResponse = await fetch(imageUrl);
		const imageBuffer = await imageResponse.arrayBuffer();
		const base64Image = Buffer.from(imageBuffer).toString("base64");
		const mimeType = imageResponse.headers.get("content-type") || "image/jpeg";
		console.log(
			"[generateImageCaptionAndDescription] Image fetched successfully:",
			{
				mimeType,
				sizeKB: Math.round(imageBuffer.byteLength / 1024),
			},
		);

		const model = genAI.getGenerativeModel({
			model: "gemini-2.0-flash-exp", // This model came out late 2024, don't change!!
		});
		console.log(
			"[generateImageCaptionAndDescription] Initialized Gemini model",
		);

		// Get a caption (short, focused description)
		console.log("[generateImageCaptionAndDescription] Generating caption...");
		const captionResult = await model.generateContent([
			{
				inlineData: {
					data: base64Image,
					mimeType,
				},
			},
			"Generate a concise caption (1 sentence) for this image that captures its key content. Keep it under 100 characters.",
		]);
		const caption = captionResult.response.text().trim();
		console.log(
			"[generateImageCaptionAndDescription] Caption generated:",
			caption,
		);

		// Get a detailed description (more comprehensive)
		console.log(
			"[generateImageCaptionAndDescription] Generating detailed description...",
		);
		const descriptionResult = await model.generateContent([
			{
				inlineData: {
					data: base64Image,
					mimeType,
				},
			},
			"Describe this image in a way that would be useful for semantic search. Be concise (under 50 words) and focus on what people might search for. Include key objects, actions, colors, and notable details. Do not include technical analysis or compositional details.",
		]);
		const description = descriptionResult.response.text().trim();
		console.log(
			"[generateImageCaptionAndDescription] Description generated:",
			description,
		);

		return { caption, description };
	} catch (error) {
		console.error("[generateImageCaptionAndDescription] Error:", error);
		throw error;
	}
}

export async function processImageFile(
	fileId: string,
	fileKey: string,
	fileName: string,
	senderName: string,
	channelInfo: string,
	timestamp: string,
): Promise<void> {
	console.log("[processImageFile] Starting image processing...");
	const supabase = await createClient();

	try {
		console.log("[processImageFile] Starting image processing for:", fileId);

		// Get presigned URL for the image
		const command = new GetObjectCommand({
			Bucket: bucketName,
			Key: fileKey,
		});

		const downloadURL = await getSignedUrl(s3Client, command, {
			expiresIn: 60,
		});

		// Generate caption and description
		const { caption, description } =
			await generateImageCaptionAndDescription(downloadURL);

		// Update the file record with just the caption first
		console.log("[processImageFile] Updating file with caption:", {
			fileId,
			hasCaption: !!caption,
		});

		const { error: captionUpdateError } = await supabase
			.from("files")
			.update({ caption })
			.eq("id", fileId);

		if (captionUpdateError) {
			console.error("[processImageFile] Failed to update file with caption:", {
				error: captionUpdateError,
				fileId,
				caption: caption.substring(0, 50),
			});
			throw captionUpdateError;
		}

		// Format the description for search
		const formattedDescription = `${senderName} shared ${fileName} ${channelInfo} on ${timestamp}. Image description: ${description}`;

		// Generate embedding from the formatted description
		const embeddings = await generateEmbeddings(
			[formattedDescription],
			"document",
		);
		const embedding = embeddings[0];

		// Update the file record with the description and embedding
		console.log(
			"[processImageFile] Updating file with description and embedding:",
			{
				fileId,
				hasDescription: !!formattedDescription,
				hasEmbedding: !!embedding,
			},
		);

		const { data: updated, error: updateError } = await supabase
			.from("files")
			.update({
				description: formattedDescription,
				embedding,
			})
			.eq("id", fileId)
			.select()
			.single();

		if (updateError) {
			console.error(
				"[processImageFile] Failed to update file with description:",
				{
					error: updateError,
					fileId,
					descriptionLength: formattedDescription.length,
				},
			);
			throw updateError;
		}

		console.log("[processImageFile] Database update result:", {
			fileId,
			updatedCaption: updated?.caption?.substring(0, 50),
			hasUpdatedDescription: !!updated?.description,
			hasUpdatedEmbedding: !!updated?.embedding,
		});

		console.log("[processImageFile] File record updated successfully:", fileId);
		console.log("[processImageFile] Image processing complete for:", fileId);
	} catch (error) {
		console.error("[processImageFile] Image processing failed:", error);
		throw error;
	}
}
