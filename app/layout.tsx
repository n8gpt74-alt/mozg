import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "Megamozg Telegram AI",
  description: "Telegram Mini App with Supabase, pgvector, and Vercel AI SDK",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru">
      <body>{children}</body>
    </html>
  );
}
