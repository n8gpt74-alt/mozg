"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import type { ValidateResponse } from "@/lib/features/telegram/constants";
import { compactValue, formatTimeLabel, getErrorMessage } from "@/lib/features/telegram/utils";

export function useTelegramSession(initData: string) {
  const [manualInitData, setManualInitData] = useState("");
  const [authInfo, setAuthInfo] = useState<ValidateResponse | null>(null);
  const [isCheckingSession, setIsCheckingSession] = useState(false);
  const [lastSessionCheckAt, setLastSessionCheckAt] = useState<string | null>(null);
  const [error, setError] = useState("");

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
      setLastSessionCheckAt(formatTimeLabel());
    } catch (requestError) {
      setAuthInfo(null);
      setError(getErrorMessage(requestError));
      setLastSessionCheckAt(formatTimeLabel());
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

  const clearManualInitData = useCallback(() => {
    setManualInitData("");
    setAuthInfo(null);
    setLastSessionCheckAt(null);
    setError("");
  }, []);

  return {
    manualInitData,
    setManualInitData,
    clearManualInitData,
    effectiveInitData,
    authHeaders,
    authInfo,
    isCheckingSession,
    lastSessionCheckAt,
    sessionSourceLabel,
    initDataLength,
    initDataPreview,
    validateSession,
    error,
    setError,
  };
}
