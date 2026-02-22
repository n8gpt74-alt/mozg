import { beforeEach, describe, expect, it, vi } from "vitest";

type ServerEnvMock = {
  NEXT_PUBLIC_SUPABASE_URL: string;
  NEXT_PUBLIC_SUPABASE_ANON_KEY: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  SUPABASE_STORAGE_BUCKET: string;
  TELEGRAM_BOT_TOKEN: string;
  TELEGRAM_INIT_DATA_MAX_AGE_SECONDS: number;
  OPENAI_API_KEY: string;
  OPENAI_BASE_URL: string;
  OPENAI_CHAT_MODEL: string;
  OPENAI_EMBED_MODEL: string;
  OPENAI_REQUEST_TIMEOUT_MS: number;
  OPENAI_REQUEST_RETRIES: number;
  API_RATE_LIMIT_WINDOW_SECONDS: number;
  API_RATE_LIMIT_VALIDATE_MAX: number;
  API_RATE_LIMIT_AI_COMPLETE_MAX: number;
  API_RATE_LIMIT_AI_EMBED_MAX: number;
  API_RATE_LIMIT_STORAGE_UPLOAD_URL_MAX: number;
};

const baseEnv: ServerEnvMock = {
  NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-key",
  SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
  SUPABASE_STORAGE_BUCKET: "user-files",
  TELEGRAM_BOT_TOKEN: "token",
  TELEGRAM_INIT_DATA_MAX_AGE_SECONDS: 86_400,
  OPENAI_API_KEY: "key",
  OPENAI_BASE_URL: "https://api.example.com",
  OPENAI_CHAT_MODEL: "openai/gpt-4.1-mini",
  OPENAI_EMBED_MODEL: "openai/text-embedding-3-small",
  OPENAI_REQUEST_TIMEOUT_MS: 20_000,
  OPENAI_REQUEST_RETRIES: 0,
  API_RATE_LIMIT_WINDOW_SECONDS: 60,
  API_RATE_LIMIT_VALIDATE_MAX: 20,
  API_RATE_LIMIT_AI_COMPLETE_MAX: 20,
  API_RATE_LIMIT_AI_EMBED_MAX: 20,
  API_RATE_LIMIT_STORAGE_UPLOAD_URL_MAX: 20,
};

function mockEnv(overrides: Partial<ServerEnvMock> = {}) {
  vi.doMock("@/lib/env", () => ({
    getServerEnv: () => ({
      ...baseEnv,
      ...overrides,
    }),
  }));
}

