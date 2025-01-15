import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { MessageCacheProvider } from "@/components/messages/MessageCache";
import { ChatDialog } from "@/components/ChatDialog";
import { ProfileCacheProvider } from "@/components/providers/ProfileCacheProvider";

const geistSans = Geist({
	variable: "--font-geist-sans",
	subsets: ["latin"],
});

const geistMono = Geist_Mono({
	variable: "--font-geist-mono",
	subsets: ["latin"],
});

export const metadata: Metadata = {
	title: "Sluck",
	description: "A Slack clone built with Next.js and Supabase",
};

export default function RootLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	return (
		<html lang="en">
			<body
				className={`${geistSans.variable} ${geistMono.variable} antialiased`}
			>
				<ProfileCacheProvider>
					<MessageCacheProvider>
						{children}
						<Toaster />
						<ChatDialog />
					</MessageCacheProvider>
				</ProfileCacheProvider>
			</body>
		</html>
	);
}
