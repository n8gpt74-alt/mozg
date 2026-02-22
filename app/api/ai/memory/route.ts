import { NextResponse } from "next/server";
import { z } from "zod";

import { getServerEnv } from "@/lib/env";
import { type MemoryItem } from "@/lib/features/telegram/constants";
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

const ROUTE_PATH = "/api/ai/memory";

const listQuerySchema = z.object({
  source: z.string().trim().max(120).optional(),
  search: z.string().trim().max(500).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

const deletePayloadSchema = z.object({
  id: z.string().uuid(),
});

function parseListQuery(request: Request) {
  const url = new URL(request.url);

  return listQuerySchema.parse({
    source: url.searchParams.get("source") ?? undefined,
    search: url.searchParams.get("search") ?? undefined,
    limit: url.searchParams.get("limit") ?? undefined,
    offset: url.searchParams.get("offset") ?? undefined,
  });
}

function normalizeMemoryItem(item: {
  id: string;
  content: string;
  metadata: Record<string, unknown>;
  created_at: string;
}): MemoryItem {
  return {
    id: item.id,
    content: item.content,
    metadata: item.metadata,
    createdAt: item.created_at,
  };
}

export async function GET(request: Request) {
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

    const query = parseListQuery(request);
    const endIndex = query.offset + query.limit - 1;

    let memoryQuery = authContext.supabase
      .from("documents")
      .select("id, content, metadata, created_at", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(query.offset, endIndex);

    if (query.source) {
      memoryQuery = memoryQuery.contains("metadata", { source: query.source });
    }

    if (query.search) {
      memoryQuery = memoryQuery.ilike("content", `%${query.search}%`);
    }

    const { data, error, count } = await memoryQuery;

    if (error) {
      throw new Error(`Failed to load memory: ${error.message}`);
    }

    const items = (data ?? []).map((entry) =>
      normalizeMemoryItem(entry as { id: string; content: string; metadata: Record<string, unknown>; created_at: string }),
    );

    const sources = Array.from(
      new Set(
        items
          .map((entry) => entry.metadata.source)
          .filter((source): source is string => typeof source === "string" && source.length > 0),
      ),
    );

    const response = NextResponse.json({
      items,
      total: count ?? items.length,
      filter: {
        source: query.source ?? null,
        search: query.search ?? null,
      },
      sources,
    });

    logRouteSuccess(context, 200, {
      action: "memory_list",
      items: items.length,
      sourceFilter: query.source ?? null,
    });

    return applyRouteHeaders(response, context, getRateLimitHeaders(rateLimit));
  } catch (error) {
    return handleRouteError(error, context);
  }
}

export async function DELETE(request: Request) {
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

    const { id } = deletePayloadSchema.parse(await request.json());

    const { data, error } = await authContext.supabase
      .from("documents")
      .delete()
      .eq("id", id)
      .select("id")
      .maybeSingle();

    if (error) {
      throw new Error(`Failed to delete memory item: ${error.message}`);
    }

    if (!data?.id) {
      throw new HttpRouteError("Memory item not found", {
        status: 404,
        code: "memory_not_found",
      });
    }

    const response = NextResponse.json({
      deleted: true,
      id,
    });

    logRouteSuccess(context, 200, {
      action: "memory_delete",
      id,
    });

    return applyRouteHeaders(response, context, getRateLimitHeaders(rateLimit));
  } catch (error) {
    return handleRouteError(error, context);
  }
}
