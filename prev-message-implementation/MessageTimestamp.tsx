import { useMemo } from "react";
import { cn } from "@/lib/utils";

interface MessageTimestampProps {
	timestamp: string;
	className?: string;
	timeOnly?: boolean;
}

export default function MessageTimestamp({
	timestamp,
	className,
	timeOnly = false,
}: MessageTimestampProps) {
	const formattedTime = useMemo(() => {
		const date = new Date(timestamp);
		const now = new Date();
		const yesterday = new Date(now);
		yesterday.setDate(yesterday.getDate() - 1);

		// Format time to HH:mm, rounding down minutes
		const hours = date.getHours().toString().padStart(2, "0");
		const minutes = date.getMinutes().toString().padStart(2, "0");
		const timeStr = `${hours}:${minutes}`;

		if (timeOnly) {
			return timeStr;
		}

		// Check if it's today
		if (
			date.getDate() === now.getDate() &&
			date.getMonth() === now.getMonth() &&
			date.getFullYear() === now.getFullYear()
		) {
			return timeStr;
		}

		// Check if it's yesterday
		if (
			date.getDate() === yesterday.getDate() &&
			date.getMonth() === yesterday.getMonth() &&
			date.getFullYear() === yesterday.getFullYear()
		) {
			return `Yesterday, ${timeStr}`;
		}

		// Calculate days difference
		const diffTime = now.getTime() - date.getTime();
		const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

		// If less than 7 days ago, show day name
		if (diffDays < 7) {
			const days = [
				"Sunday",
				"Monday",
				"Tuesday",
				"Wednesday",
				"Thursday",
				"Friday",
				"Saturday",
			];
			return `${days[date.getDay()]}, ${timeStr}`;
		}

		// Otherwise show full date
		const day = date.getDate();
		const month = date.getMonth() + 1; // getMonth() returns 0-11
		const year = date.getFullYear();
		return `${day}/${month}/${year}, ${timeStr}`;
	}, [timestamp, timeOnly]);

	return (
		<span className={cn("text-xs text-gray-500", className)}>
			{formattedTime}
		</span>
	);
}
