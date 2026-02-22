"use client";

import { type RefObject, useMemo, useRef, useState } from "react";

import { AiCard } from "@/components/telegram/ai-card";
import { MemoryCard } from "@/components/telegram/memory-card";
import { MenuCard } from "@/components/telegram/menu-card";
import { SessionCard } from "@/components/telegram/session-card";
import { StorageCard } from "@/components/telegram/storage-card";
import {
  type MenuSection,
  type SectionStatus,
  menuSections,
} from "@/lib/features/telegram/constants";
import { useAiCompletion } from "@/lib/features/telegram/use-ai-completion";
import { useMemory } from "@/lib/features/telegram/use-memory";
import { useStorageUploadUrl } from "@/lib/features/telegram/use-storage-upload-url";
import { useTelegramSession } from "@/lib/features/telegram/use-telegram-session";
import { useTelegramSnapshot, useTelegramTheme } from "@/lib/telegram/hooks";

export function TelegramShell() {
  const { colorScheme, isTelegram } = useTelegramTheme();
  const { initData, initDataUnsafe } = useTelegramSnapshot();

  const [activeSection, setActiveSection] = useState<MenuSection>("session");

  const sessionRef = useRef<HTMLDivElement | null>(null);
  const aiRef = useRef<HTMLDivElement | null>(null);
  const memoryRef = useRef<HTMLDivElement | null>(null);
  const storageRef = useRef<HTMLDivElement | null>(null);

  const sectionRefs: Record<MenuSection, RefObject<HTMLDivElement | null>> = {
    session: sessionRef,
    ai: aiRef,
    memory: memoryRef,
    storage: storageRef,
  };

  const session = useTelegramSession(initData);
  const ai = useAiCompletion(session.authHeaders);
  const memory = useMemory(session.authHeaders);
  const storage = useStorageUploadUrl(session.authHeaders);

  const trimmedPrompt = ai.prompt.trim();
  const trimmedMemoryInput = memory.memoryInput.trim();
  const trimmedFileName = storage.fileName.trim();

  const sectionStatus = useMemo<Record<MenuSection, SectionStatus>>(() => {
    const hasSession = Boolean(session.authInfo);
    const hasAuthSource = Boolean(session.effectiveInitData);
    const hasPrompt = Boolean(trimmedPrompt);
    const hasMemory = Boolean(trimmedMemoryInput);
    const hasFileName = Boolean(trimmedFileName);

    return {
      session: {
        ready: hasSession,
        note: session.isCheckingSession
          ? "Проверяем сессию"
          : hasSession
            ? "Сессия подтверждена"
            : hasAuthSource
              ? "Нужна проверка"
              : "Нужен initData",
      },
      ai: {
        ready: hasSession && hasPrompt && !ai.isPromptTooLong,
        note: !hasSession
          ? "Сначала подтверди сессию"
          : ai.isPromptTooLong
            ? "Сократи вопрос до 4000 символов"
            : hasPrompt
              ? "Вопрос готов"
              : "Добавь вопрос",
      },
      memory: {
        ready: hasSession && hasMemory && !memory.isMemoryTooLong,
        note: !hasSession
          ? "Сначала подтверди сессию"
          : memory.isMemoryTooLong
            ? "Сократи заметку до 12000 символов"
            : hasMemory
              ? "Текст готов"
              : "Добавь заметку",
      },
      storage: {
        ready: hasSession && hasFileName && !storage.isFileNameTooLong,
        note: !hasSession
          ? "Сначала подтверди сессию"
          : storage.isFileNameTooLong
            ? "Сократи имя до 120 символов"
            : hasFileName
              ? "Имя файла готово"
              : "Укажи имя файла",
      },
    };
  }, [
    ai.isPromptTooLong,
    memory.isMemoryTooLong,
    session.authInfo,
    session.effectiveInitData,
    session.isCheckingSession,
    storage.isFileNameTooLong,
    trimmedFileName,
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

  function goToSection(section: MenuSection) {
    setActiveSection(section);
    sectionRefs[section].current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <div className="flex w-full flex-col gap-4 pb-4">
      <MenuCard
        activeSection={activeSection}
        sectionStatus={sectionStatus}
        readySectionsCount={readySectionsCount}
        completionPercent={completionPercent}
        firstPendingSection={firstPendingSection}
        onGoToSection={goToSection}
      />

      <SessionCard
        ref={sessionRef}
        colorScheme={colorScheme}
        isTelegram={isTelegram}
        initDataUnsafe={initDataUnsafe}
        authInfo={session.authInfo}
        isCheckingSession={session.isCheckingSession}
        effectiveInitData={session.effectiveInitData}
        lastSessionCheckAt={session.lastSessionCheckAt}
        sessionSourceLabel={session.sessionSourceLabel}
        initDataLength={session.initDataLength}
        initDataPreview={session.initDataPreview}
        manualInitData={session.manualInitData}
        onManualInitDataChange={session.setManualInitData}
        onClearManualInitData={session.clearManualInitData}
        onValidateSession={() => {
          void session.validateSession();
        }}
        error={session.error}
      />

      <AiCard
        ref={aiRef}
        prompt={ai.prompt}
        onPromptChange={ai.setPrompt}
        onAsk={() => {
          void ai.ask();
        }}
        onClear={ai.clear}
        onApplyPreset={ai.applyPromptPreset}
        onCopyAnswer={() => {
          void ai.copyAnswer();
        }}
        answer={ai.answer}
        isAsking={ai.isAsking}
        canAskAi={ai.canAskAi}
        isAnswerCopied={ai.isAnswerCopied}
        promptCharsLeft={ai.promptCharsLeft}
        isPromptTooLong={ai.isPromptTooLong}
        isPromptNearLimit={ai.isPromptNearLimit}
        lastAiResponseAt={ai.lastAiResponseAt}
        aiMatches={ai.aiMatches}
        bestMatchPercent={ai.bestMatchPercent}
        topAiMatches={ai.topAiMatches}
        error={ai.error}
      />

      <MemoryCard
        ref={memoryRef}
        memoryInput={memory.memoryInput}
        onMemoryInputChange={memory.setMemoryInput}
        onRemember={() => {
          void memory.remember();
        }}
        onClearComposer={memory.clearComposer}
        onApplyPreset={memory.applyMemoryPreset}
        isSavingMemory={memory.isSavingMemory}
        canRemember={memory.canRemember}
        memoryCharsLeft={memory.memoryCharsLeft}
        isMemoryTooLong={memory.isMemoryTooLong}
        isMemoryNearLimit={memory.isMemoryNearLimit}
        lastMemorySavedAt={memory.lastMemorySavedAt}
        memorySavePreview={memory.memorySavePreview}
        saveError={memory.saveError}
        memoryItems={memory.memoryItems}
        availableSources={memory.availableSources}
        sourceFilter={memory.sourceFilter}
        onSourceFilterChange={memory.setSourceFilter}
        onClearFilter={memory.clearFilter}
        isLoadingMemoryList={memory.isLoadingMemoryList}
        listError={memory.listError}
        deletingId={memory.deletingId}
        onDeleteMemoryItem={(id) => {
          void memory.deleteMemoryItem(id);
        }}
        onRefreshMemoryList={() => {
          void memory.refreshMemoryList();
        }}
      />

      <StorageCard
        ref={storageRef}
        fileName={storage.fileName}
        onFileNameChange={storage.setFileName}
        onCreateUploadUrl={() => {
          void storage.createUploadUrl();
        }}
        onUploadFile={() => {
          void storage.uploadSelectedFile();
        }}
        onFileSelected={storage.setSelectedUploadFile}
        onCopyUploadPath={() => {
          void storage.copyUploadPath();
        }}
        onClear={storage.clear}
        onApplyPreset={storage.applyFileNamePreset}
        isCreatingUploadUrl={storage.isCreatingUploadUrl}
        isUploadingFile={storage.isUploadingFile}
        canCreateUploadUrl={storage.canCreateUploadUrl}
        canUploadFile={storage.canUploadFile}
        fileNameCharsLeft={storage.fileNameCharsLeft}
        isFileNameTooLong={storage.isFileNameTooLong}
        isFileNameNearLimit={storage.isFileNameNearLimit}
        sanitizedFileNamePreview={storage.sanitizedFileNamePreview}
        trimmedFileName={trimmedFileName}
        selectedFileName={storage.selectedFile?.name ?? ""}
        uploadPath={storage.uploadPath}
        uploadPreview={storage.uploadPreview}
        uploadVerification={storage.uploadVerification}
        lastUploadCreatedAt={storage.lastUploadCreatedAt}
        lastUploadVerifiedAt={storage.lastUploadVerifiedAt}
        isUploadPathCopied={storage.isUploadPathCopied}
        error={storage.error}
      />
    </div>
  );
}
