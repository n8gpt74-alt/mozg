import { embed } from "ai";
import { NextResponse } from "next/server";
import { z } from "zod";

import { withTimeoutAndRetry } from "@/lib/ai/retry";
import { getOpenAIModelConfig, getOpenAIProvider } from "@/lib/ai/provider";
import { toPgVector } from "@/lib/ai/vector";
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

const ROUTE_PATH = "/api/ai/embed";

const embedRequestSchema = z.object({
  content: z.string().min(1).max(12_000),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export async function POST(request: Request) {
  const context = createRouteContext(request, ROUTE_PATH);

  try {
    const env = getServerEnv();
    const rateLimit = consumeRateLimit({
      route: ROUTE_PATH,
      key: getClientRateLimitKey(request),
      limit: env.API_RATE_LIMIT_AI_EMBED_MAX,
      windowMs: env.API_RATE_LIMIT_WINDOW_SECONDS * 1000,
    });

    const authContext = await authenticateTelegramRequest(request);
    attachTelegramId(context, authContext.telegramId);

    const { content, metadata } = embedRequestSchema.parse(await request.json());
    const openaiProvider = getOpenAIProvider();
    const { embedModelId } = getOpenAIModelConfig();

    const embeddingResult = await withTimeoutAndRetry(
      (abortSignal) =>
        embed({
          model: openaiProvider.embedding(embedModelId),
          value: content,
          abortSignal,
        }),
      {
        operationName: "Embedding generation",
        retries: env.OPENAI_REQUEST_RETRIES,
        timeoutMs: env.OPENAI_REQUEST_TIMEOUT_MS,
        onRetry: (attempt, retryError) => {
          console.warn(
            JSON.stringify({
              level: "warn",
              route: ROUTE_PATH,
              requestId: context.requestId,
              telegramId: context.telegramId,
              attempt,
              retry: true,
              operation: "embed",
              errorType: retryError instanceof Error ? retryError.name : typeof retryError,
              errorMessage: retryError instanceof Error ? retryError.message : String(retryError),
            }),
          );
        },
      },
    );

    const { data, error } = await authContext.supabase.rpc("insert_document", {
      p_content: content,
      p_embedding: toPgVector(embeddingResult.embedding),
      p_metadata: metadata ?? {},
    });

    if (error) {
      throw new Error(`Failed to insert embedding: ${error.message}`);
    }

    const response = NextResponse.json({
      documentId: data,
    });

    logRouteSuccess(context, 200, { action: "embed_memory", documentId: data });
    return applyRouteHeaders(response, context, getRateLimitHeaders(rateLimit));
  } catch (error) {
    return handleRouteError(error, context);
  }
}
