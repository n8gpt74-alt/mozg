import { embed, generateText } from "ai";
import { NextResponse } from "next/server";
import { z } from "zod";

import { getOpenAIModelConfig, getOpenAIProvider } from "@/lib/ai/provider";
import { toPgVector } from "@/lib/ai/vector";
import { handleRouteError } from "@/lib/http/route-error";
import { authenticateTelegramRequest } from "@/lib/telegram/auth";

const completionRequestSchema = z.object({
  prompt: z.string().min(1).max(4000),
});

type MatchDocument = {
  id: string;
  content: string;
  metadata: Record<string, unknown>;
  similarity: number;
};

export async function POST(request: Request) {
  try {
    const authContext = await authenticateTelegramRequest(request);
    const { prompt } = completionRequestSchema.parse(await request.json());

    const openaiProvider = getOpenAIProvider();
    const { chatModelId, embedModelId } = getOpenAIModelConfig();

    const queryEmbedding = await embed({
      model: openaiProvider.embedding(embedModelId),
      value: prompt,
    });

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

    const completion = await generateText({
      model: openaiProvider.chat(chatModelId),
      system:
        "Ты ассистент Telegram Mini App. Отвечай кратко, по делу и используй контекст памяти только когда он релевантен вопросу.",
      prompt: contextualMemory
        ? `Контекст памяти:\n${contextualMemory}\n\nВопрос пользователя:\n${prompt}`
        : prompt,
    });

    return NextResponse.json({
      text: completion.text,
      matches: matches.map((entry) => ({
        id: entry.id,
        similarity: entry.similarity,
      })),
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