function createAuthedRequest(url: string, body: unknown = {}) {
  return new Request(url, {
    method: "POST",
    headers: {
      Authorization: `tma test-${Math.random()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

async function readNdjson(response: Response) {
  const body = await response.text();
  return body
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line) as Record<string, unknown>);
}

beforeEach(() => {
  vi.resetModules();
  vi.restoreAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  vi.spyOn(console, "info").mockImplementation(() => undefined);
});

describe("API contracts", () => {
  it("POST /api/telegram/validate returns session payload without supabase token", async () => {
    mockEnv();

    const upsert = vi.fn().mockResolvedValue({ error: null });

    vi.doMock("@/lib/telegram/auth", () => ({
      authenticateTelegramRequest: vi.fn().mockResolvedValue({
        telegramId: "123",
        telegramUser: {
          first_name: "Test",
          username: "tester",
        },
        supabase: {
          from: vi.fn().mockReturnValue({
            upsert,
          }),
        },
      }),
    }));

    const { POST } = await import("@/app/api/telegram/validate/route");
    const response = await POST(createAuthedRequest("http://localhost/api/telegram/validate"));
    const body = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(200);
    expect(body).toEqual({
      telegramId: "123",
      telegramUser: {
        first_name: "Test",
        username: "tester",
      },
    });
    expect(body).not.toHaveProperty("supabaseAccessToken");
    expect(response.headers.get("x-request-id")).toBeTruthy();
    expect(response.headers.get("x-ratelimit-limit")).toBe("20");
  });

  it("POST /api/ai/embed returns document id", async () => {
    mockEnv();

    const rpc = vi.fn().mockResolvedValue({ data: "doc-1", error: null });

    vi.doMock("@/lib/telegram/auth", () => ({
      authenticateTelegramRequest: vi.fn().mockResolvedValue({
        telegramId: "123",
        telegramUser: { first_name: "Test" },
        supabase: { rpc },
      }),
    }));

    vi.doMock("ai", () => ({
      embed: vi.fn().mockResolvedValue({
        embedding: [0.1, 0.2, 0.3],
      }),
    }));

    vi.doMock("@/lib/ai/provider", () => ({
      getOpenAIProvider: () => ({
        embedding: vi.fn().mockReturnValue("mock-model"),
      }),
      getOpenAIModelConfig: () => ({
        embedModelId: "text-embedding-3-small",
      }),
    }));

    const { POST } = await import("@/app/api/ai/embed/route");
    const response = await POST(
      createAuthedRequest("http://localhost/api/ai/embed", {
        content: "remember this",
        metadata: { source: "test" },
      }),
    );

    const body = (await response.json()) as { documentId?: string };

    expect(response.status).toBe(200);
    expect(body.documentId).toBe("doc-1");
    expect(rpc).toHaveBeenCalledWith(
      "insert_document",
      expect.objectContaining({
        p_content: "remember this",
      }),
    );
  });

  it("POST /api/ai/complete streams meta and text chunks", async () => {
    mockEnv();

    const rpc = vi.fn().mockResolvedValue({
      data: [
        {
          id: "a1",
          content: "stored memory",
          similarity: 0.9,
          metadata: {},
        },
      ],
      error: null,
    });

    vi.doMock("@/lib/telegram/auth", () => ({
      authenticateTelegramRequest: vi.fn().mockResolvedValue({
        telegramId: "123",
        telegramUser: { first_name: "Test" },
        supabase: { rpc },
      }),
    }));

    vi.doMock("ai", () => ({
      embed: vi.fn().mockResolvedValue({
        embedding: [0.1, 0.2, 0.3],
      }),
      streamText: vi.fn().mockReturnValue({
        textStream: (async function* () {
          yield "ready ";
          yield "answer";
        })(),
      }),
    }));

    vi.doMock("@/lib/ai/provider", () => ({
      getOpenAIProvider: () => ({
        embedding: vi.fn().mockReturnValue("embed-model"),
        chat: vi.fn().mockReturnValue("chat-model"),
      }),
      getOpenAIModelConfig: () => ({
        embedModelId: "text-embedding-3-small",
        chatModelId: "gpt-4.1-mini",
      }),
    }));

    const { POST } = await import("@/app/api/ai/complete/route");
    const response = await POST(
      createAuthedRequest("http://localhost/api/ai/complete", {
        prompt: "what did I save",
      }),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/x-ndjson");

    const chunks = await readNdjson(response);

    expect(chunks[0]).toEqual({
      type: "meta",
      matches: [
        {
          id: "a1",
          similarity: 0.9,
        },
      ],
    });

    expect(chunks.some((chunk) => chunk.type === "text-delta")).toBe(true);
    expect(chunks[chunks.length - 1]).toEqual({
      type: "done",
      text: "ready answer",
    });
  });

  it("GET /api/ai/memory returns list with filters metadata", async () => {
    mockEnv();

    const queryResult = Promise.resolve({
      data: [
        {
          id: "09f49b7c-0c5f-4eb9-bfd9-87ed5ca35253",
          content: "Memory one",
          metadata: { source: "telegram-ui" },
          created_at: "2026-02-22T00:00:00.000Z",
        },
      ],
      count: 1,
      error: null,
    });

    const queryBuilder = {
      order: vi.fn().mockReturnThis(),
      range: vi.fn().mockReturnThis(),
      contains: vi.fn().mockReturnThis(),
      ilike: vi.fn().mockReturnThis(),
      then: queryResult.then.bind(queryResult),
    };

    vi.doMock("@/lib/telegram/auth", () => ({
      authenticateTelegramRequest: vi.fn().mockResolvedValue({
        telegramId: "123",
        telegramUser: { first_name: "Test" },
        supabase: {
          from: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue(queryBuilder),
          }),
        },
      }),
    }));

    const { GET } = await import("@/app/api/ai/memory/route");
    const request = new Request("http://localhost/api/ai/memory?source=telegram-ui", {
      headers: {
        Authorization: "tma test",
      },
    });

    const response = await GET(request);
    const body = (await response.json()) as {
      items: Array<{ id: string; metadata: { source?: string } }>;
      sources: string[];
    };

    expect(response.status).toBe(200);
    expect(body.items[0]?.id).toBe("09f49b7c-0c5f-4eb9-bfd9-87ed5ca35253");
    expect(body.sources).toEqual(["telegram-ui"]);
    expect(queryBuilder.contains).toHaveBeenCalledWith("metadata", { source: "telegram-ui" });
  });

  it("DELETE /api/ai/memory deletes memory item", async () => {
    mockEnv();

    const maybeSingle = vi.fn().mockResolvedValue({
      data: { id: "09f49b7c-0c5f-4eb9-bfd9-87ed5ca35253" },
      error: null,
    });

    vi.doMock("@/lib/telegram/auth", () => ({
      authenticateTelegramRequest: vi.fn().mockResolvedValue({
        telegramId: "123",
        telegramUser: { first_name: "Test" },
        supabase: {
          from: vi.fn().mockReturnValue({
            delete: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                select: vi.fn().mockReturnValue({
                  maybeSingle,
                }),
              }),
            }),
          }),
        },
      }),
    }));

    const { DELETE } = await import("@/app/api/ai/memory/route");
    const response = await DELETE(
      createAuthedRequest("http://localhost/api/ai/memory", {
        id: "09f49b7c-0c5f-4eb9-bfd9-87ed5ca35253",
      }),
    );

    const body = (await response.json()) as { deleted?: boolean; id?: string };

    expect(response.status).toBe(200);
    expect(body.deleted).toBe(true);
    expect(body.id).toBe("09f49b7c-0c5f-4eb9-bfd9-87ed5ca35253");
  });

  it("POST /api/storage/upload-url returns signed upload metadata", async () => {
    mockEnv();

    const createSignedUploadUrl = vi.fn().mockResolvedValue({
      data: {
        path: "123/new-file.txt",
        token: "token",
        signedUrl: "https://example.com/upload",
      },
      error: null,
    });

    vi.doMock("@/lib/telegram/auth", () => ({
      authenticateTelegramRequest: vi.fn().mockResolvedValue({
        telegramId: "123",
        telegramUser: { first_name: "Test" },
        supabase: {
          storage: {
            from: vi.fn().mockReturnValue({
              createSignedUploadUrl,
            }),
          },
        },
      }),
    }));

    const { POST } = await import("@/app/api/storage/upload-url/route");
    const response = await POST(
      createAuthedRequest("http://localhost/api/storage/upload-url", {
        fileName: "new file.txt",
      }),
    );

    const body = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(200);
    expect(body.bucket).toBe("user-files");
    expect(body.path).toBe("123/new-file.txt");
    expect(body.method).toBe("PUT");
    expect(body.token).toBe("token");
    expect(body.signedUrl).toBe("https://example.com/upload");
  });

  it("POST /api/storage/verify-upload confirms uploaded file in user folder", async () => {
    mockEnv();

    const list = vi.fn().mockResolvedValue({
      data: [
        {
          name: "new-file.txt",
          metadata: {
            size: 512,
            mimetype: "text/plain",
          },
          updated_at: "2026-02-22T00:00:00.000Z",
        },
      ],
      error: null,
    });

    vi.doMock("@/lib/telegram/auth", () => ({
      authenticateTelegramRequest: vi.fn().mockResolvedValue({
        telegramId: "123",
        telegramUser: { first_name: "Test" },
        supabase: {
          storage: {
            from: vi.fn().mockReturnValue({
              list,
            }),
          },
        },
      }),
    }));

    const { POST } = await import("@/app/api/storage/verify-upload/route");
    const response = await POST(
      createAuthedRequest("http://localhost/api/storage/verify-upload", {
        path: "123/new-file.txt",
      }),
    );

    const body = (await response.json()) as {
      exists?: boolean;
      file?: {
        name?: string;
      };
    };

    expect(response.status).toBe(200);
    expect(body.exists).toBe(true);
    expect(body.file?.name).toBe("new-file.txt");
  });
});
