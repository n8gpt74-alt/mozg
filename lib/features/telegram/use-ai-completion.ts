"use client";

import { useCallback, useMemo, useState } from "react";

import {
  AI_PROMPT_MAX_LENGTH,
  AI_PROMPT_SOFT_LIMIT,
  type AiStreamChunk,
  type MatchPreview,
} from "@/lib/features/telegram/constants";
import { compactValue, formatTimeLabel, getErrorMessage } from "@/lib/features/telegram/utils";

type AuthHeaders = {
  Authorization: string;
  "Content-Type": string;
};

function parseStreamLines(buffer: string) {
  const lines = buffer.split("\n");
  const pending = lines.pop() ?? "";
  const chunks: AiStreamChunk[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }

    const parsed = JSON.parse(trimmed) as AiStreamChunk;
    chunks.push(parsed);
  }

  return {
    chunks,
    pending,
  };
}

export function useAiCompletion(authHeaders: AuthHeaders | null) {
  const [prompt, setPrompt] = useState("");
  const [answer, setAnswer] = useState("");
  const [aiMatches, setAiMatches] = useState<MatchPreview[]>([]);
  const [isAsking, setIsAsking] = useState(false);
  const [lastAiResponseAt, setLastAiResponseAt] = useState<string | null>(null);
  const [isAnswerCopied, setIsAnswerCopied] = useState(false);
  const [error, setError] = useState("");

  const trimmedPrompt = useMemo(() => prompt.trim(), [prompt]);
  const promptLength = trimmedPrompt.length;
  const promptCharsLeft = AI_PROMPT_MAX_LENGTH - promptLength;
  const isPromptTooLong = promptLength > AI_PROMPT_MAX_LENGTH;
  const isPromptNearLimit = promptLength >= AI_PROMPT_SOFT_LIMIT;
  const canAskAi = Boolean(authHeaders) && !isAsking && Boolean(trimmedPrompt) && !isPromptTooLong;

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

  const ask = useCallback(async () => {
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

      if (!response.ok) {
        const payload = (await response.json()) as { error?: string };
        throw new Error(payload.error ?? "Ошибка запроса к ИИ");
      }

      if (!response.body) {
        throw new Error("Сервер не вернул поток ответа");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let pending = "";

      while (true) {
        const { value, done } = await reader.read();

        if (done) {
          break;
        }

        pending += decoder.decode(value, { stream: true });
        const parsed = parseStreamLines(pending);
        pending = parsed.pending;

        for (const chunk of parsed.chunks) {
          if (chunk.type === "meta") {
            setAiMatches(chunk.matches);
            continue;
          }

          if (chunk.type === "text-delta") {
            setAnswer((current) => current + chunk.delta);
            continue;
          }

          if (chunk.type === "error") {
            throw new Error(chunk.error || "Поток ИИ завершился с ошибкой");
          }

          if (chunk.type === "done") {
            setAnswer(chunk.text);
            setLastAiResponseAt(formatTimeLabel());
          }
        }
      }

      if (pending.trim()) {
        const trailingChunk = JSON.parse(pending.trim()) as AiStreamChunk;
        if (trailingChunk.type === "done") {
          setAnswer(trailingChunk.text);
          setLastAiResponseAt(formatTimeLabel());
        }
      }

      setLastAiResponseAt((current) => current ?? formatTimeLabel());
    } catch (requestError) {
      setAiMatches([]);
      setError(getErrorMessage(requestError));
    } finally {
      setIsAsking(false);
    }
  }, [authHeaders, isPromptTooLong, trimmedPrompt]);

  const clear = useCallback(() => {
    setPrompt("");
    setAnswer("");
    setAiMatches([]);
    setIsAnswerCopied(false);
    setError("");
  }, []);

  const applyPromptPreset = useCallback((preset: string) => {
    setPrompt(preset);
    setError("");
    setIsAnswerCopied(false);
  }, []);

  const copyAnswer = useCallback(async () => {
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
  }, [answer]);

  return {
    prompt,
    setPrompt,
    answer,
    aiMatches,
    isAsking,
    lastAiResponseAt,
    isAnswerCopied,
    canAskAi,
    promptCharsLeft,
    isPromptTooLong,
    isPromptNearLimit,
    bestMatchPercent,
    topAiMatches,
    ask,
    clear,
    applyPromptPreset,
    copyAnswer,
    error,
    setError,
  };
}
