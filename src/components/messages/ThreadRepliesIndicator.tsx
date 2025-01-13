import { ListEnd } from "lucide-react";
import { UserAvatar } from "@/components/ui/UserAvatar";
import type { ProfileWithId } from "@/types/profile";

type Profile = ProfileWithId;

interface ThreadRepliesIndicatorProps {
	messageId: string;
	replyUserIds: string[];
	profiles: Record<string, Profile>;
	onClick: () => void;
	highlightedMessageId?: string;
}

export function ThreadRepliesIndicator({
	messageId,
	replyUserIds,
	profiles,
	onClick,
	highlightedMessageId,
}: ThreadRepliesIndicatorProps) {
	const displayedProfiles = replyUserIds
		.map((id) => profiles[id])
		.filter(Boolean)
		.slice(0, 3);

	const handleKeyDown = (e: React.KeyboardEvent) => {
		if (e.key === "Enter" || e.key === " ") {
			onClick();
		}
	};

	const textColorClass =
		highlightedMessageId === messageId
			? "text-custom-text-secondary"
			: "text-custom-text-tertiary group-hover:text-custom-text-secondary";

	return (
		<button
			type="button"
			className="flex items-center gap-1.5 hover:text-custom-text text-custom-text-tertiary mt-1 ml-3.5 w-fit text-xs transition-colors"
			onClick={onClick}
			onKeyDown={handleKeyDown}
		>
			<ListEnd className={`h-4 w-4 -scale-x-100 ${textColorClass}`} />
			<div className="flex -space-x-1">
				{displayedProfiles.map((profile) => (
					<UserAvatar
						key={profile.id}
						fullName={profile.full_name || "User"}
						displayName={profile.display_name}
						avatarUrl={profile.avatar_url}
						avatarCache={profile.avatar_cache}
						avatarColor={profile.avatar_color}
						size="2xs"
						className="ring-1 ring-custom-background"
					/>
				))}
			</div>
		</button>
	);
}
