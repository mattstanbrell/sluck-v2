"use server";

import { createClient } from "@/utils/supabase/server";
import type { DatabaseFile } from "@/types/message";
import type { ProfileResponse } from "@/types/profile";
import { S3Client } from "@aws-sdk/client-s3";
import { processImageFile } from "./images";
import { processAudioFile } from "./audio";
import { processVideoFile } from "./video";

// Type for message response with single profile
interface MessageResponse {
	channel_id: string | null;
	conversation_id: string | null;
	profile: ProfileResponse;
	channels?: {
		id: string;
		name: string;
	}[];
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
			profile:profiles!user_id (
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

	const typedMessage = message as MessageResponse;
	const senderName =
		typedMessage.profile?.display_name ||
		typedMessage.profile?.full_name ||
		"Unknown User";
	const channelInfo = message.channels?.[0]?.name
		? `${message.channels[0].name} channel`
		: "a direct message";
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

	// Process file based on type
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
	} else if (fileType.startsWith("audio/")) {
		try {
			await processAudioFile(
				inserted.id,
				fileKey,
				fileName,
				senderName,
				channelInfo,
				timestamp,
			);
		} catch (error) {
			console.error("[attachFileToMessage] Audio processing failed:", error);
		}
	} else if (fileType.startsWith("video/")) {
		try {
			await processVideoFile(
				inserted.id,
				fileKey,
				fileName,
				senderName,
				channelInfo,
				timestamp,
			);
		} catch (error) {
			console.error("[attachFileToMessage] Video processing failed:", error);
		}
	}

	return inserted;
}
