import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { createClient } from "@/utils/supabase/server";
import { nanoid } from "nanoid";
import { logDB } from "@/utils/logging";

export async function POST(request: Request) {
	try {
		const supabase = await createClient();
		const { fileName, fileType } = await request.json();

		// Authenticate user
		const {
			data: { user },
			error: authError,
		} = await supabase.auth.getUser();

		logDB({
			operation: "SELECT",
			table: "auth.users",
			description: "Verifying user authentication for file upload",
			error: authError,
			result: user ? { id: user.id } : null,
		});

		if (!user) {
			return Response.json({ error: "Unauthorized" }, { status: 401 });
		}

		// Validate required environment variables
		const region = process.env.AWS_S3_REGION;
		const accessKeyId = process.env.AWS_S3_ACCESS_KEY_ID;
		const secretAccessKey = process.env.AWS_S3_SECRET_ACCESS_KEY;
		const bucketName = process.env.AWS_S3_BUCKET_NAME;

		if (!region || !accessKeyId || !secretAccessKey || !bucketName) {
			throw new Error("Missing required AWS configuration");
		}

		// Generate unique key with user's ID for isolation
		const key = `uploads/${user.id}/${nanoid()}-${fileName}`;

		// Create S3 client
		const s3Client = new S3Client({
			region,
			credentials: {
				accessKeyId,
				secretAccessKey,
			},
		});

		// Generate presigned URL
		const command = new PutObjectCommand({
			Bucket: bucketName,
			Key: key,
			ContentType: fileType,
			// Optional: Add metadata like original filename
			Metadata: {
				originalName: fileName,
			},
		});

		const url = await getSignedUrl(s3Client, command, { expiresIn: 3600 });

		return Response.json({ url, key });
	} catch (error) {
		return Response.json(
			{
				error:
					error instanceof Error
						? error.message
						: "Failed to generate upload URL",
			},
			{ status: 500 },
		);
	}
}
