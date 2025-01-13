import { useState, useCallback } from "react";

export function useFileUrl(fileKey: string | null) {
	const [url, setUrl] = useState<string | null>(null);
	const [error, setError] = useState<Error | null>(null);
	const [isLoading, setIsLoading] = useState(false);
	const [lastFetch, setLastFetch] = useState(0);

	const getUrl = useCallback(
		async (force = false) => {
			if (!fileKey) {
				setUrl(null);
				return null;
			}

			// If we have a URL and it's less than 50 seconds old, return it
			if (!force && url && Date.now() - lastFetch < 50000) {
				return url;
			}

			setIsLoading(true);

			try {
				const response = await fetch("/api/s3-get", {
					method: "POST",
					body: JSON.stringify({ fileKey }),
				});

				if (!response.ok) {
					throw new Error("Failed to get file URL");
				}

				const { downloadURL, error } = await response.json();
				if (error) throw new Error(error);
				if (!downloadURL) throw new Error("No URL returned");

				setUrl(downloadURL);
				setLastFetch(Date.now());
				setError(null);
				return downloadURL;
			} catch (err) {
				console.error("Error getting file URL:", err);
				const error =
					err instanceof Error ? err : new Error("Failed to get file URL");
				setError(error);
				return null;
			} finally {
				setIsLoading(false);
			}
		},
		[fileKey, url, lastFetch],
	);

	return { url, error, isLoading, getUrl };
}
