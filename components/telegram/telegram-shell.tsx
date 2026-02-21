"use client";

import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useTelegramSnapshot, useTelegramTheme } from "@/lib/telegram/hooks";

type ValidateResponse = {
  telegramId: string;
  telegramUser: {
    first_name: string;
    username?: string;
  };
};

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return "Unexpected error";
}

export function TelegramShell() {
  const { colorScheme, isTelegram } = useTelegramTheme();
  const { initData, initDataUnsafe } = useTelegramSnapshot();

  const [manualInitData, setManualInitData] = useState("");
  const [prompt, setPrompt] = useState("");
  const [memoryInput, setMemoryInput] = useState("");
  const [fileName, setFileName] = useState("notes.txt");
  const [authInfo, setAuthInfo] = useState<ValidateResponse | null>(null);
  const [answer, setAnswer] = useState("");
  const [uploadPreview, setUploadPreview] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const effectiveInitData = useMemo(() => {
    return initData || manualInitData.trim();
  }, [initData, manualInitData]);

  useEffect(() => {
    if (!effectiveInitData) {
      return;
    }

    const run = async () => {
      try {
        setError("");

        const response = await fetch("/api/telegram/validate", {
          method: "POST",
          headers: {
            Authorization: `tma ${effectiveInitData}`,
          },
        });

        if (!response.ok) {
          const payload = (await response.json()) as { error?: string };
          throw new Error(payload.error ?? "Failed to validate Telegram session");
        }

        const payload = (await response.json()) as ValidateResponse;
        setAuthInfo(payload);
      } catch (requestError) {
        setAuthInfo(null);
        setError(getErrorMessage(requestError));
      }
    };

    void run();
  }, [effectiveInitData]);

  const authHeaders = useMemo(() => {
    if (!effectiveInitData) {
      return null;
    }

    return {
      Authorization: `tma ${effectiveInitData}`,
      "Content-Type": "application/json",
    };
  }, [effectiveInitData]);

  async function handleAsk() {
    if (!authHeaders || !prompt.trim()) {
      return;
    }

    try {
      setIsSubmitting(true);
      setError("");

      const response = await fetch("/api/ai/complete", {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({ prompt }),
      });

      const payload = (await response.json()) as { text?: string; error?: string };

      if (!response.ok) {
        throw new Error(payload.error ?? "AI completion request failed");
      }

      setAnswer(payload.text ?? "");
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleRemember() {
    if (!authHeaders || !memoryInput.trim()) {
      return;
    }

    try {
      setIsSubmitting(true);
      setError("");

      const response = await fetch("/api/ai/embed", {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({
          content: memoryInput,
          metadata: {
            source: "telegram-ui",
          },
        }),
      });

      const payload = (await response.json()) as { documentId?: string; error?: string };

      if (!response.ok) {
        throw new Error(payload.error ?? "Embedding write request failed");
      }

      setMemoryInput("");
      setUploadPreview(`Memory stored: ${payload.documentId}`);
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleCreateUploadUrl() {
    if (!authHeaders || !fileName.trim()) {
      return;
    }

    try {
      setIsSubmitting(true);
      setError("");

      const response = await fetch("/api/storage/upload-url", {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({ fileName }),
      });

      const payload = (await response.json()) as {
        signedUrl?: string;
        path?: string;
        error?: string;
      };

      if (!response.ok) {
        throw new Error(payload.error ?? "Signed upload URL request failed");
      }

      setUploadPreview(`Upload ready: ${payload.path}`);
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="flex w-full flex-col gap-4 pb-4">
      <Card>
        <CardHeader>
          <CardTitle>Megamozg Mini App</CardTitle>
          <CardDescription>
            Telegram theme: <span className="font-medium">{colorScheme}</span>
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {isTelegram ? (
            <p>
              Telegram user: <strong>{initDataUnsafe?.user?.first_name ?? "unknown"}</strong>
            </p>
          ) : (
            <div className="space-y-2">
              <p className="text-[var(--tg-theme-hint-color)]">
                Local browser mode. Paste raw initData for secure server validation.
              </p>
              <Textarea
                value={manualInitData}
                onChange={(event) => setManualInitData(event.target.value)}
                placeholder="query_id=...&user=...&auth_date=...&hash=..."
              />
            </div>
          )}

          {authInfo ? (
            <p>
              Authenticated as <strong>{authInfo.telegramUser.first_name}</strong>
              {authInfo.telegramUser.username ? ` (@${authInfo.telegramUser.username})` : ""}
            </p>
          ) : (
            <p className="text-[var(--tg-theme-hint-color)]">Session is not validated yet.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Ask AI</CardTitle>
          <CardDescription>Completion via Vercel AI SDK + OpenAI with pgvector context.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Textarea
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            placeholder="Например: Какие ключевые задачи на сегодня?"
          />
          <Button className="w-full" disabled={!authHeaders || isSubmitting || !prompt.trim()} onClick={handleAsk}>
            Получить ответ
          </Button>
          {answer ? <p className="rounded-xl bg-[var(--tg-theme-bg-color)] p-3 text-sm">{answer}</p> : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Store memory embedding</CardTitle>
          <CardDescription>Text is embedded and stored in pgvector with user-scoped RLS.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Textarea
            value={memoryInput}
            onChange={(event) => setMemoryInput(event.target.value)}
            placeholder="Сохранить заметку в память"
          />
          <Button
            variant="secondary"
            className="w-full"
            disabled={!authHeaders || isSubmitting || !memoryInput.trim()}
            onClick={handleRemember}
          >
            Сохранить
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Storage upload URL</CardTitle>
          <CardDescription>Signed Supabase Storage upload URL scoped to Telegram user folder.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Input value={fileName} onChange={(event) => setFileName(event.target.value)} />
          <Button
            variant="outline"
            className="w-full"
            disabled={!authHeaders || isSubmitting || !fileName.trim()}
            onClick={handleCreateUploadUrl}
          >
            Создать upload URL
          </Button>
          {uploadPreview ? (
            <p className="rounded-xl bg-[var(--tg-theme-bg-color)] p-3 text-xs break-all">{uploadPreview}</p>
          ) : null}
        </CardContent>
      </Card>

      {error ? <p className="rounded-xl bg-red-500/10 p-3 text-sm text-red-500">{error}</p> : null}
    </div>
  );
}
