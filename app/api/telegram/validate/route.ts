import { NextResponse } from "next/server";

import { handleRouteError } from "@/lib/http/route-error";
import { authenticateTelegramRequest } from "@/lib/telegram/auth";

export async function POST(request: Request) {
  try {
    const authContext = await authenticateTelegramRequest(request);

    const { error } = await authContext.supabase.from("telegram_profiles").upsert(
      {
        telegram_id: authContext.telegramId,
        username: authContext.telegramUser.username ?? null,
        first_name: authContext.telegramUser.first_name,
        last_name: authContext.telegramUser.last_name ?? null,
        photo_url: authContext.telegramUser.photo_url ?? null,
      },
      { onConflict: "telegram_id" },
    );

    if (error) {
      throw new Error(`Failed to upsert profile: ${error.message}`);
    }

    return NextResponse.json({
      telegramUser: authContext.telegramUser,
      telegramId: authContext.telegramId,
      supabaseAccessToken: authContext.supabaseAccessToken,
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
