"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { UserAvatarProps } from "@/types/profile";

export function UserAvatar({
	fullName,
	displayName,
	avatarUrl,
	avatarCache,
	avatarColor = "rgb(20, 148, 132)", // Default teal color
	className,
	size = "md", // Default size is medium
}: UserAvatarProps) {
	const [resolvedSrc, setResolvedSrc] = useState<string | undefined>(undefined);
	const fallbackName = displayName || fullName || "User";
	const resolvedColor = avatarColor || "rgb(20, 148, 132)";

	// Size mappings (using 25% border radius for consistent rounding)
	const sizeClasses = {
		"2xs": "h-5 w-5 rounded-[5px] text-xs", // 20px -> 5px radius
		xs: "h-6 w-6 rounded-[6px]", // 24px -> 6px radius
		sm: "h-8 w-8 rounded-[8px]", // 32px -> 8px radius
		md: "h-10 w-10 rounded-[10px]", // 40px -> 10px radius
		lg: "h-12 w-12 rounded-[12px]", // 48px -> 12px radius
		xl: "h-14 w-14 rounded-[14px]", // 56px -> 14px radius
	};

	useEffect(() => {
		if (!avatarUrl) {
			// If there's no avatarUrl, check if we have a base64 cache
			if (avatarCache) {
				setResolvedSrc(`data:image/jpeg;base64,${avatarCache}`);
			}
			return;
		}

		// Attempt to load avatarUrl
		const img = new Image();
		img.onload = () => {
			setResolvedSrc(avatarUrl);
		};
		img.onerror = () => {
			// If that fails, try the cache
			if (avatarCache) {
				setResolvedSrc(`data:image/jpeg;base64,${avatarCache}`);
			} else {
				setResolvedSrc(undefined);
			}
		};
		img.src = avatarUrl;
	}, [avatarUrl, avatarCache]);

	// Generate initials
	const initials = fallbackName
		.split(" ")
		.map((part) => part[0])
		.slice(0, 2)
		.join("")
		.toUpperCase();

	return (
		<Avatar
			className={cn(sizeClasses[size], className)}
			style={{ "--avatar-color": resolvedColor } as CSSProperties}
		>
			<AvatarImage src={resolvedSrc} alt={fallbackName} />
			<AvatarFallback
				className="text-white"
				style={{
					backgroundColor: resolvedColor,
					borderRadius: "inherit",
				}}
			>
				{initials}
			</AvatarFallback>
		</Avatar>
	);
}
