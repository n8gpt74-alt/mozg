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

const menuSections: MenuSection[] = ["session", "ai", "memory", "storage"];

const AI_PROMPT_MAX_LENGTH = 4000;
const AI_PROMPT_SOFT_LIMIT = 3400;
const aiPromptPresets = [
  "Собери короткий план задач на день на основе моей памяти.",
  "Что из сохранённых заметок сейчас наиболее приоритетно?",
  "Сформулируй 3 следующих шага по текущему проекту.",
];
const MEMORY_INPUT_MAX_LENGTH = 12_000;
const MEMORY_INPUT_SOFT_LIMIT = 10_000;
const memoryPromptPresets = [
  "Клиент просит отчёт по статусу проекта к пятнице.",
  "Нужно подготовить список рисков и план действий.",
  "Согласовать ТЗ, дедлайн и ответственных по задачам.",
];



function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return "Неизвестная ошибка";
}

function compactValue(value: string, head = 18, tail = 12) {
  if (value.length <= head + tail + 1) {
    return value;
  }

  return `${value.slice(0, head)}…${value.slice(-tail)}`;
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
  const [isAsking, setIsAsking] = useState(false);
  const [isSavingMemory, setIsSavingMemory] = useState(false);
  const [isCreatingUploadUrl, setIsCreatingUploadUrl] = useState(false);
  const [activeSection, setActiveSection] = useState<MenuSection>("session");
  const [isCheckingSession, setIsCheckingSession] = useState(false);
  const [lastSessionCheckAt, setLastSessionCheckAt] = useState<string | null>(null);
  const [aiMatches, setAiMatches] = useState<MatchPreview[]>([]);
  const [lastAiResponseAt, setLastAiResponseAt] = useState<string | null>(null);
  const [isAnswerCopied, setIsAnswerCopied] = useState(false);
  const [memorySavePreview, setMemorySavePreview] = useState("");
  const [lastMemorySavedAt, setLastMemorySavedAt] = useState<string | null>(null);

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

  const sessionSourceLabel = useMemo(() => {
    if (initData) {
      return "Telegram WebView";
    }

    if (manualInitData.trim()) {
      return "Вручную (браузер)";
    }

    return "Не указан";
  }, [initData, manualInitData]);

  const initDataLength = effectiveInitData.length;
  const initDataPreview = useMemo(() => {
    if (!effectiveInitData) {
      return null;
    }

    return compactValue(effectiveInitData);
  }, [effectiveInitData]);

  const trimmedPrompt = useMemo(() => prompt.trim(), [prompt]);
  const promptLength = trimmedPrompt.length;
  const promptCharsLeft = AI_PROMPT_MAX_LENGTH - promptLength;
  const isPromptTooLong = promptLength > AI_PROMPT_MAX_LENGTH;
  const isPromptNearLimit = promptLength >= AI_PROMPT_SOFT_LIMIT;
  const canAskAi = Boolean(authHeaders) && !isAsking && Boolean(trimmedPrompt) && !isPromptTooLong;

  const trimmedMemoryInput = useMemo(() => memoryInput.trim(), [memoryInput]);
  const memoryLength = trimmedMemoryInput.length;
  const memoryCharsLeft = MEMORY_INPUT_MAX_LENGTH - memoryLength;
  const isMemoryTooLong = memoryLength > MEMORY_INPUT_MAX_LENGTH;
  const isMemoryNearLimit = memoryLength >= MEMORY_INPUT_SOFT_LIMIT;
  const canRemember = Boolean(authHeaders) && !isSavingMemory && Boolean(trimmedMemoryInput) && !isMemoryTooLong;

  const sectionStatus = useMemo<Record<MenuSection, SectionStatus>>(() => {
    const hasSession = Boolean(authInfo);
    const hasAuthSource = Boolean(effectiveInitData);
    const hasPrompt = Boolean(trimmedPrompt);
    const hasMemory = Boolean(trimmedMemoryInput);
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
        ready: hasSession && hasMemory && !isMemoryTooLong,
        note: !hasSession
          ? "Сначала подтверди сессию"
          : isMemoryTooLong
            ? `Сократи заметку до ${MEMORY_INPUT_MAX_LENGTH} символов`
            : hasMemory
              ? "Текст готов"
              : "Добавь заметку",
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
    isMemoryTooLong,
    trimmedMemoryInput,
    trimmedPrompt,
  ]);

  const readySectionsCount = useMemo(() => {
    return menuSections.filter((section) => sectionStatus[section].ready).length;
  }, [sectionStatus]);

  const completionPercent = useMemo(() => {
    return Math.round((readySectionsCount / menuSections.length) * 100);
  }, [readySectionsCount]);

  const firstPendingSection = useMemo(() => {
    return menuSections.find((section) => !sectionStatus[section].ready) ?? null;
  }, [sectionStatus]);

  const bestMatchPercent = useMemo(() => {
    if (!aiMatches.length) {
      return null;
    }

    return Math.round(Math.max(...aiMatches.map((match) => match.similarity)) * 100);
  }, [aiMatches]);

  const topAiMatches = useMemo(() => {
    return aiMatches.slice(0, 3).map((match) => ({
      ...match,
      similarityPercent: Math.round(match.similarity * 100),
      shortId: compactValue(match.id, 8, 6),
    }));
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

  function handleClearManualInitData() {
    setManualInitData("");
    setAuthInfo(null);
    setLastSessionCheckAt(null);
    setError("");
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
      setIsAsking(true);
      setError("");
      setAnswer("");
      setAiMatches([]);
      setIsAnswerCopied(false);

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
      setIsAsking(false);
    }
  }

  function handleClearAskState() {
    setPrompt("");
    setAnswer("");
    setAiMatches([]);
    setIsAnswerCopied(false);
    setError("");
  }

  function handlePromptKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
      event.preventDefault();
      void handleAsk();
    }
  }

  function handleApplyPromptPreset(preset: string) {
    setPrompt(preset);
    setError("");
    setIsAnswerCopied(false);
  }

  async function handleCopyAnswer() {
    if (!answer) {
      return;
    }

    try {
      if (!navigator.clipboard?.writeText) {
        throw new Error("Буфер обмена недоступен в этом окружении");
      }

      await navigator.clipboard.writeText(answer);
      setIsAnswerCopied(true);

      window.setTimeout(() => {
        setIsAnswerCopied(false);
      }, 1600);
    } catch (copyError) {
      setError(getErrorMessage(copyError));
    }
  }

  function handleMemoryKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
      event.preventDefault();
      void handleRemember();
    }
  }

  function handleApplyMemoryPreset(preset: string) {
    setMemoryInput(preset);
    setError("");
  }

  function handleClearMemoryState() {
    setMemoryInput("");
    setMemorySavePreview("");
    setLastMemorySavedAt(null);
    setError("");
  }

  async function handleRemember() {
    if (!authHeaders || !trimmedMemoryInput) {
      return;
    }

    if (isMemoryTooLong) {
      setError(`Заметка слишком длинная. Максимум ${MEMORY_INPUT_MAX_LENGTH} символов.`);
      return;
    }

    try {
      setIsSavingMemory(true);
      setError("");

      const response = await fetch("/api/ai/embed", {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({
          content: trimmedMemoryInput,
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
      setMemorySavePreview(`Память сохранена: ${payload.documentId ?? "без documentId"}`);
      setLastMemorySavedAt(
        new Date().toLocaleTimeString("ru-RU", {
          hour: "2-digit",
          minute: "2-digit",
        }),
      );
    } catch (requestError) {
      setMemorySavePreview("");
      setError(getErrorMessage(requestError));
    } finally {
      setIsSavingMemory(false);
    }
  }

  async function handleCreateUploadUrl() {
    if (!authHeaders || !fileName.trim()) {
      return;
    }

    try {
      setIsCreatingUploadUrl(true);
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
      setIsCreatingUploadUrl(false);
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
            Готовность: {readySectionsCount}/{menuSections.length} блоков готовы к действию.
          </p>
          <div className="space-y-2">
            <div className="h-2 rounded-full bg-[var(--tg-theme-bg-color)]">
              <div
                className="h-full rounded-full bg-[var(--tg-theme-button-color)] transition-all"
                style={{ width: `${completionPercent}%` }}
              />
            </div>
            <div className="flex items-center justify-between gap-2 text-xs">
              <span className="text-[var(--tg-theme-hint-color)]">Прогресс: {completionPercent}%</span>
              {firstPendingSection ? (
                <Button
                  variant="outline"
                  className="min-h-8 px-2 text-xs"
                  onClick={() => goToSection(firstPendingSection)}
                >
                  Следующий шаг: {sectionMeta[firstPendingSection].label}
                </Button>
              ) : (
                <span className="font-medium text-emerald-500 dark:text-emerald-400">Все блоки готовы</span>
              )}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {menuSections.map((section) => {
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

          <div className="grid grid-cols-2 gap-2 text-xs">
            <p className="rounded-xl bg-[var(--tg-theme-bg-color)] p-2 text-[var(--tg-theme-hint-color)]">
              Источник: <span className="font-medium text-[var(--tg-theme-text-color)]">{sessionSourceLabel}</span>
            </p>
            <p className="rounded-xl bg-[var(--tg-theme-bg-color)] p-2 text-[var(--tg-theme-hint-color)]">
              initData: <span className="font-medium text-[var(--tg-theme-text-color)]">{initDataLength} симв.</span>
            </p>
          </div>

          {initDataPreview ? (
            <p className="break-all rounded-xl bg-[var(--tg-theme-bg-color)] p-2 text-xs text-[var(--tg-theme-hint-color)]">
              Preview: <span className="text-[var(--tg-theme-text-color)]">{initDataPreview}</span>
            </p>
          ) : null}

          {isTelegram ? (
            <p>
              Пользователь Telegram: <strong>{initDataUnsafe?.user?.first_name ?? "неизвестно"}</strong>
            </p>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[var(--tg-theme-hint-color)]">
                  Режим браузера. Вставь raw initData для безопасной серверной валидации.
                </p>
                <Button
                  variant="outline"
                  className="min-h-8 px-2 text-xs"
                  disabled={isCheckingSession || !manualInitData.trim()}
                  onClick={handleClearManualInitData}
                >
                  Очистить initData
                </Button>
              </div>
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
            <div className="space-y-1">
              <p>
                Сессия подтверждена: <strong>{authInfo.telegramUser.first_name}</strong>
                {authInfo.telegramUser.username ? ` (@${authInfo.telegramUser.username})` : ""}
              </p>
              <p className="text-xs text-[var(--tg-theme-hint-color)]">Telegram ID: {authInfo.telegramId}</p>
            </div>
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
          <div className="flex flex-wrap gap-2">
            {aiPromptPresets.map((preset) => (
              <Button
                key={preset}
                variant="secondary"
                className="min-h-8 px-3 text-xs"
                disabled={isAsking}
                onClick={() => handleApplyPromptPreset(preset)}
              >
                {preset.length > 52 ? `${preset.slice(0, 52)}…` : preset}
              </Button>
            ))}
          </div>
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
                : `Осталось символов: ${promptCharsLeft}`}
            </span>
            <span className="text-[var(--tg-theme-hint-color)]">Ctrl/Cmd + Enter</span>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button className="min-w-36 flex-1" disabled={!canAskAi} onClick={handleAsk}>
              {isAsking ? "Генерирую ответ..." : "Получить ответ"}
            </Button>
            <Button
              variant="outline"
              className="px-4"
              disabled={!answer || isAsking}
              onClick={handleCopyAnswer}
            >
              {isAnswerCopied ? "Скопировано" : "Копировать"}
            </Button>
            <Button
              variant="outline"
              className="px-4"
              disabled={isAsking || (!prompt && !answer && !aiMatches.length)}
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
              {topAiMatches.length ? (
                <ul className="mt-2 space-y-1 text-xs text-[var(--tg-theme-hint-color)]">
                  {topAiMatches.map((match, index) => (
                    <li key={match.id} className="flex items-center justify-between rounded-lg bg-[var(--tg-theme-secondary-bg-color)] px-2 py-1">
                      <span>#{index + 1} • {match.shortId}</span>
                      <span className="font-medium text-[var(--tg-theme-text-color)]">{match.similarityPercent}%</span>
                    </li>
                  ))}
                </ul>
              ) : null}
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
            onKeyDown={handleMemoryKeyDown}
            placeholder="Сохранить заметку в память"
          />
          <div className="flex flex-wrap gap-2">
            {memoryPromptPresets.map((preset) => (
              <Button
                key={preset}
                variant="secondary"
                className="min-h-8 px-3 text-xs"
                disabled={isSavingMemory}
                onClick={() => handleApplyMemoryPreset(preset)}
              >
                {preset.length > 52 ? `${preset.slice(0, 52)}…` : preset}
              </Button>
            ))}
          </div>
          <div className="flex items-center justify-between text-xs">
            <span
              className={
                isMemoryTooLong
                  ? "font-medium text-red-500"
                  : isMemoryNearLimit
                    ? "font-medium text-amber-500"
                    : "text-[var(--tg-theme-hint-color)]"
              }
            >
              {isMemoryTooLong
                ? `Превышение лимита: ${Math.abs(memoryCharsLeft)} симв.`
                : `Осталось символов: ${memoryCharsLeft}`}
            </span>
            <span className="text-[var(--tg-theme-hint-color)]">Ctrl/Cmd + Enter</span>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" className="min-w-36 flex-1" disabled={!canRemember} onClick={handleRemember}>
              {isSavingMemory ? "Сохраняю..." : "Сохранить заметку"}
            </Button>
            <Button
              variant="outline"
              className="px-4"
              disabled={isSavingMemory || (!memoryInput && !memorySavePreview)}
              onClick={handleClearMemoryState}
            >
              Очистить
            </Button>
          </div>
          {lastMemorySavedAt ? (
            <p className="text-xs text-[var(--tg-theme-hint-color)]">Последнее сохранение: {lastMemorySavedAt}</p>
          ) : null}
          {memorySavePreview ? (
            <p className="rounded-xl bg-[var(--tg-theme-bg-color)] p-3 text-xs">{memorySavePreview}</p>
          ) : null}
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
            disabled={!authHeaders || isCreatingUploadUrl || !fileName.trim()}
            onClick={handleCreateUploadUrl}
          >
            {isCreatingUploadUrl ? "Создаю ссылку..." : "Создать ссылку загрузки"}
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
