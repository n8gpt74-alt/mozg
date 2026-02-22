import { getServerEnv } from "@/lib/env";
import { createTelegramSupabaseClient } from "@/lib/supabase/server";

import { extractInitDataFromRequest, validateTelegramInitData } from "./validate-init-data";

export async function authenticateTelegramRequest(request: Request) {
  const env = getServerEnv();
  const initData = extractInitDataFromRequest(request);
  const validated = validateTelegramInitData({
    initData,
    botToken: env.TELEGRAM_BOT_TOKEN,
    maxAgeSeconds: env.TELEGRAM_INIT_DATA_MAX_AGE_SECONDS,
  });

  const telegramId = String(validated.user.id);
  const client = await createTelegramSupabaseClient({
    telegramId,
    telegramUser: validated.user,
  });

  return {
    telegramId,
    telegramUser: validated.user,
    initData,
    supabase: client,
  };
}
