"use server";

import { createClient } from "@/utils/supabase/server";
import type { DatabaseFile } from "@/types/message";
import { S3Client } from "@aws-sdk/client-s3";
import { processImageFile } from "./images";

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
		try {
			await processImageFile(
				inserted.id,
				fileKey,
				fileName,
				senderName,
				channelInfo,
				timestamp,
			);
		} catch (error) {
			console.error("[attachFileToMessage] Image processing failed:", error);
		}
	}

	return inserted;
}
