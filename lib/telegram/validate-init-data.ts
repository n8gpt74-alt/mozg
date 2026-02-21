import { createHmac, timingSafeEqual } from "node:crypto";

import { z } from "zod";

const telegramUserSchema = z.object({
  id: z.number().int().positive(),
  first_name: z.string().min(1),
  last_name: z.string().optional(),
  username: z.string().optional(),
  language_code: z.string().optional(),
  photo_url: z.string().url().optional(),
  is_premium: z.boolean().optional(),
});

export type TelegramUser = z.infer<typeof telegramUserSchema>;

export class TelegramAuthError extends Error {
  status: number;

  constructor(message: string, status = 401) {
    super(message);
    this.name = "TelegramAuthError";
    this.status = status;
  }
}

function buildDataCheckString(params: URLSearchParams) {
  return [...params.entries()]
    .filter(([key]) => key !== "hash")
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");
}

function buildTelegramSecret(botToken: string) {
  return createHmac("sha256", "WebAppData").update(botToken).digest();
}

export function extractInitDataFromRequest(request: Request) {
  const authorization = request.headers.get("authorization");

  if (authorization) {
    const [scheme, ...rest] = authorization.trim().split(" ");
    const payload = rest.join(" ").trim();

    if ((/^bearer$/i.test(scheme) || /^tma$/i.test(scheme)) && payload) {
      return payload;
    }
  }

  const fallbackHeader = request.headers.get("x-telegram-init-data")?.trim();

  if (fallbackHeader) {
    return fallbackHeader;
  }

  throw new TelegramAuthError("Telegram initData is required in Authorization header");
}

export function validateTelegramInitData({
  initData,
  botToken,
  maxAgeSeconds,
}: {
  initData: string;
  botToken: string;
  maxAgeSeconds: number;
}) {
  const params = new URLSearchParams(initData);
  const hash = params.get("hash")?.toLowerCase();

  if (!hash || !/^[a-f0-9]{64}$/.test(hash)) {
    throw new TelegramAuthError("Telegram hash is missing or malformed");
  }

  const dataCheckString = buildDataCheckString(params);
  const expectedHash = createHmac("sha256", buildTelegramSecret(botToken))
    .update(dataCheckString)
    .digest("hex");

  const hashBuffer = Buffer.from(hash, "hex");
  const expectedHashBuffer = Buffer.from(expectedHash, "hex");

  if (
    hashBuffer.length !== expectedHashBuffer.length ||
    !timingSafeEqual(hashBuffer, expectedHashBuffer)
  ) {
    throw new TelegramAuthError("Telegram initData signature mismatch");
  }

  const authDate = Number(params.get("auth_date"));

  if (!Number.isInteger(authDate) || authDate <= 0) {
    throw new TelegramAuthError("Telegram auth_date is missing or invalid");
  }

  const currentUnixTime = Math.floor(Date.now() / 1000);

  if (currentUnixTime - authDate > maxAgeSeconds) {
    throw new TelegramAuthError("Telegram initData has expired");
  }

  const rawUser = params.get("user");

  if (!rawUser) {
    throw new TelegramAuthError("Telegram user payload is missing");
  }

  let parsedUserPayload: unknown;

  try {
    parsedUserPayload = JSON.parse(rawUser);
  } catch {
    throw new TelegramAuthError("Telegram user payload is invalid JSON");
  }

  const parsedUser = telegramUserSchema.safeParse(parsedUserPayload);

  if (!parsedUser.success) {
    throw new TelegramAuthError("Telegram user payload is invalid");
  }

  return {
    authDate,
    hash,
    user: parsedUser.data,
    queryId: params.get("query_id"),
    raw: initData,
  };
}
