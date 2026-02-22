"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import {
  MEMORY_INPUT_MAX_LENGTH,
  MEMORY_INPUT_SOFT_LIMIT,
  type MemoryItem,
} from "@/lib/features/telegram/constants";
import { formatTimeLabel, getErrorMessage } from "@/lib/features/telegram/utils";

type AuthHeaders = {
  Authorization: string;
  "Content-Type": string;
};

type MemoryListResponse = {
  items?: MemoryItem[];
  sources?: string[];
  error?: string;
};

export function useMemory(authHeaders: AuthHeaders | null) {
  const [memoryInput, setMemoryInput] = useState("");
  const [isSavingMemory, setIsSavingMemory] = useState(false);
  const [memorySavePreview, setMemorySavePreview] = useState("");
  const [lastMemorySavedAt, setLastMemorySavedAt] = useState<string | null>(null);
  const [saveError, setSaveError] = useState("");

  const [memoryItems, setMemoryItems] = useState<MemoryItem[]>([]);
  const [availableSources, setAvailableSources] = useState<string[]>([]);
  const [sourceFilter, setSourceFilter] = useState("");
  const [isLoadingMemoryList, setIsLoadingMemoryList] = useState(false);
  const [listError, setListError] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const trimmedMemoryInput = useMemo(() => memoryInput.trim(), [memoryInput]);
  const memoryLength = trimmedMemoryInput.length;
  const memoryCharsLeft = MEMORY_INPUT_MAX_LENGTH - memoryLength;
  const isMemoryTooLong = memoryLength > MEMORY_INPUT_MAX_LENGTH;
  const isMemoryNearLimit = memoryLength >= MEMORY_INPUT_SOFT_LIMIT;
  const canRemember = Boolean(authHeaders) && !isSavingMemory && Boolean(trimmedMemoryInput) && !isMemoryTooLong;

  const activeSourceFilter = sourceFilter.trim();

  const loadMemory = useCallback(async () => {
    if (!authHeaders) {
      setMemoryItems([]);
      setAvailableSources([]);
      setListError("");
      return;
    }

    try {
      setIsLoadingMemoryList(true);
      setListError("");

      const searchParams = new URLSearchParams();
      if (activeSourceFilter) {
        searchParams.set("source", activeSourceFilter);
      }

      const url = searchParams.toString()
        ? `/api/ai/memory?${searchParams.toString()}`
        : "/api/ai/memory";

      const response = await fetch(url, {
        method: "GET",
        headers: {
          Authorization: authHeaders.Authorization,
        },
      });

      const payload = (await response.json()) as MemoryListResponse;

      if (!response.ok) {
        throw new Error(payload.error ?? "Не удалось загрузить память");
      }

      setMemoryItems(payload.items ?? []);
      setAvailableSources(payload.sources ?? []);
    } catch (requestError) {
      setListError(getErrorMessage(requestError));
    } finally {
      setIsLoadingMemoryList(false);
    }
  }, [activeSourceFilter, authHeaders]);

  useEffect(() => {
    void loadMemory();
  }, [loadMemory]);

  const remember = useCallback(async () => {
    if (!authHeaders || !trimmedMemoryInput) {
      return;
    }

    if (isMemoryTooLong) {
      setSaveError(`Заметка слишком длинная. Максимум ${MEMORY_INPUT_MAX_LENGTH} символов.`);
      return;
    }

    try {
      setIsSavingMemory(true);
      setSaveError("");

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
      setLastMemorySavedAt(formatTimeLabel());
      await loadMemory();
    } catch (requestError) {
      setMemorySavePreview("");
      setSaveError(getErrorMessage(requestError));
    } finally {
      setIsSavingMemory(false);
    }
  }, [authHeaders, isMemoryTooLong, loadMemory, trimmedMemoryInput]);

  const clearComposer = useCallback(() => {
    setMemoryInput("");
    setMemorySavePreview("");
    setLastMemorySavedAt(null);
    setSaveError("");
  }, []);

  const applyMemoryPreset = useCallback((preset: string) => {
    setMemoryInput(preset);
    setSaveError("");
  }, []);

  const deleteMemoryItem = useCallback(
    async (id: string) => {
      if (!authHeaders) {
        return;
      }

      try {
        setDeletingId(id);
        setListError("");

        const response = await fetch("/api/ai/memory", {
          method: "DELETE",
          headers: authHeaders,
          body: JSON.stringify({ id }),
        });

        const payload = (await response.json()) as { error?: string };

        if (!response.ok) {
          throw new Error(payload.error ?? "Не удалось удалить заметку");
        }

        setMemoryItems((current) => current.filter((item) => item.id !== id));
      } catch (requestError) {
        setListError(getErrorMessage(requestError));
      } finally {
        setDeletingId(null);
      }
    },
    [authHeaders],
  );

  const clearFilter = useCallback(() => {
    setSourceFilter("");
  }, []);

  return {
    memoryInput,
    setMemoryInput,
    isSavingMemory,
    memorySavePreview,
    lastMemorySavedAt,
    canRemember,
    memoryCharsLeft,
    isMemoryTooLong,
    isMemoryNearLimit,
    remember,
    clearComposer,
    applyMemoryPreset,
    saveError,
    memoryItems,
    availableSources,
    sourceFilter,
    setSourceFilter,
    clearFilter,
    isLoadingMemoryList,
    listError,
    deletingId,
    deleteMemoryItem,
    refreshMemoryList: loadMemory,
  };
}
