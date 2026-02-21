import { createOpenAI } from "@ai-sdk/openai";

import { getServerEnv } from "@/lib/env";

const OPENAI_PREFIX = /^openai\//i;

let cachedProvider: ReturnType<typeof createOpenAI> | null = null;

function normalizeModelId(modelId: string) {
  const normalized = modelId.replace(OPENAI_PREFIX, "").trim();

  if (!normalized) {
    throw new Error("OpenAI model id is empty after normalization");
  }

  return normalized;
}

export function getOpenAIProvider() {
  if (cachedProvider) {
    return cachedProvider;
  }

  const env = getServerEnv();

  cachedProvider = createOpenAI({
    apiKey: env.OPENAI_API_KEY,
    baseURL: env.OPENAI_BASE_URL,
  });

  return cachedProvider;
}

export function getOpenAIModelConfig() {
  const env = getServerEnv();

  return {
    chatModelId: normalizeModelId(env.OPENAI_CHAT_MODEL),
    embedModelId: normalizeModelId(env.OPENAI_EMBED_MODEL),
  };
}
