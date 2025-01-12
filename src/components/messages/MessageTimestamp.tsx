interface MessageTimestampProps {
	timestamp: string;
	className?: string;
	hideColon?: boolean;
}

export function MessageTimestamp({
	timestamp,
	className = "",
	hideColon = false,
}: MessageTimestampProps) {
	const date = new Date(timestamp);
	const hours = date.getHours().toString().padStart(2, "0");
	const minutes = date.getMinutes().toString().padStart(2, "0");
	const formattedTime = hideColon
		? `${hours} ${minutes}`
		: `${hours}:${minutes}`;

	return (
		<span
			className={`text-xs text-custom-text-secondary font-mono ${className}`}
		>
			{formattedTime}
		</span>
	);
}
