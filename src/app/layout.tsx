import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "贪吃蛇 · Snake Game",
  description: "经典贪吃蛇游戏 - 方向键控制，吃食物变长，撞墙或自己即结束。A classic Snake game built with Next.js and Canvas.",
  keywords: ["贪吃蛇", "Snake", "Game", "Next.js", "TypeScript", "Canvas"],
  authors: [{ name: "Z.ai Team" }],
  icons: {
    icon: "https://z-cdn.chatglm.cn/z-ai/static/logo.svg",
  },
  openGraph: {
    title: "贪吃蛇 · Snake Game",
    description: "经典贪吃蛇游戏 - 用方向键开始你的冒险",
    url: "https://chat.z.ai",
    siteName: "Z.ai",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "贪吃蛇 · Snake Game",
    description: "经典贪吃蛇游戏",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        {children}
        <Toaster />
      </body>
    </html>
  );
}
