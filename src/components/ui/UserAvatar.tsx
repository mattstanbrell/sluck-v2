"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

interface UserAvatarProps {
	fullName: string | null;
	displayName?: string | null;
	avatarUrl?: string | null;
	avatarCache?: string | null;
	avatarColor?: string | null;
	className?: string;
	size?: "xs" | "sm" | "md" | "lg" | "xl";
}

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

	// Size mappings
	const sizeClasses = {
		xs: "h-6 w-6",
		sm: "h-8 w-8",
		md: "h-10 w-10",
		lg: "h-12 w-12",
		xl: "h-14 w-14",
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
			className={cn(sizeClasses[size], "rounded-xl", className)}
			style={{ "--avatar-color": resolvedColor } as CSSProperties}
		>
			<AvatarImage src={resolvedSrc} alt={fallbackName} />
			<AvatarFallback
				className="bg-custom-text-secondary text-white rounded-xl"
				style={{ backgroundColor: resolvedColor }}
			>
				{initials}
			</AvatarFallback>
		</Avatar>
	);
}
