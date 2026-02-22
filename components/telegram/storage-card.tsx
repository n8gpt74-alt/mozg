import { type KeyboardEvent, forwardRef } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { fileNamePresets } from "@/lib/features/telegram/constants";

type StorageCardProps = {
  fileName: string;
  onFileNameChange: (value: string) => void;
  onCreateUploadUrl: () => void;
  onUploadFile: () => void;
  onFileSelected: (file: File | null) => void;
  onCopyUploadPath: () => void;
  onClear: () => void;
  onApplyPreset: (preset: string) => void;
  isCreatingUploadUrl: boolean;
  isUploadingFile: boolean;
  canCreateUploadUrl: boolean;
  canUploadFile: boolean;
  fileNameCharsLeft: number;
  isFileNameTooLong: boolean;
  isFileNameNearLimit: boolean;
  sanitizedFileNamePreview: string | null;
  trimmedFileName: string;
  selectedFileName: string;
  uploadPath: string;
  uploadPreview: string;
  uploadVerification: string;
  lastUploadCreatedAt: string | null;
  lastUploadVerifiedAt: string | null;
  isUploadPathCopied: boolean;
  error: string;
};

export const StorageCard = forwardRef<HTMLDivElement, StorageCardProps>(function StorageCard(
  {
    fileName,
    onFileNameChange,
    onCreateUploadUrl,
    onUploadFile,
    onFileSelected,
    onCopyUploadPath,
    onClear,
    onApplyPreset,
    isCreatingUploadUrl,
    isUploadingFile,
    canCreateUploadUrl,
    canUploadFile,
    fileNameCharsLeft,
    isFileNameTooLong,
    isFileNameNearLimit,
    sanitizedFileNamePreview,
    trimmedFileName,
    selectedFileName,
    uploadPath,
    uploadPreview,
    uploadVerification,
    lastUploadCreatedAt,
    lastUploadVerifiedAt,
    isUploadPathCopied,
    error,
  },
  ref,
) {
  function handleFileNameKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
      event.preventDefault();
      onCreateUploadUrl();
    }
  }

  return (
    <Card ref={ref}>
      <CardHeader>
        <CardTitle>Загрузка файла</CardTitle>
        <CardDescription>Создание подписанной ссылки Supabase Storage для текущего пользователя.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <label htmlFor="storage-file-name" className="sr-only">
          Имя файла для генерации upload URL
        </label>
        <Input
          id="storage-file-name"
          aria-label="Имя файла для генерации upload URL"
          value={fileName}
          onChange={(event) => onFileNameChange(event.target.value)}
          onKeyDown={handleFileNameKeyDown}
        />
        <div className="flex flex-wrap gap-2">
          {fileNamePresets.map((preset) => (
            <Button
              key={preset}
              variant="secondary"
              className="min-h-8 px-3 text-xs"
              disabled={isCreatingUploadUrl || isUploadingFile}
              onClick={() => onApplyPreset(preset)}
            >
              {preset}
            </Button>
          ))}
        </div>
        <div className="flex items-center justify-between text-xs">
          <span
            className={
              isFileNameTooLong
                ? "font-medium text-red-500"
                : isFileNameNearLimit
                  ? "font-medium text-amber-500"
                  : "text-[var(--tg-theme-hint-color)]"
            }
          >
            {isFileNameTooLong
              ? `Превышение лимита: ${Math.abs(fileNameCharsLeft)} симв.`
              : `Осталось символов: ${fileNameCharsLeft}`}
          </span>
          <span className="text-[var(--tg-theme-hint-color)]">Ctrl/Cmd + Enter</span>
        </div>

        {sanitizedFileNamePreview && sanitizedFileNamePreview !== trimmedFileName ? (
          <p className="rounded-xl bg-[var(--tg-theme-bg-color)] p-2 text-xs text-[var(--tg-theme-hint-color)]">
            После sanitize: <span className="text-[var(--tg-theme-text-color)]">{sanitizedFileNamePreview}</span>
          </p>
        ) : null}

        <div className="space-y-2 rounded-xl bg-[var(--tg-theme-bg-color)] p-3">
          <label htmlFor="storage-file-input" className="text-xs text-[var(--tg-theme-hint-color)]">
            Выбери файл для upload по signed URL
          </label>
          <Input
            id="storage-file-input"
            type="file"
            className="h-10"
            onChange={(event) => onFileSelected(event.target.files?.[0] ?? null)}
          />
          <p className="text-xs text-[var(--tg-theme-hint-color)]">
            {selectedFileName ? `Выбран файл: ${selectedFileName}` : "Файл ещё не выбран"}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button variant="outline" className="min-w-36 flex-1" disabled={!canCreateUploadUrl} onClick={onCreateUploadUrl}>
            {isCreatingUploadUrl ? "Создаю ссылку..." : "1) Создать ссылку загрузки"}
          </Button>
          <Button variant="secondary" className="min-w-36 flex-1" disabled={!canUploadFile} onClick={onUploadFile}>
            {isUploadingFile ? "Загружаю файл..." : "2) Загрузить и проверить файл"}
          </Button>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button variant="outline" className="px-4" disabled={!uploadPath || isCreatingUploadUrl} onClick={onCopyUploadPath}>
            {isUploadPathCopied ? "Скопировано" : "Копировать путь"}
          </Button>
          <Button
            variant="outline"
            className="px-4"
            disabled={isCreatingUploadUrl || isUploadingFile || (!fileName && !uploadPreview && !uploadPath)}
            onClick={onClear}
          >
            Очистить
          </Button>
        </div>

        {lastUploadCreatedAt ? (
          <p className="text-xs text-[var(--tg-theme-hint-color)]">Последняя ссылка: {lastUploadCreatedAt}</p>
        ) : null}
        {lastUploadVerifiedAt ? (
          <p className="text-xs text-[var(--tg-theme-hint-color)]">Последняя проверка файла: {lastUploadVerifiedAt}</p>
        ) : null}

        {uploadPreview ? (
          <p className="break-all rounded-xl bg-[var(--tg-theme-bg-color)] p-3 text-xs">{uploadPreview}</p>
        ) : (
          <p className="rounded-xl bg-[var(--tg-theme-bg-color)] p-3 text-xs text-[var(--tg-theme-hint-color)]">
            Сначала создай signed URL, затем загрузи файл и проверь результат.
          </p>
        )}

        {uploadPath ? <p className="break-all text-xs text-[var(--tg-theme-hint-color)]">Path: {uploadPath}</p> : null}
        {uploadVerification ? (
          <p className="rounded-xl bg-emerald-500/10 p-3 text-xs text-emerald-600 dark:text-emerald-400">
            {uploadVerification}
          </p>
        ) : null}
        {error ? (
          <p role="alert" className="rounded-xl bg-red-500/10 p-3 text-xs text-red-500">
            {error}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
});
