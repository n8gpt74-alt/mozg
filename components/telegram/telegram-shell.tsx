"use client";

import { type KeyboardEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";

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

type MatchPreview = {
  id: string;
  similarity: number;
};

type MenuSection = "session" | "ai" | "memory" | "storage";

type SectionStatus = {
  ready: boolean;
  note: string;
};

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

const AI_PROMPT_MAX_LENGTH = 4000;
const AI_PROMPT_SOFT_LIMIT = 3400;

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
  const [isCheckingSession, setIsCheckingSession] = useState(false);
  const [lastSessionCheckAt, setLastSessionCheckAt] = useState<string | null>(null);
  const [aiMatches, setAiMatches] = useState<MatchPreview[]>([]);
  const [lastAiResponseAt, setLastAiResponseAt] = useState<string | null>(null);

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

  const trimmedPrompt = useMemo(() => prompt.trim(), [prompt]);
  const promptLength = trimmedPrompt.length;
  const promptCharsLeft = AI_PROMPT_MAX_LENGTH - promptLength;
  const isPromptTooLong = promptLength > AI_PROMPT_MAX_LENGTH;
  const isPromptNearLimit = promptLength >= AI_PROMPT_SOFT_LIMIT;
  const canAskAi = Boolean(authHeaders) && !isSubmitting && Boolean(trimmedPrompt) && !isPromptTooLong;

  const sectionStatus = useMemo<Record<MenuSection, SectionStatus>>(() => {
    const hasSession = Boolean(authInfo);
    const hasAuthSource = Boolean(effectiveInitData);
    const hasPrompt = Boolean(trimmedPrompt);
    const hasMemory = Boolean(memoryInput.trim());
    const hasFileName = Boolean(fileName.trim());

    return {
      session: {
        ready: hasSession,
        note: isCheckingSession
          ? "Проверяем сессию"
          : hasSession
            ? "Сессия подтверждена"
            : hasAuthSource
              ? "Нужна проверка"
              : "Нужен initData",
      },
      ai: {
        ready: hasSession && hasPrompt && !isPromptTooLong,
        note: !hasSession
          ? "Сначала подтверди сессию"
          : isPromptTooLong
            ? `Сократи вопрос до ${AI_PROMPT_MAX_LENGTH} символов`
            : hasPrompt
              ? "Вопрос готов"
              : "Добавь вопрос",
      },
      memory: {
        ready: hasSession && hasMemory,
        note: !hasSession ? "Сначала подтверди сессию" : hasMemory ? "Текст готов" : "Добавь заметку",
      },
      storage: {
        ready: hasSession && hasFileName,
        note: !hasSession ? "Сначала подтверди сессию" : hasFileName ? "Имя файла готово" : "Укажи имя файла",
      },
    };
  }, [
    authInfo,
    effectiveInitData,
    fileName,
    isCheckingSession,
    isPromptTooLong,
    memoryInput,
    trimmedPrompt,
  ]);

  const readySectionsCount = useMemo(() => {
    return (Object.keys(sectionStatus) as MenuSection[]).filter((section) => sectionStatus[section].ready).length;
  }, [sectionStatus]);

  const bestMatchPercent = useMemo(() => {
    if (!aiMatches.length) {
      return null;
    }

    return Math.round(Math.max(...aiMatches.map((match) => match.similarity)) * 100);
  }, [aiMatches]);

  const validateSession = useCallback(async () => {
    if (!effectiveInitData) {
      setAuthInfo(null);
      return;
    }

    try {
      setIsCheckingSession(true);
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
      setLastSessionCheckAt(
        new Date().toLocaleTimeString("ru-RU", {
          hour: "2-digit",
          minute: "2-digit",
        }),
      );
    } catch (requestError) {
      setAuthInfo(null);
      setError(getErrorMessage(requestError));
      setLastSessionCheckAt(
        new Date().toLocaleTimeString("ru-RU", {
          hour: "2-digit",
          minute: "2-digit",
        }),
      );
    } finally {
      setIsCheckingSession(false);
    }
  }, [effectiveInitData]);

  useEffect(() => {
    if (!effectiveInitData) {
      setAuthInfo(null);
      setLastSessionCheckAt(null);
      return;
    }

    void validateSession();
  }, [effectiveInitData, validateSession]);

  function goToSection(section: MenuSection) {
    setActiveSection(section);
    sectionRefs[section].current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function handleAsk() {
    if (!authHeaders || !trimmedPrompt) {
      return;
    }

    if (isPromptTooLong) {
      setError(`Вопрос слишком длинный. Максимум ${AI_PROMPT_MAX_LENGTH} символов.`);
      return;
    }

    try {
      setIsSubmitting(true);
      setError("");
      setAnswer("");
      setAiMatches([]);

      const response = await fetch("/api/ai/complete", {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({ prompt: trimmedPrompt }),
      });

      const payload = (await response.json()) as {
        text?: string;
        matches?: MatchPreview[];
        error?: string;
      };

      if (!response.ok) {
        throw new Error(payload.error ?? "Ошибка запроса к ИИ");
      }

      setAnswer(payload.text ?? "");
      setAiMatches(payload.matches ?? []);
      setLastAiResponseAt(
        new Date().toLocaleTimeString("ru-RU", {
          hour: "2-digit",
          minute: "2-digit",
        }),
      );
    } catch (requestError) {
      setAiMatches([]);
      setError(getErrorMessage(requestError));
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleClearAskState() {
    setPrompt("");
    setAnswer("");
    setAiMatches([]);
    setError("");
  }

  function handlePromptKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
      event.preventDefault();
      void handleAsk();
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
          <p className="text-xs text-[var(--tg-theme-hint-color)]">
            Готовность: {readySectionsCount}/4 блоков готовы к действию.
          </p>
          <div className="grid grid-cols-2 gap-2">
            {(Object.keys(sectionMeta) as MenuSection[]).map((section) => {
              const status = sectionStatus[section];

              return (
                <Button
                  key={section}
                  variant={activeSection === section ? "default" : "secondary"}
                  aria-pressed={activeSection === section}
                  onClick={() => goToSection(section)}
                  className="h-auto w-full flex-col items-start gap-1 px-3 py-2 text-left"
                >
                  <span className="leading-tight">{sectionMeta[section].label}</span>
                  <span
                    className={
                      status.ready
                        ? "text-xs font-medium text-emerald-500 dark:text-emerald-400"
                        : "text-xs text-[var(--tg-theme-hint-color)]"
                    }
                  >
                    {status.note}
                  </span>
                </Button>
              );
            })}
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
        <CardContent className="space-y-3 text-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span
              className={
                authInfo
                  ? "rounded-full bg-emerald-500/15 px-3 py-1 text-xs font-medium text-emerald-600 dark:text-emerald-400"
                  : "rounded-full bg-amber-500/15 px-3 py-1 text-xs font-medium text-amber-600 dark:text-amber-400"
              }
            >
              {authInfo ? "Сессия активна" : isCheckingSession ? "Проверяем сессию" : "Сессия не подтверждена"}
            </span>
            <Button
              variant="outline"
              className="min-h-9 px-3 text-xs"
              disabled={!effectiveInitData || isCheckingSession}
              onClick={validateSession}
            >
              {isCheckingSession ? "Проверяем..." : "Проверить сессию"}
            </Button>
          </div>

          <p className="text-xs text-[var(--tg-theme-hint-color)]">
            {lastSessionCheckAt ? `Последняя проверка: ${lastSessionCheckAt}` : "Проверка ещё не запускалась"}
          </p>

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

          {!effectiveInitData ? (
            <p className="rounded-xl bg-[var(--tg-theme-bg-color)] p-3 text-xs text-[var(--tg-theme-hint-color)]">
              Нет initData. В Telegram он подхватится автоматически, в браузере вставь его вручную.
            </p>
          ) : null}

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
            onKeyDown={handlePromptKeyDown}
            placeholder="Например: Какие ключевые задачи на сегодня?"
          />
          <div className="flex items-center justify-between text-xs">
            <span
              className={
                isPromptTooLong
                  ? "font-medium text-red-500"
                  : isPromptNearLimit
                    ? "font-medium text-amber-500"
                    : "text-[var(--tg-theme-hint-color)]"
              }
            >
              {isPromptTooLong
                ? `Превышение лимита: ${Math.abs(promptCharsLeft)} симв.`
                : `Осталось символов: ${promptCharsLeft}` }
            </span>
            <span className="text-[var(--tg-theme-hint-color)]">Ctrl/Cmd + Enter</span>
          </div>
          <div className="flex gap-2">
            <Button className="flex-1" disabled={!canAskAi} onClick={handleAsk}>
              {isSubmitting ? "Генерирую ответ..." : "Получить ответ"}
            </Button>
            <Button
              variant="outline"
              className="px-4"
              disabled={isSubmitting || (!prompt && !answer && !aiMatches.length)}
              onClick={handleClearAskState}
            >
              Очистить
            </Button>
          </div>
          {lastAiResponseAt ? (
            <p className="text-xs text-[var(--tg-theme-hint-color)]">Последний ответ: {lastAiResponseAt}</p>
          ) : null}
          {answer ? (
            <div className="rounded-xl bg-[var(--tg-theme-bg-color)] p-3">
              <p className="text-sm">{answer}</p>
              <p className="mt-2 text-xs text-[var(--tg-theme-hint-color)]">
                {aiMatches.length
                  ? `Контекст памяти: ${aiMatches.length} заметок, лучшая релевантность ~${bestMatchPercent ?? 0}%.`
                  : "Контекст памяти не использован для этого ответа."}
              </p>
            </div>
          ) : null}
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
