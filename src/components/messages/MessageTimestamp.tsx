import { format, isToday, isYesterday, differenceInDays } from "date-fns";

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
	const time = hideColon ? `${hours} ${minutes}` : `${hours}:${minutes}`;

	let displayText = time;

	// Only format initial messages (when not hiding colon)
	if (!hideColon) {
		if (isToday(date)) {
			displayText = time;
		} else if (isYesterday(date)) {
			displayText = `Yesterday, ${time}`;
		} else {
			const daysDifference = differenceInDays(new Date(), date);
			if (daysDifference < 7) {
				displayText = format(date, "EEEE, HH:mm");
			} else {
				displayText = format(date, "dd/MM/yyyy, HH:mm");
			}
		}
	}

	return (
		<span
			className={`text-xs text-custom-text-secondary font-mono ${className}`}
		>
			{displayText}
		</span>
	);
}
