"use client";

import { useEffect, useSyncExternalStore } from "react";
import WebApp from "@twa-dev/sdk";
import type { ThemeParams, WebAppInitData } from "@twa-dev/types";

type TelegramSnapshot = {
  isTelegram: boolean;
  colorScheme: "light" | "dark";
  themeParams: Partial<ThemeParams>;
  initData: string;
  initDataUnsafe: WebAppInitData | null;
};

const fallbackSnapshot: TelegramSnapshot = {
  isTelegram: false,
  colorScheme: "light",
  themeParams: {},
  initData: "",
  initDataUnsafe: null,
};

let telegramBootstrapped = false;

function bootstrapTelegramWebApp() {
  if (telegramBootstrapped || typeof window === "undefined") {
    return;
  }

  WebApp.ready();
  WebApp.expand();
  telegramBootstrapped = true;
}

function readSnapshot(): TelegramSnapshot {
  if (typeof window === "undefined") {
    return fallbackSnapshot;
  }

  return {
    isTelegram: Boolean(WebApp.initData),
    colorScheme: WebApp.colorScheme,
    themeParams: WebApp.themeParams,
    initData: WebApp.initData,
    initDataUnsafe: WebApp.initDataUnsafe,
  };
}

function subscribe(onStoreChange: () => void) {
  if (typeof window === "undefined") {
    return () => undefined;
  }

  const handler = () => onStoreChange();

  WebApp.onEvent("themeChanged", handler);
  WebApp.onEvent("viewportChanged", handler);

  return () => {
    WebApp.offEvent("themeChanged", handler);
    WebApp.offEvent("viewportChanged", handler);
  };
}

function applyThemeVariables(themeParams: Partial<ThemeParams>, colorScheme: "light" | "dark") {
  const root = document.documentElement;

  root.dataset.tgColorScheme = colorScheme;

  const variableMap: Array<[string, string | undefined]> = [
    ["--tg-theme-bg-color", themeParams.bg_color],
    ["--tg-theme-secondary-bg-color", themeParams.secondary_bg_color],
    ["--tg-theme-text-color", themeParams.text_color],
    ["--tg-theme-hint-color", themeParams.hint_color],
    ["--tg-theme-link-color", themeParams.link_color],
    ["--tg-theme-button-color", themeParams.button_color],
    ["--tg-theme-button-text-color", themeParams.button_text_color],
    ["--tg-theme-header-bg-color", themeParams.header_bg_color],
  ];

  for (const [name, value] of variableMap) {
    if (value) {
      root.style.setProperty(name, value);
    }
  }
}

export function useTelegramSnapshot() {
  useEffect(() => {
    bootstrapTelegramWebApp();
  }, []);

  return useSyncExternalStore(subscribe, readSnapshot, () => fallbackSnapshot);
}

export function useTelegramTheme() {
  const snapshot = useTelegramSnapshot();

  useEffect(() => {
    if (!snapshot.isTelegram) {
      return;
    }

    applyThemeVariables(snapshot.themeParams, snapshot.colorScheme);
  }, [snapshot.colorScheme, snapshot.isTelegram, snapshot.themeParams]);

  return {
    colorScheme: snapshot.colorScheme,
    themeParams: snapshot.themeParams,
    isTelegram: snapshot.isTelegram,
  };
}

export function useTelegramInitData() {
  const snapshot = useTelegramSnapshot();

  return {
    isTelegram: snapshot.isTelegram,
    initData: snapshot.initData,
    initDataUnsafe: snapshot.initDataUnsafe,
  };
}
