import { type KeyboardEvent, forwardRef } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { aiPromptPresets, type MatchPreview } from "@/lib/features/telegram/constants";

type TopAiMatch = MatchPreview & {
  similarityPercent: number;
  shortId: string;
};

type AiCardProps = {
  prompt: string;
  onPromptChange: (value: string) => void;
  onAsk: () => void;
  onClear: () => void;
  onApplyPreset: (preset: string) => void;
  onCopyAnswer: () => void;
  answer: string;
  isAsking: boolean;
  canAskAi: boolean;
  isAnswerCopied: boolean;
  promptCharsLeft: number;
  isPromptTooLong: boolean;
  isPromptNearLimit: boolean;
  lastAiResponseAt: string | null;
  aiMatches: MatchPreview[];
  bestMatchPercent: number | null;
  topAiMatches: TopAiMatch[];
  error: string;
};

export const AiCard = forwardRef<HTMLDivElement, AiCardProps>(function AiCard(
  {
    prompt,
    onPromptChange,
    onAsk,
    onClear,
    onApplyPreset,
    onCopyAnswer,
    answer,
    isAsking,
    canAskAi,
    isAnswerCopied,
    promptCharsLeft,
    isPromptTooLong,
    isPromptNearLimit,
    lastAiResponseAt,
    aiMatches,
    bestMatchPercent,
    topAiMatches,
    error,
  },
  ref,
) {
  function handlePromptKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
      event.preventDefault();
      onAsk();
    }
  }

  return (
    <Card ref={ref}>
      <CardHeader>
        <CardTitle>Вопрос к ИИ</CardTitle>
        <CardDescription>Ответ формируется через Vercel AI SDK + контекст из pgvector.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <label htmlFor="ai-prompt" className="sr-only">
          Вопрос к ИИ
        </label>
        <Textarea
          id="ai-prompt"
          aria-label="Вопрос к ИИ"
          value={prompt}
          onChange={(event) => onPromptChange(event.target.value)}
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
              onClick={() => onApplyPreset(preset)}
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
          <Button className="min-w-36 flex-1" disabled={!canAskAi} onClick={onAsk}>
            {isAsking ? "Генерирую ответ потоком..." : "Получить ответ"}
          </Button>
          <Button variant="outline" className="px-4" disabled={!answer || isAsking} onClick={onCopyAnswer}>
            {isAnswerCopied ? "Скопировано" : "Копировать"}
          </Button>
          <Button
            variant="outline"
            className="px-4"
            disabled={isAsking || (!prompt && !answer && !aiMatches.length)}
            onClick={onClear}
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
                  <li
                    key={match.id}
                    className="flex items-center justify-between rounded-lg bg-[var(--tg-theme-secondary-bg-color)] px-2 py-1"
                  >
                    <span>
                      #{index + 1} • {match.shortId}
                    </span>
                    <span className="font-medium text-[var(--tg-theme-text-color)]">{match.similarityPercent}%</span>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : isAsking ? (
          <p className="rounded-xl bg-[var(--tg-theme-bg-color)] p-3 text-sm text-[var(--tg-theme-hint-color)]">
            ИИ формирует ответ. Текст появляется по мере генерации...
          </p>
        ) : (
          <p className="rounded-xl bg-[var(--tg-theme-bg-color)] p-3 text-sm text-[var(--tg-theme-hint-color)]">
            Ответ появится здесь после отправки вопроса.
          </p>
        )}

        {error ? (
          <p role="alert" className="rounded-xl bg-red-500/10 p-3 text-xs text-red-500">
            {error}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
});
