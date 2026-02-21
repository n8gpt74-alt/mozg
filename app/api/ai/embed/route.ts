import { embed } from "ai";
import { NextResponse } from "next/server";
import { z } from "zod";

import { getOpenAIModelConfig, getOpenAIProvider } from "@/lib/ai/provider";
import { toPgVector } from "@/lib/ai/vector";
import { handleRouteError } from "@/lib/http/route-error";
import { authenticateTelegramRequest } from "@/lib/telegram/auth";

const embedRequestSchema = z.object({
  content: z.string().min(1).max(12_000),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export async function POST(request: Request) {
  try {
    const authContext = await authenticateTelegramRequest(request);
    const { content, metadata } = embedRequestSchema.parse(await request.json());

    const openaiProvider = getOpenAIProvider();
    const { embedModelId } = getOpenAIModelConfig();

    const embeddingResult = await embed({
      model: openaiProvider.embedding(embedModelId),
      value: content,
    });

    const { data, error } = await authContext.supabase.rpc("insert_document", {
      p_content: content,
      p_embedding: toPgVector(embeddingResult.embedding),
      p_metadata: metadata ?? {},
    });

    if (error) {
      throw new Error(`Failed to insert embedding: ${error.message}`);
    }

    return NextResponse.json({
      documentId: data,
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
