import { createHmac } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  TelegramAuthError,
  extractInitDataFromRequest,
  validateTelegramInitData,
} from "@/lib/telegram/validate-init-data";

const BOT_TOKEN = "123456:TEST_TOKEN";

function signInitData(payload: Record<string, string>) {
  const dataCheckString = Object.entries(payload)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");

  const secret = createHmac("sha256", "WebAppData").update(BOT_TOKEN).digest();
  const hash = createHmac("sha256", secret).update(dataCheckString).digest("hex");

  return new URLSearchParams({
    ...payload,
    hash,
  }).toString();
}

describe("extractInitDataFromRequest", () => {
  it("extracts raw initData from tma authorization header", () => {
    const request = new Request("http://localhost/test", {
      headers: {
        Authorization: "tma user=abc&hash=xyz",
      },
    });

    expect(extractInitDataFromRequest(request)).toBe("user=abc&hash=xyz");
  });

  it("throws auth error when initData is missing", () => {
    const request = new Request("http://localhost/test");

    expect(() => extractInitDataFromRequest(request)).toThrow(TelegramAuthError);
  });
});

describe("validateTelegramInitData", () => {
  it("validates signed initData and returns parsed user", () => {
    const authDate = String(Math.floor(Date.now() / 1000));
    const userPayload = JSON.stringify({
      id: 42,
      first_name: "Test",
      username: "qa_user",
    });

    const initData = signInitData({
      auth_date: authDate,
      user: userPayload,
    });

    const result = validateTelegramInitData({
      initData,
      botToken: BOT_TOKEN,
      maxAgeSeconds: 60,
    });

    expect(result.user.id).toBe(42);
    expect(result.user.first_name).toBe("Test");
    expect(result.hash).toHaveLength(64);
  });

  it("rejects payload with invalid signature", () => {
    const authDate = String(Math.floor(Date.now() / 1000));
    const userPayload = JSON.stringify({
      id: 42,
      first_name: "Test",
      username: "qa_user",
    });

    const validInitData = signInitData({
      auth_date: authDate,
      user: userPayload,
    });

    const tampered = new URLSearchParams(validInitData);
    tampered.set("user", JSON.stringify({ id: 42, first_name: "Tampered" }));

    expect(() =>
      validateTelegramInitData({
        initData: tampered.toString(),
        botToken: BOT_TOKEN,
        maxAgeSeconds: 60,
      }),
    ).toThrow("signature mismatch");
  });

  it("rejects expired auth_date", () => {
    const authDate = String(Math.floor(Date.now() / 1000) - 120);
    const userPayload = JSON.stringify({
      id: 42,
      first_name: "Test",
    });

    const initData = signInitData({
      auth_date: authDate,
      user: userPayload,
    });

    expect(() =>
      validateTelegramInitData({
        initData,
        botToken: BOT_TOKEN,
        maxAgeSeconds: 30,
      }),
    ).toThrow("expired");
  });
});
