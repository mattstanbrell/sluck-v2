"use client";

import { cn } from "@/lib/utils";

interface LoadingSpinnerProps {
	className?: string;
}

export function LoadingSpinner({ className }: LoadingSpinnerProps) {
	return (
		<div className={cn("flex items-center justify-center", className)}>
			<div className="h-6 w-6 animate-spin rounded-full border-2 border-current border-t-transparent text-muted-foreground" />
		</div>
	);
}

export default LoadingSpinner;
