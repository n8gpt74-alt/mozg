import { NextResponse } from "next/server";
import { z } from "zod";

import { getServerEnv } from "@/lib/env";
import { HttpRouteError } from "@/lib/http/route-error";
import {
  applyRouteHeaders,
  attachTelegramId,
  createRouteContext,
  handleRouteError,
  logRouteSuccess,
} from "@/lib/http/route-error";
import { consumeRateLimit, getClientRateLimitKey, getRateLimitHeaders } from "@/lib/http/rate-limit";
import { authenticateTelegramRequest } from "@/lib/telegram/auth";

const ROUTE_PATH = "/api/storage/verify-upload";

const verifyRequestSchema = z.object({
  path: z.string().min(3).max(240),
});

export async function POST(request: Request) {
  const context = createRouteContext(request, ROUTE_PATH);

  try {
    const env = getServerEnv();
    const rateLimit = consumeRateLimit({
      route: ROUTE_PATH,
      key: getClientRateLimitKey(request),
      limit: env.API_RATE_LIMIT_STORAGE_UPLOAD_URL_MAX,
      windowMs: env.API_RATE_LIMIT_WINDOW_SECONDS * 1000,
    });

    const authContext = await authenticateTelegramRequest(request);
    attachTelegramId(context, authContext.telegramId);

    const { path } = verifyRequestSchema.parse(await request.json());

    if (!path.startsWith(`${authContext.telegramId}/`)) {
      throw new HttpRouteError("Path is outside user folder", {
        status: 403,
        code: "forbidden_path",
      });
    }

    const slashIndex = path.lastIndexOf("/");
    const folderPath = slashIndex > 0 ? path.slice(0, slashIndex) : "";
    const fileName = slashIndex > -1 ? path.slice(slashIndex + 1) : path;

    const { data, error } = await authContext.supabase.storage
      .from(env.SUPABASE_STORAGE_BUCKET)
      .list(folderPath, {
        search: fileName,
        limit: 20,
      });

    if (error) {
      throw new Error(`Failed to verify uploaded file: ${error.message}`);
    }

    const matched = (data ?? []).find((entry) => entry.name === fileName);

    const response = NextResponse.json({
      path,
      exists: Boolean(matched),
      file: matched
        ? {
            name: matched.name,
            size: matched.metadata?.size ?? null,
            mimeType: matched.metadata?.mimetype ?? null,
            updatedAt: matched.updated_at,
          }
        : null,
    });

    logRouteSuccess(context, 200, {
      action: "verify_upload",
      path,
      exists: Boolean(matched),
    });

    return applyRouteHeaders(response, context, getRateLimitHeaders(rateLimit));
  } catch (error) {
    return handleRouteError(error, context);
  }
}
