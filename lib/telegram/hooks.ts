"use client";

import { useEffect, useMemo, useState } from "react";
import type { ThemeParams, WebApp, WebAppInitData } from "@twa-dev/types";

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

function readSnapshot(webApp: WebApp): TelegramSnapshot {
  return {
    isTelegram: Boolean(webApp.initData),
    colorScheme: webApp.colorScheme,
    themeParams: webApp.themeParams,
    initData: webApp.initData,
    initDataUnsafe: webApp.initDataUnsafe,
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
  const [snapshot, setSnapshot] = useState<TelegramSnapshot>(fallbackSnapshot);

  useEffect(() => {
    let active = true;
    let cleanup: (() => void) | undefined;

    const initialize = async () => {
      try {
        const sdkModule = await import("@twa-dev/sdk");
        const webApp = sdkModule.default as WebApp | undefined;

        if (!active || !webApp) {
          return;
        }

        if (!telegramBootstrapped) {
          webApp.ready();
          webApp.expand();
          telegramBootstrapped = true;
        }

        const updateSnapshot = () => {
          if (!active) {
            return;
          }

          setSnapshot(readSnapshot(webApp));
        };

        updateSnapshot();

        webApp.onEvent("themeChanged", updateSnapshot);
        webApp.onEvent("viewportChanged", updateSnapshot);

        cleanup = () => {
          webApp.offEvent("themeChanged", updateSnapshot);
          webApp.offEvent("viewportChanged", updateSnapshot);
        };
      } catch (error) {
        console.error("Failed to initialize Telegram SDK", error);
        setSnapshot(fallbackSnapshot);
      }
    };

    void initialize();

    return () => {
      active = false;
      cleanup?.();
    };
  }, []);

  return snapshot;
}

export function useTelegramTheme() {
  const snapshot = useTelegramSnapshot();

  useEffect(() => {
    if (!snapshot.isTelegram) {
      return;
    }

    applyThemeVariables(snapshot.themeParams, snapshot.colorScheme);
  }, [snapshot.colorScheme, snapshot.isTelegram, snapshot.themeParams]);

  return useMemo(
    () => ({
      colorScheme: snapshot.colorScheme,
      themeParams: snapshot.themeParams,
      isTelegram: snapshot.isTelegram,
    }),
    [snapshot.colorScheme, snapshot.isTelegram, snapshot.themeParams],
  );
}

export function useTelegramInitData() {
  const snapshot = useTelegramSnapshot();

  return useMemo(
    () => ({
      isTelegram: snapshot.isTelegram,
      initData: snapshot.initData,
      initDataUnsafe: snapshot.initDataUnsafe,
    }),
    [snapshot.initData, snapshot.initDataUnsafe, snapshot.isTelegram],
  );
}
