"use client";

import { useEffect, useMemo, useRef, useState } from "react";

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

type MenuSection = "session" | "ai" | "memory" | "storage";

const sectionMeta: Record<MenuSection, { label: string; hint: string }> = {
  session: {
    label: "Профиль",
    hint: "Проверь, что сессия Telegram подтверждена. Без этого защищённые API не будут работать.",
  },
  ai: {
    label: "Вопрос к ИИ",
    hint: "Задай вопрос. Ответ строится с учётом сохранённой памяти из pgvector.",
  },
  memory: {
    label: "Память",
    hint: "Сохрани заметку в векторную память. Потом ИИ сможет использовать её в ответах.",
  },
  storage: {
    label: "Файлы",
    hint: "Создай подписанный URL для загрузки файла в Supabase Storage в папку текущего пользователя.",
  },
};

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return "Неизвестная ошибка";
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
  const [activeSection, setActiveSection] = useState<MenuSection>("session");

  const sessionRef = useRef<HTMLDivElement | null>(null);
  const aiRef = useRef<HTMLDivElement | null>(null);
  const memoryRef = useRef<HTMLDivElement | null>(null);
  const storageRef = useRef<HTMLDivElement | null>(null);

  const sectionRefs: Record<MenuSection, React.RefObject<HTMLDivElement | null>> = {
    session: sessionRef,
    ai: aiRef,
    memory: memoryRef,
    storage: storageRef,
  };

  const effectiveInitData = useMemo(() => {
    return initData || manualInitData.trim();
  }, [initData, manualInitData]);

  const authHeaders = useMemo(() => {
    if (!effectiveInitData) {
      return null;
    }

    return {
      Authorization: `tma ${effectiveInitData}`,
      "Content-Type": "application/json",
    };
  }, [effectiveInitData]);

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
          throw new Error(payload.error ?? "Не удалось подтвердить Telegram-сессию");
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

  function goToSection(section: MenuSection) {
    setActiveSection(section);
    sectionRefs[section].current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

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
        throw new Error(payload.error ?? "Ошибка запроса к ИИ");
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
        throw new Error(payload.error ?? "Не удалось сохранить память");
      }

      setMemoryInput("");
      setUploadPreview(`Память сохранена: ${payload.documentId}`);
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
        throw new Error(payload.error ?? "Не удалось создать ссылку загрузки");
      }

      setUploadPreview(`Ссылка готова: ${payload.path}`);
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
          <CardTitle>Меню</CardTitle>
          <CardDescription>Быстрые переходы и подсказки по каждому разделу.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            {(Object.keys(sectionMeta) as MenuSection[]).map((section) => (
              <Button
                key={section}
                variant={activeSection === section ? "default" : "secondary"}
                onClick={() => goToSection(section)}
                className="w-full"
              >
                {sectionMeta[section].label}
              </Button>
            ))}
          </div>
          <p className="rounded-xl bg-[var(--tg-theme-bg-color)] p-3 text-sm text-[var(--tg-theme-hint-color)]">
            Подсказка: {sectionMeta[activeSection].hint}
          </p>
        </CardContent>
      </Card>

      <Card ref={sessionRef}>
        <CardHeader>
          <CardTitle>Профиль и сессия</CardTitle>
          <CardDescription>
            Тема Telegram: <span className="font-medium">{colorScheme === "dark" ? "тёмная" : "светлая"}</span>
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {isTelegram ? (
            <p>
              Пользователь Telegram: <strong>{initDataUnsafe?.user?.first_name ?? "неизвестно"}</strong>
            </p>
          ) : (
            <div className="space-y-2">
              <p className="text-[var(--tg-theme-hint-color)]">
                Режим браузера. Вставь raw initData для безопасной серверной валидации.
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
              Сессия подтверждена: <strong>{authInfo.telegramUser.first_name}</strong>
              {authInfo.telegramUser.username ? ` (@${authInfo.telegramUser.username})` : ""}
            </p>
          ) : (
            <p className="text-[var(--tg-theme-hint-color)]">Сессия пока не подтверждена.</p>
          )}
        </CardContent>
      </Card>

      <Card ref={aiRef}>
        <CardHeader>
          <CardTitle>Вопрос к ИИ</CardTitle>
          <CardDescription>Ответ формируется через Vercel AI SDK + контекст из pgvector.</CardDescription>
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

      <Card ref={memoryRef}>
        <CardHeader>
          <CardTitle>Сохранить в память (эмбеддинг)</CardTitle>
          <CardDescription>Текст сохраняется в векторную память пользователя.</CardDescription>
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
            Сохранить заметку
          </Button>
        </CardContent>
      </Card>

      <Card ref={storageRef}>
        <CardHeader>
          <CardTitle>Загрузка файла</CardTitle>
          <CardDescription>Создание подписанной ссылки Supabase Storage для текущего пользователя.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Input value={fileName} onChange={(event) => setFileName(event.target.value)} />
          <Button
            variant="outline"
            className="w-full"
            disabled={!authHeaders || isSubmitting || !fileName.trim()}
            onClick={handleCreateUploadUrl}
          >
            Создать ссылку загрузки
          </Button>
          {uploadPreview ? (
            <p className="break-all rounded-xl bg-[var(--tg-theme-bg-color)] p-3 text-xs">{uploadPreview}</p>
          ) : null}
        </CardContent>
      </Card>

      {error ? <p className="rounded-xl bg-red-500/10 p-3 text-sm text-red-500">{error}</p> : null}
    </div>
  );
}
