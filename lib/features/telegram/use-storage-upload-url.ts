"use client";

import { useCallback, useMemo, useState } from "react";

import { FILE_NAME_MAX_LENGTH, FILE_NAME_SOFT_LIMIT } from "@/lib/features/telegram/constants";
import { formatTimeLabel, getErrorMessage } from "@/lib/features/telegram/utils";

type AuthHeaders = {
  Authorization: string;
  "Content-Type": string;
};

type UploadUrlResponse = {
  bucket?: string;
  path?: string;
  method?: string;
  signedUrl?: string;
  token?: string;
  error?: string;
};

type VerifyUploadResponse = {
  exists?: boolean;
  path?: string;
  file?: {
    name?: string;
    size?: number | null;
    mimeType?: string | null;
    updatedAt?: string | null;
  } | null;
  error?: string;
};

export function sanitizeFileName(fileName: string) {
  return fileName.replace(/[^a-zA-Z0-9_.-]/g, "_");
}

export function useStorageUploadUrl(authHeaders: AuthHeaders | null) {
  const [fileName, setFileName] = useState("notes.txt");
  const [uploadPreview, setUploadPreview] = useState("");
  const [uploadPath, setUploadPath] = useState("");
  const [lastUploadCreatedAt, setLastUploadCreatedAt] = useState<string | null>(null);
  const [lastUploadVerifiedAt, setLastUploadVerifiedAt] = useState<string | null>(null);
  const [isUploadPathCopied, setIsUploadPathCopied] = useState(false);
  const [isCreatingUploadUrl, setIsCreatingUploadUrl] = useState(false);
  const [isUploadingFile, setIsUploadingFile] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [signedUploadUrl, setSignedUploadUrl] = useState("");
  const [uploadVerification, setUploadVerification] = useState("");
  const [error, setError] = useState("");

  const trimmedFileName = useMemo(() => fileName.trim(), [fileName]);
  const fileNameLength = trimmedFileName.length;
  const fileNameCharsLeft = FILE_NAME_MAX_LENGTH - fileNameLength;
  const isFileNameTooLong = fileNameLength > FILE_NAME_MAX_LENGTH;
  const isFileNameNearLimit = fileNameLength >= FILE_NAME_SOFT_LIMIT;
  const sanitizedFileNamePreview = useMemo(() => {
    if (!trimmedFileName) {
      return null;
    }

    return sanitizeFileName(trimmedFileName);
  }, [trimmedFileName]);

  const canCreateUploadUrl =
    Boolean(authHeaders) && !isCreatingUploadUrl && Boolean(trimmedFileName) && !isFileNameTooLong;
  const canUploadFile = Boolean(selectedFile) && Boolean(uploadPath) && Boolean(signedUploadUrl) && !isUploadingFile;

  const createUploadUrl = useCallback(async () => {
    if (!authHeaders || !trimmedFileName) {
      return;
    }

    if (isFileNameTooLong) {
      setError(`Имя файла слишком длинное. Максимум ${FILE_NAME_MAX_LENGTH} символов.`);
      return;
    }

    try {
      setIsCreatingUploadUrl(true);
      setError("");
      setUploadVerification("");

      const response = await fetch("/api/storage/upload-url", {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({ fileName: trimmedFileName }),
      });

      const payload = (await response.json()) as UploadUrlResponse;

      if (!response.ok) {
        throw new Error(payload.error ?? "Не удалось создать ссылку загрузки");
      }

      const uploadPathValue = payload.path ?? "";
      setUploadPath(uploadPathValue);
      setSignedUploadUrl(payload.signedUrl ?? "");
      setUploadPreview(
        uploadPathValue
          ? `Ссылка готова: ${payload.bucket ?? "bucket"}/${uploadPathValue}`
          : "Ссылка готова",
      );
      setLastUploadCreatedAt(formatTimeLabel());
      setIsUploadPathCopied(false);
    } catch (requestError) {
      setUploadPath("");
      setUploadPreview("");
      setSignedUploadUrl("");
      setUploadVerification("");
      setError(getErrorMessage(requestError));
    } finally {
      setIsCreatingUploadUrl(false);
    }
  }, [authHeaders, isFileNameTooLong, trimmedFileName]);

  const clear = useCallback(() => {
    setUploadPreview("");
    setUploadPath("");
    setSignedUploadUrl("");
    setLastUploadCreatedAt(null);
    setLastUploadVerifiedAt(null);
    setUploadVerification("");
    setSelectedFile(null);
    setIsUploadPathCopied(false);
    setError("");
  }, []);

  const applyFileNamePreset = useCallback((preset: string) => {
    setFileName(preset);
    setError("");
  }, []);

  const setSelectedUploadFile = useCallback((file: File | null) => {
    setSelectedFile(file);

    if (file?.name) {
      setFileName(file.name);
    }

    setUploadVerification("");
    setError("");
  }, []);

  const copyUploadPath = useCallback(async () => {
    if (!uploadPath) {
      return;
    }

    try {
      if (!navigator.clipboard?.writeText) {
        throw new Error("Буфер обмена недоступен в этом окружении");
      }

      await navigator.clipboard.writeText(uploadPath);
      setIsUploadPathCopied(true);

      window.setTimeout(() => {
        setIsUploadPathCopied(false);
      }, 1600);
    } catch (copyError) {
      setError(getErrorMessage(copyError));
    }
  }, [uploadPath]);

  const uploadSelectedFile = useCallback(async () => {
    if (!selectedFile || !signedUploadUrl || !uploadPath || !authHeaders) {
      return;
    }

    try {
      setIsUploadingFile(true);
      setError("");
      setUploadVerification("");

      const uploadResponse = await fetch(signedUploadUrl, {
        method: "PUT",
        headers: {
          "Content-Type": selectedFile.type || "application/octet-stream",
        },
        body: selectedFile,
      });

      if (!uploadResponse.ok) {
        const uploadErrorBody = await uploadResponse.text();
        throw new Error(uploadErrorBody || "Файл не удалось загрузить по signed URL");
      }

      const verifyResponse = await fetch("/api/storage/verify-upload", {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({ path: uploadPath }),
      });

      const verifyPayload = (await verifyResponse.json()) as VerifyUploadResponse;

      if (!verifyResponse.ok) {
        throw new Error(verifyPayload.error ?? "Не удалось проверить загруженный файл");
      }

      if (!verifyPayload.exists) {
        throw new Error("Файл загружен, но не найден в storage");
      }

      setLastUploadVerifiedAt(formatTimeLabel());
      setUploadVerification(
        `Файл загружен и подтверждён: ${verifyPayload.file?.name ?? selectedFile.name}`,
      );
    } catch (uploadError) {
      setUploadVerification("");
      setError(getErrorMessage(uploadError));
    } finally {
      setIsUploadingFile(false);
    }
  }, [authHeaders, selectedFile, signedUploadUrl, uploadPath]);

  return {
    fileName,
    setFileName,
    uploadPreview,
    uploadPath,
    lastUploadCreatedAt,
    lastUploadVerifiedAt,
    isUploadPathCopied,
    isCreatingUploadUrl,
    isUploadingFile,
    selectedFile,
    uploadVerification,
    canCreateUploadUrl,
    canUploadFile,
    fileNameCharsLeft,
    isFileNameTooLong,
    isFileNameNearLimit,
    sanitizedFileNamePreview,
    createUploadUrl,
    uploadSelectedFile,
    clear,
    applyFileNamePreset,
    setSelectedUploadFile,
    copyUploadPath,
    error,
    setError,
  };
}
