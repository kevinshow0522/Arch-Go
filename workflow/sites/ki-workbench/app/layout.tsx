import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "KI建筑设计工作流 · 云端工作台",
  description: "只读查看AI工作进度与选定成果。",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body className="antialiased">{children}</body>
    </html>
  );
}
