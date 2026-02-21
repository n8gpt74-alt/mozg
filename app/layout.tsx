import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "Мозг — Telegram Mini App",
  description: "Мини-приложение Telegram с Supabase, pgvector и Vercel AI SDK",
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
