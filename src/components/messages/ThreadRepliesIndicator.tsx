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
			onClick={onClick}
			onKeyDown={handleKeyDown}
			className={`group flex items-center gap-2 rounded-md px-2 py-1 ${textColorClass}`}
			tabIndex={0}
		>
			<ListEnd className="h-4 w-4 -scale-x-100" />
			{displayedProfiles.length > 0 && (
				<div className="flex -space-x-2 ml-1">
					{displayedProfiles.map((profile) => (
						<UserAvatar
							key={profile.id}
							fullName={profile.full_name}
							displayName={profile.display_name}
							avatarUrl={profile.avatar_url}
							avatarCache={profile.avatar_cache}
							size="xs"
						/>
					))}
				</div>
			)}
		</button>
	);
}
