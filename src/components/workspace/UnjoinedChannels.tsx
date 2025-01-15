import { useState } from "react";
import Link from "next/link";
import { ChevronDown, ChevronRight } from "lucide-react";
import { usePathname } from "next/navigation";
import type { ChannelBasic } from "@/types/channel";

interface UnjoinedChannelsProps {
	channels: ChannelBasic[];
	workspaceSlug: string;
	workspaceId: string;
}

export function UnjoinedChannels({
	channels,
	workspaceSlug,
	workspaceId,
}: UnjoinedChannelsProps) {
	const [isExpanded, setIsExpanded] = useState(false);
	const pathname = usePathname();

	if (channels.length === 0) return null;

	return (
		<div className="mt-2">
			<button
				type="button"
				onClick={() => setIsExpanded(!isExpanded)}
				className="flex items-center px-2 py-1 text-sm text-custom-text-secondary hover:text-custom-text w-full"
			>
				{isExpanded ? (
					<ChevronDown className="h-4 w-4 mr-1" />
				) : (
					<ChevronRight className="h-4 w-4 mr-1" />
				)}
				{channels.length} more {channels.length === 1 ? "channel" : "channels"}
			</button>

			{isExpanded && (
				<div className="mt-1 space-y-1">
					{channels.map((channel) => {
						const channelUrl = `/workspace/${workspaceSlug}/channel/${channel.slug}?channelId=${channel.id}&channelName=${encodeURIComponent(channel.name)}${channel.description ? `&description=${encodeURIComponent(channel.description)}` : ""}&isMember=false&workspaceId=${workspaceId}`;
						const basePath = `/workspace/${workspaceSlug}/channel/${channel.slug}`;
						const isActive = pathname === basePath;

						return (
							<Link
								key={channel.id}
								href={channelUrl}
								className={`flex items-center px-2 py-1 text-sm rounded-md hover:bg-custom-ui-faint group ml-2 ${
									isActive ? "bg-custom-ui-faint" : ""
								}`}
							>
								<span
									className={`${
										isActive
											? "text-custom-text-secondary"
											: "text-custom-text-tertiary"
									} group-hover:text-custom-text-secondary`}
								>
									#
								</span>
								<span
									className={`ml-2 ${
										isActive ? "text-custom-text" : "text-custom-text-tertiary"
									} group-hover:text-custom-text`}
								>
									{channel.name}
								</span>
							</Link>
						);
					})}
				</div>
			)}
		</div>
	);
}
