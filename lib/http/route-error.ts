import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { TelegramAuthError } from "@/lib/telegram/validate-init-data";

export type RouteRequestContext = {
  route: string;
  requestId: string;
  startedAt: number;
  telegramId: string | null;
};

type HttpRouteErrorOptions = {
  status: number;
  code?: string;
  details?: unknown;
  headers?: HeadersInit;
};

export class HttpRouteError extends Error {
  readonly status: number;
  readonly code?: string;
  readonly details?: unknown;
  readonly headers?: HeadersInit;

  constructor(message: string, options: HttpRouteErrorOptions) {
    super(message);
    this.name = "HttpRouteError";
    this.status = options.status;
    this.code = options.code;
    this.details = options.details;
    this.headers = options.headers;
  }
}

export function createRouteContext(request: Request, route: string): RouteRequestContext {
  const incomingRequestId = request.headers.get("x-request-id")?.trim();

  return {
    route,
    requestId: incomingRequestId || randomUUID(),
    startedAt: Date.now(),
    telegramId: null,
  };
}

export function attachTelegramId(context: RouteRequestContext, telegramId: string) {
  context.telegramId = telegramId;
}

export function logRouteSuccess(
  context: RouteRequestContext,
  status: number,
  extra: Record<string, unknown> = {},
) {
  console.info(
    JSON.stringify({
      level: "info",
      route: context.route,
      requestId: context.requestId,
      telegramId: context.telegramId,
      status,
      latencyMs: Date.now() - context.startedAt,
      ...extra,
    }),
  );
}

export function applyRouteHeaders(
  response: NextResponse,
  context: RouteRequestContext,
  headers?: HeadersInit,
) {
  response.headers.set("x-request-id", context.requestId);

  if (headers) {
    const normalizedHeaders = new Headers(headers);
    normalizedHeaders.forEach((value, key) => response.headers.set(key, value));
  }

  return response;
}

export function handleRouteError(error: unknown, context?: RouteRequestContext) {
  let status = 500;
  let message = "Internal server error";
  let details: unknown;
  let code: string | undefined;
  let extraHeaders: HeadersInit | undefined;

  if (error instanceof TelegramAuthError) {
    status = error.status;
    message = error.message;
    code = "telegram_auth";
  } else if (error instanceof ZodError) {
    status = 400;
    message = "Invalid request payload";
    details = error.flatten().fieldErrors;
    code = "invalid_request";
  } else if (error instanceof HttpRouteError) {
    status = error.status;
    message = error.message;
    details = error.details;
    code = error.code;
    extraHeaders = error.headers;
  }

  console.error(
    JSON.stringify({
      level: "error",
      route: context?.route ?? "unknown",
      requestId: context?.requestId ?? null,
      telegramId: context?.telegramId ?? null,
      status,
      code: code ?? "internal_error",
      errorType: error instanceof Error ? error.name : typeof error,
      errorMessage: error instanceof Error ? error.message : String(error),
      latencyMs: context ? Date.now() - context.startedAt : null,
    }),
  );

  const responseBody: Record<string, unknown> = { error: message };
  if (details !== undefined) {
    responseBody.details = details;
  }
  if (code) {
    responseBody.code = code;
  }
  if (context) {
    responseBody.requestId = context.requestId;
  }

  const response = NextResponse.json(responseBody, { status });

  if (context) {
    applyRouteHeaders(response, context, extraHeaders);
  } else if (extraHeaders) {
    const normalizedHeaders = new Headers(extraHeaders);
    normalizedHeaders.forEach((value, key) => response.headers.set(key, value));
  }

  return response;
}
