import { z } from "zod";
import { describe, expect, it } from "vitest";

import {
  HttpRouteError,
  createRouteContext,
  handleRouteError,
} from "@/lib/http/route-error";
import { TelegramAuthError } from "@/lib/telegram/validate-init-data";

describe("handleRouteError", () => {
  it("returns Telegram auth error status and request id", () => {
    const request = new Request("http://localhost/api/test");
    const context = createRouteContext(request, "/api/test");

    const response = handleRouteError(new TelegramAuthError("bad auth", 401), context);

    expect(response.status).toBe(401);
    expect(response.headers.get("x-request-id")).toBe(context.requestId);
  });

  it("returns zod validation details with 400", async () => {
    const schema = z.object({ prompt: z.string().min(2) });
    const request = new Request("http://localhost/api/test");
    const context = createRouteContext(request, "/api/test");

    let thrown: unknown;

    try {
      schema.parse({ prompt: "" });
    } catch (error) {
      thrown = error;
    }

    const response = handleRouteError(thrown, context);
    const body = (await response.json()) as { details?: Record<string, unknown> };

    expect(response.status).toBe(400);
    expect(body.details).toHaveProperty("prompt");
  });

  it("preserves custom status and headers for HttpRouteError", async () => {
    const request = new Request("http://localhost/api/test");
    const context = createRouteContext(request, "/api/test");

    const response = handleRouteError(
      new HttpRouteError("Too many requests", {
        status: 429,
        code: "rate_limited",
        headers: {
          "retry-after": "30",
        },
      }),
      context,
    );

    const body = (await response.json()) as { code?: string; error?: string };

    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("30");
    expect(body.code).toBe("rate_limited");
    expect(body.error).toBe("Too many requests");
  });
});
