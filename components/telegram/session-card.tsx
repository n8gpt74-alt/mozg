import { forwardRef } from "react";
import type { WebAppInitData } from "@twa-dev/types";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import type { ValidateResponse } from "@/lib/features/telegram/constants";

type SessionCardProps = {
  colorScheme: "light" | "dark";
  isTelegram: boolean;
  initDataUnsafe: WebAppInitData | null;
  authInfo: ValidateResponse | null;
  isCheckingSession: boolean;
  effectiveInitData: string;
  lastSessionCheckAt: string | null;
  sessionSourceLabel: string;
  initDataLength: number;
  initDataPreview: string | null;
  manualInitData: string;
  onManualInitDataChange: (value: string) => void;
  onClearManualInitData: () => void;
  onValidateSession: () => void;
  error: string;
};

export const SessionCard = forwardRef<HTMLDivElement, SessionCardProps>(function SessionCard(
  {
    colorScheme,
    isTelegram,
    initDataUnsafe,
    authInfo,
    isCheckingSession,
    effectiveInitData,
    lastSessionCheckAt,
    sessionSourceLabel,
    initDataLength,
    initDataPreview,
    manualInitData,
    onManualInitDataChange,
    onClearManualInitData,
    onValidateSession,
    error,
  },
  ref,
) {
  return (
    <Card ref={ref}>
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
            onClick={onValidateSession}
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
                onClick={onClearManualInitData}
              >
                Очистить initData
              </Button>
            </div>
            <label htmlFor="manual-init-data" className="sr-only">
              Raw initData для проверки Telegram-сессии
            </label>
            <Textarea
              id="manual-init-data"
              aria-label="Raw initData для проверки Telegram-сессии"
              value={manualInitData}
              onChange={(event) => onManualInitDataChange(event.target.value)}
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

        {error ? (
          <p role="alert" className="rounded-xl bg-red-500/10 p-3 text-xs text-red-500">
            {error}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
});
