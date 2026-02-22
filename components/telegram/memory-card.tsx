import { type KeyboardEvent, forwardRef } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { memoryPromptPresets, type MemoryItem } from "@/lib/features/telegram/constants";
import { compactValue } from "@/lib/features/telegram/utils";

type MemoryCardProps = {
  memoryInput: string;
  onMemoryInputChange: (value: string) => void;
  onRemember: () => void;
  onClearComposer: () => void;
  onApplyPreset: (preset: string) => void;
  isSavingMemory: boolean;
  canRemember: boolean;
  memoryCharsLeft: number;
  isMemoryTooLong: boolean;
  isMemoryNearLimit: boolean;
  lastMemorySavedAt: string | null;
  memorySavePreview: string;
  saveError: string;
  memoryItems: MemoryItem[];
  availableSources: string[];
  sourceFilter: string;
  onSourceFilterChange: (value: string) => void;
  onClearFilter: () => void;
  isLoadingMemoryList: boolean;
  listError: string;
  deletingId: string | null;
  onDeleteMemoryItem: (id: string) => void;
  onRefreshMemoryList: () => void;
};

export const MemoryCard = forwardRef<HTMLDivElement, MemoryCardProps>(function MemoryCard(
  {
    memoryInput,
    onMemoryInputChange,
    onRemember,
    onClearComposer,
    onApplyPreset,
    isSavingMemory,
    canRemember,
    memoryCharsLeft,
    isMemoryTooLong,
    isMemoryNearLimit,
    lastMemorySavedAt,
    memorySavePreview,
    saveError,
    memoryItems,
    availableSources,
    sourceFilter,
    onSourceFilterChange,
    onClearFilter,
    isLoadingMemoryList,
    listError,
    deletingId,
    onDeleteMemoryItem,
    onRefreshMemoryList,
  },
  ref,
) {
  function handleMemoryKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
      event.preventDefault();
      onRemember();
    }
  }

  return (
    <Card ref={ref}>
      <CardHeader>
        <CardTitle>Сохранить в память (эмбеддинг)</CardTitle>
        <CardDescription>Текст сохраняется в векторную память пользователя.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-3">
          <label htmlFor="memory-input" className="sr-only">
            Заметка для сохранения в память
          </label>
          <Textarea
            id="memory-input"
            aria-label="Заметка для сохранения в память"
            value={memoryInput}
            onChange={(event) => onMemoryInputChange(event.target.value)}
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
                onClick={() => onApplyPreset(preset)}
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
            <Button variant="secondary" className="min-w-36 flex-1" disabled={!canRemember} onClick={onRemember}>
              {isSavingMemory ? "Сохраняю..." : "Сохранить заметку"}
            </Button>
            <Button
              variant="outline"
              className="px-4"
              disabled={isSavingMemory || (!memoryInput && !memorySavePreview)}
              onClick={onClearComposer}
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
          {saveError ? (
            <p role="alert" className="rounded-xl bg-red-500/10 p-3 text-xs text-red-500">
              {saveError}
            </p>
          ) : null}
        </div>

        <div className="space-y-3 border-t border-[var(--tg-theme-hint-color)]/20 pt-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h4 className="text-sm font-medium">Мои заметки</h4>
            <Button variant="outline" className="min-h-8 px-3 text-xs" onClick={onRefreshMemoryList}>
              Обновить список
            </Button>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Input
              value={sourceFilter}
              onChange={(event) => onSourceFilterChange(event.target.value)}
              placeholder="Фильтр source (например, telegram-ui)"
              className="h-9"
            />
            <Button
              variant="outline"
              className="min-h-9 px-3 text-xs"
              disabled={!sourceFilter}
              onClick={onClearFilter}
            >
              Сбросить фильтр
            </Button>
          </div>

          {availableSources.length ? (
            <div className="flex flex-wrap gap-2 text-xs text-[var(--tg-theme-hint-color)]">
              {availableSources.map((source) => (
                <button
                  key={source}
                  type="button"
                  className="rounded-full border border-[var(--tg-theme-hint-color)]/30 px-2 py-1"
                  onClick={() => onSourceFilterChange(source)}
                >
                  {source}
                </button>
              ))}
            </div>
          ) : null}

          {isLoadingMemoryList ? (
            <p className="rounded-xl bg-[var(--tg-theme-bg-color)] p-3 text-xs text-[var(--tg-theme-hint-color)]">
              Загружаем заметки...
            </p>
          ) : memoryItems.length ? (
            <ul className="space-y-2">
              {memoryItems.map((item) => {
                const source = typeof item.metadata.source === "string" ? item.metadata.source : "без source";

                return (
                  <li key={item.id} className="rounded-xl bg-[var(--tg-theme-bg-color)] p-3 text-xs">
                    <div className="flex items-start justify-between gap-2">
                      <div className="space-y-1">
                        <p className="text-sm text-[var(--tg-theme-text-color)]">{item.content}</p>
                        <p className="text-[var(--tg-theme-hint-color)]">
                          source: <span className="font-medium">{source}</span>
                        </p>
                        <p className="text-[var(--tg-theme-hint-color)]">id: {compactValue(item.id, 8, 6)}</p>
                      </div>
                      <Button
                        variant="outline"
                        className="min-h-8 px-3 text-xs"
                        disabled={deletingId === item.id}
                        onClick={() => onDeleteMemoryItem(item.id)}
                      >
                        {deletingId === item.id ? "Удаляю..." : "Удалить"}
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="rounded-xl bg-[var(--tg-theme-bg-color)] p-3 text-xs text-[var(--tg-theme-hint-color)]">
              Память пока пуста. Сохрани заметку выше, и она появится в списке.
            </p>
          )}

          {listError ? (
            <p role="alert" className="rounded-xl bg-red-500/10 p-3 text-xs text-red-500">
              {listError}
            </p>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
});
