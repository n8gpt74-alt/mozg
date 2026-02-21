import { TelegramShell } from "@/components/telegram/telegram-shell";

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-xl flex-col px-4 py-5 sm:px-6">
      <TelegramShell />
    </main>
  );
}
