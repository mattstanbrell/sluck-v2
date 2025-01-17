"use server";

import { createClient } from "@/utils/supabase/server";
import type { DatabaseFile } from "@/types/message";
import { processImageFile } from "./images";
import { processAudioFile } from "./audio";
import { processVideoFile } from "./video";

interface DatabaseMessageResponse {
	channel_id: string | null;
	conversation_id: string | null;
	profile: {
		id: string;
		display_name: string | null;
		full_name: string | null;
	};
	channels?: {
		id: string;
		name: string;
	};
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
	const { data: message, error } = await supabase
		.from("messages")
		.select(`
			channel_id,
			conversation_id,
			profile:profiles(id, display_name, full_name),
			channels(id, name)
		`)
		.eq("id", messageId)
		.single();

	if (error || !message) {
		throw new Error("Message not found");
	}

	const typedMessage = message as unknown as DatabaseMessageResponse;
	console.log("[attachFileToMessage] Typed message:", typedMessage);
	// 	[attachFileToMessage] Typed message: {
	//   channel_id: 'a027d5ff-eb58-410b-baf6-6eb30888e531',
	//   conversation_id: null,
	//   profile: {
	//     id: '74be0c05-798f-4ed3-b7a5-9e02d5b52420',
	//     full_name: 'Matt Stanbrell',
	//     display_name: 'Matt Stanbrell'
	//   },
	//   channels: { id: 'a027d5ff-eb58-410b-baf6-6eb30888e531', name: 'another-test' }
	// }
	const senderName =
		typedMessage.profile?.display_name ||
		typedMessage.profile?.full_name ||
		"Unknown User";
	const channelInfo = typedMessage.channels?.name
		? `${typedMessage.channels.name} channel`
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
