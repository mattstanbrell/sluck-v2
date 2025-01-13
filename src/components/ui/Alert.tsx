import { X } from "lucide-react";
import { Button } from "./button";

interface AlertProps {
	message: string;
	onDismiss: () => void;
}

export function Alert({ message, onDismiss }: AlertProps) {
	return (
		<div className="fixed inset-0 flex items-center justify-center bg-black/50 z-50">
			<div className="bg-custom-background-secondary rounded-lg shadow-lg max-w-md w-full mx-4">
				<div className="flex items-center justify-between p-4 border-b border-red-500">
					<h3 className="text-lg font-semibold text-red-500">Error</h3>
					<Button
						variant="ghost"
						size="sm"
						onClick={onDismiss}
						className="text-red-500/70 hover:text-red-500"
					>
						<X className="h-4 w-4" />
					</Button>
				</div>
				<div className="p-4 bg-red-500/10">
					<p className="text-red-500">{message}</p>
				</div>
				<div className="flex justify-end p-4 border-t border-red-500">
					<Button
						variant="ghost"
						onClick={onDismiss}
						className="text-red-500 hover:bg-red-500/10"
					>
						Dismiss
					</Button>
				</div>
			</div>
		</div>
	);
}
