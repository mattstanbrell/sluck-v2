import { NextResponse } from "next/server";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { createClient } from "@/utils/supabase/server";
import { logDB } from "@/utils/logging";

export async function POST(request: Request) {
	try {
		const { fileKey } = await request.json();

		// Optionally, verify user can view this file.
		const supabase = await createClient();
		const {
			data: { user },
			error,
		} = await supabase.auth.getUser();
		if (error || !user) {
			return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
		}

		// Query "files" table. If RLS denies it, no rows are returned.
		const { data: fileRow, error: fileError } = await supabase
			.from("files")
			.select("*")
			.eq("file_url", fileKey)
			.single();

		logDB({
			operation: "SELECT",
			table: "files",
			description: `Verifying access to file ${fileKey}`,
			result: fileRow,
			error: fileError,
		});

		if (!fileRow) {
			return NextResponse.json(
				{ error: "File not found or unauthorized" },
				{ status: 404 },
			);
		}

		// Create S3 client
		const s3Client = new S3Client({
			region: process.env.AWS_S3_REGION,
			credentials: {
				accessKeyId: process.env.AWS_S3_ACCESS_KEY_ID ?? "",
				secretAccessKey: process.env.AWS_S3_SECRET_ACCESS_KEY ?? "",
			},
		});

		// Create GET command
		const command = new GetObjectCommand({
			Bucket: process.env.AWS_S3_BUCKET_NAME,
			Key: fileKey,
		});

		// Presigned URL valid for 60 seconds
		const downloadURL = await getSignedUrl(s3Client, command, {
			expiresIn: 60,
		});

		return NextResponse.json({ downloadURL });
	} catch (error) {
		return NextResponse.json(
			{ error: error instanceof Error ? error.message : "Unknown error" },
			{ status: 500 },
		);
	}
}
