"use server";

import { createClient } from "@/utils/supabase/server";
import type { DatabaseFile } from "@/types/message";
import { generateEmbeddings } from "@/utils/embeddings";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

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

async function generateImageCaptionAndDescription(
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

export async function attachFileToMessage(
	messageId: string,
	fileKey: string,
	fileName: string,
	fileType: string,
	fileSize: number,
): Promise<DatabaseFile> {
	console.log("[attachFileToMessage] Starting file attachment process:", {
		messageId,
		fileName,
		fileType,
		fileSize,
	});

	const supabase = await createClient();

	// Get the current user and message details
	console.log(
		"[attachFileToMessage] Authenticating user and getting message details...",
	);
	const {
		data: { user },
		error: userError,
	} = await supabase.auth.getUser();
	if (userError || !user) {
		console.error("[attachFileToMessage] Authentication failed:", userError);
		throw new Error("Unauthorized");
	}

	// Get message details to format the description
	const { data: message } = await supabase
		.from("messages")
		.select(`
			channel_id,
			conversation_id,
			profiles!user_id (
				id,
				display_name,
				full_name
			),
			channels!channel_id (
				id,
				name
			)
		`)
		.eq("id", messageId)
		.single();

	if (!message) {
		throw new Error("Message not found");
	}

	const senderName =
		message.profiles?.[0]?.display_name ||
		message.profiles?.[0]?.full_name ||
		"Unknown User";
	const channelInfo = message.channels?.[0]?.name
		? `in ${message.channels[0].name} channel`
		: "in a direct message";
	const timestamp = new Date().toLocaleDateString("en-GB", {
		weekday: "long",
		day: "numeric",
		month: "long",
		year: "numeric",
	});

	// Insert file record immediately without caption/description
	console.log("[attachFileToMessage] Inserting initial file record...");
	const { data: inserted, error: insertError } = await supabase
		.from("files")
		.insert({
			message_id: messageId,
			file_name: fileName,
			file_type: fileType,
			file_size: fileSize,
			file_url: fileKey,
		})
		.select()
		.single();

	if (insertError) {
		console.error(
			"[attachFileToMessage] Database insertion failed:",
			insertError,
		);
		throw new Error(insertError.message);
	}

	console.log(
		"[attachFileToMessage] Initial file record inserted successfully:",
		inserted.id,
	);

	// For images, process caption/description/embedding in the background
	if (fileType.startsWith("image/")) {
		console.log("[attachFileToMessage] Starting image processing...");
		try {
			console.log(
				"[attachFileToMessage] Starting image processing for:",
				inserted.id,
			);

			// Get presigned URL for the image
			const command = new GetObjectCommand({
				Bucket: bucketName,
				Key: fileKey,
			});

			const downloadURL = await getSignedUrl(s3Client, command, {
				expiresIn: 60,
			});

			// Generate caption and description
			const { caption } = await generateImageCaptionAndDescription(downloadURL);

			// Update the file record with just the caption first
			console.log("[attachFileToMessage] Updating file with caption:", {
				fileId: inserted.id,
				hasCaption: !!caption,
			});

			const { error: captionUpdateError } = await supabase
				.from("files")
				.update({ caption })
				.eq("id", inserted.id);

			if (captionUpdateError) {
				console.error(
					"[attachFileToMessage] Failed to update file with caption:",
					{
						error: captionUpdateError,
						fileId: inserted.id,
						caption: caption.substring(0, 50),
					},
				);
				throw captionUpdateError;
			}

			// Now generate description and update with description + embedding
			const { description } =
				await generateImageCaptionAndDescription(downloadURL);

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
				"[attachFileToMessage] Updating file with description and embedding:",
				{
					fileId: inserted.id,
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
				.eq("id", inserted.id)
				.select()
				.single();

			if (updateError) {
				console.error(
					"[attachFileToMessage] Failed to update file with description:",
					{
						error: updateError,
						fileId: inserted.id,
						descriptionLength: formattedDescription.length,
					},
				);
				throw updateError;
			}

			console.log("[attachFileToMessage] Database update result:", {
				fileId: inserted.id,
				updatedCaption: updated?.caption?.substring(0, 50),
				hasUpdatedDescription: !!updated?.description,
				hasUpdatedEmbedding: !!updated?.embedding,
			});

			console.log(
				"[attachFileToMessage] File record updated successfully:",
				inserted.id,
			);
			console.log(
				"[attachFileToMessage] Image processing complete for:",
				inserted.id,
			);
		} catch (error) {
			console.error("[attachFileToMessage] Image processing failed:", error);
		}
	}

	return inserted;
}
