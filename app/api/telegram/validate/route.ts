import { NextResponse } from "next/server";

import { getServerEnv } from "@/lib/env";
import {
  applyRouteHeaders,
  attachTelegramId,
  createRouteContext,
  handleRouteError,
  logRouteSuccess,
} from "@/lib/http/route-error";
import { consumeRateLimit, getClientRateLimitKey, getRateLimitHeaders } from "@/lib/http/rate-limit";
import { authenticateTelegramRequest } from "@/lib/telegram/auth";

const ROUTE_PATH = "/api/telegram/validate";

export async function POST(request: Request) {
  const context = createRouteContext(request, ROUTE_PATH);

  try {
    const env = getServerEnv();
    const rateLimit = consumeRateLimit({
      route: ROUTE_PATH,
      key: getClientRateLimitKey(request),
      limit: env.API_RATE_LIMIT_VALIDATE_MAX,
      windowMs: env.API_RATE_LIMIT_WINDOW_SECONDS * 1000,
    });

    const authContext = await authenticateTelegramRequest(request);
    attachTelegramId(context, authContext.telegramId);

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

    const response = NextResponse.json({
      telegramUser: authContext.telegramUser,
      telegramId: authContext.telegramId,
    });

    logRouteSuccess(context, 200, { action: "validate_session" });
    return applyRouteHeaders(response, context, getRateLimitHeaders(rateLimit));
  } catch (error) {
    return handleRouteError(error, context);
  }
}
