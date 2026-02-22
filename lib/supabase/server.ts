import { createHmac } from "node:crypto";

import { createClient } from "@supabase/supabase-js";

import { getServerEnv } from "@/lib/env";
import type { TelegramUser } from "@/lib/telegram/validate-init-data";

function createAnonSupabaseClient() {
  const env = getServerEnv();

  return createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });
}

function createAdminSupabaseClient() {
  const env = getServerEnv();

  return createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });
}

function deriveTelegramCredentials(telegramId: string, botToken: string) {
  const digest = createHmac("sha256", botToken)
    .update(`megamozg-telegram-auth:${telegramId}`)
    .digest("hex");

  return {
    email: `tg_${telegramId}@telegram.local`,
    password: `Tg!${digest}`,
  };
}

async function signInTelegramUser(email: string, password: string) {
  const anonClient = createAnonSupabaseClient();
  const signInResult = await anonClient.auth.signInWithPassword({
    email,
    password,
  });

  if (signInResult.error || !signInResult.data.session) {
    return null;
  }

  return {
    accessToken: signInResult.data.session.access_token,
  };
}

function isAlreadyRegisteredError(message: string) {
  return /already registered|already been registered/i.test(message);
}

async function ensureTelegramAuthUser({
  telegramId,
  telegramUser,
}: {
  telegramId: string;
  telegramUser: TelegramUser;
}) {
  const env = getServerEnv();
  const credentials = deriveTelegramCredentials(telegramId, env.TELEGRAM_BOT_TOKEN);

  const existingSession = await signInTelegramUser(credentials.email, credentials.password);

  if (existingSession) {
    return {
      accessToken: existingSession.accessToken,
    };
  }

  const adminClient = createAdminSupabaseClient();
  const createResult = await adminClient.auth.admin.createUser({
    email: credentials.email,
    password: credentials.password,
    email_confirm: true,
    user_metadata: {
      telegram_id: telegramId,
      first_name: telegramUser.first_name,
      last_name: telegramUser.last_name ?? null,
      username: telegramUser.username ?? null,
      photo_url: telegramUser.photo_url ?? null,
    },
  });

  if (createResult.error && !isAlreadyRegisteredError(createResult.error.message)) {
    throw new Error(`Failed to create Supabase user: ${createResult.error.message}`);
  }

  const signedInSession = await signInTelegramUser(credentials.email, credentials.password);

  if (!signedInSession) {
    throw new Error("Failed to sign in Supabase user after creation");
  }

  return {
    accessToken: signedInSession.accessToken,
  };
}

export async function createTelegramSupabaseClient({
  telegramId,
  telegramUser,
}: {
  telegramId: string;
  telegramUser: TelegramUser;
}) {
  const env = getServerEnv();
  const session = await ensureTelegramAuthUser({
    telegramId,
    telegramUser,
  });

  return createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
    global: {
      headers: {
        Authorization: `Bearer ${session.accessToken}`,
      },
    },
  });
}
