import { embed, streamText } from "ai";
import { NextResponse } from "next/server";
import { z } from "zod";

import { getOpenAIModelConfig, getOpenAIProvider } from "@/lib/ai/provider";
import { withTimeoutAndRetry } from "@/lib/ai/retry";
import { toPgVector } from "@/lib/ai/vector";
import { getServerEnv } from "@/lib/env";
import type { AiStreamChunk } from "@/lib/features/telegram/constants";
import {
  applyRouteHeaders,
  attachTelegramId,
  createRouteContext,
  handleRouteError,
  logRouteSuccess,
} from "@/lib/http/route-error";
import { consumeRateLimit, getClientRateLimitKey, getRateLimitHeaders } from "@/lib/http/rate-limit";
import { authenticateTelegramRequest } from "@/lib/telegram/auth";

const ROUTE_PATH = "/api/ai/complete";
const encoder = new TextEncoder();

const completionRequestSchema = z.object({
  prompt: z.string().min(1).max(4000),
});

type MatchDocument = {
  id: string;
  content: string;
  metadata: Record<string, unknown>;
  similarity: number;
};

function toStreamLine(chunk: AiStreamChunk) {
  return `${JSON.stringify(chunk)}\n`;
}

export async function POST(request: Request) {
  const context = createRouteContext(request, ROUTE_PATH);

  try {
    const env = getServerEnv();
    const rateLimit = consumeRateLimit({
      route: ROUTE_PATH,
      key: getClientRateLimitKey(request),
      limit: env.API_RATE_LIMIT_AI_COMPLETE_MAX,
      windowMs: env.API_RATE_LIMIT_WINDOW_SECONDS * 1000,
    });

    const authContext = await authenticateTelegramRequest(request);
    attachTelegramId(context, authContext.telegramId);

    const { prompt } = completionRequestSchema.parse(await request.json());

    const openaiProvider = getOpenAIProvider();
    const { chatModelId, embedModelId } = getOpenAIModelConfig();

    const queryEmbedding = await withTimeoutAndRetry(
      (abortSignal) =>
        embed({
          model: openaiProvider.embedding(embedModelId),
          value: prompt,
          abortSignal,
        }),
      {
        operationName: "Query embedding generation",
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
              operation: "query_embed",
              errorType: retryError instanceof Error ? retryError.name : typeof retryError,
              errorMessage: retryError instanceof Error ? retryError.message : String(retryError),
            }),
          );
        },
      },
    );

    const matchesResponse = await authContext.supabase.rpc("match_documents", {
      query_embedding: toPgVector(queryEmbedding.embedding),
      match_count: 5,
      filter: {},
    });

    if (matchesResponse.error) {
      throw new Error(`Failed to run similarity search: ${matchesResponse.error.message}`);
    }

    const matches = (matchesResponse.data ?? []) as MatchDocument[];

    const contextualMemory = matches
      .map((entry, index) => `(${index + 1}) ${entry.content}`)
      .join("\n\n");

    const completionStream = streamText({
      model: openaiProvider.chat(chatModelId),
      system:
        "Ты ассистент Telegram Mini App. Отвечай кратко, по делу и используй контекст памяти только когда он релевантен вопросу.",
      prompt: contextualMemory
        ? `Контекст памяти:\n${contextualMemory}\n\nВопрос пользователя:\n${prompt}`
        : prompt,
      abortSignal: request.signal,
    });

    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(
          encoder.encode(
            toStreamLine({
              type: "meta",
              matches: matches.map((entry) => ({
                id: entry.id,
                similarity: entry.similarity,
              })),
            }),
          ),
        );

        void (async () => {
          let accumulatedText = "";

          try {
            for await (const delta of completionStream.textStream) {
              accumulatedText += delta;
              controller.enqueue(
                encoder.encode(
                  toStreamLine({
                    type: "text-delta",
                    delta,
                  }),
                ),
              );
            }

            controller.enqueue(
              encoder.encode(
                toStreamLine({
                  type: "done",
                  text: accumulatedText,
                }),
              ),
            );

            logRouteSuccess(context, 200, {
              action: "complete_stream",
              memoryMatches: matches.length,
              outputChars: accumulatedText.length,
            });
          } catch (streamError) {
            controller.enqueue(
              encoder.encode(
                toStreamLine({
                  type: "error",
                  error:
                    streamError instanceof Error
                      ? streamError.message
                      : "Ошибка при потоковой генерации ответа",
                }),
              ),
            );

            console.error(
              JSON.stringify({
                level: "error",
                route: ROUTE_PATH,
                requestId: context.requestId,
                telegramId: context.telegramId,
                status: 500,
                code: "stream_error",
                errorType: streamError instanceof Error ? streamError.name : typeof streamError,
                errorMessage: streamError instanceof Error ? streamError.message : String(streamError),
                latencyMs: Date.now() - context.startedAt,
              }),
            );
          } finally {
            controller.close();
          }
        })();
      },
    });

    const response = new NextResponse(stream, {
      status: 200,
      headers: {
        "content-type": "application/x-ndjson; charset=utf-8",
        "cache-control": "no-store, no-transform",
      },
    });

    return applyRouteHeaders(response, context, getRateLimitHeaders(rateLimit));
  } catch (error) {
    return handleRouteError(error, context);
  }
}
