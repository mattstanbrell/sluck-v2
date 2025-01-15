"use server";

import { createClient } from "@/utils/supabase/server";
import type { DatabaseFile } from "@/types/message";
import { logDB } from "@/utils/logging";

export async function attachFileToMessage(
	messageId: string,
	fileKey: string,
	fileName: string,
	fileType: string,
	fileSize: number,
): Promise<DatabaseFile> {
	const supabase = await createClient();

	// Get the current user
	const {
		data: { user },
		error: userError,
	} = await supabase.auth.getUser();
	if (userError || !user) {
		throw new Error("Unauthorized");
	}

	// Insert file record (RLS ensures user must own or have access to the message)
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

	logDB({
		operation: "INSERT",
		table: "files",
		description: `Attaching file ${fileName} to message ${messageId}`,
		result: inserted,
		error: insertError,
	});

	if (insertError) {
		throw new Error(insertError.message);
	}

	return inserted;
}
