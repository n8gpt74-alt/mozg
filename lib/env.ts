import { z } from "zod";

const serverEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  SUPABASE_STORAGE_BUCKET: z.string().min(1).default("user-files"),
  TELEGRAM_BOT_TOKEN: z.string().min(1),
  TELEGRAM_INIT_DATA_MAX_AGE_SECONDS: z.coerce.number().int().positive().default(86_400),
  OPENAI_API_KEY: z.string().min(1),
  OPENAI_BASE_URL: z.string().url().optional(),
  OPENAI_CHAT_MODEL: z.string().min(1).default("openai/gpt-4.1-mini"),
  OPENAI_EMBED_MODEL: z.string().min(1).default("openai/text-embedding-3-small"),
  OPENAI_REQUEST_TIMEOUT_MS: z.coerce.number().int().positive().default(20_000),
  OPENAI_REQUEST_RETRIES: z.coerce.number().int().min(0).max(5).default(2),
  API_RATE_LIMIT_WINDOW_SECONDS: z.coerce.number().int().positive().default(60),
  API_RATE_LIMIT_VALIDATE_MAX: z.coerce.number().int().positive().default(20),
  API_RATE_LIMIT_AI_COMPLETE_MAX: z.coerce.number().int().positive().default(20),
  API_RATE_LIMIT_AI_EMBED_MAX: z.coerce.number().int().positive().default(20),
  API_RATE_LIMIT_STORAGE_UPLOAD_URL_MAX: z.coerce.number().int().positive().default(20),
});

type ServerEnv = z.infer<typeof serverEnvSchema>;

let cachedEnv: ServerEnv | null = null;

export function getServerEnv(): ServerEnv {
  if (cachedEnv) {
    return cachedEnv;
  }

  const parsed = serverEnvSchema.safeParse(process.env);

  if (!parsed.success) {
    throw new Error(
      `Invalid server environment variables: ${JSON.stringify(parsed.error.flatten().fieldErrors)}`,
    );
  }

  cachedEnv = parsed.data;
  return cachedEnv;
}
