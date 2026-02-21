import { NextResponse } from "next/server";
import { z } from "zod";

import { getServerEnv } from "@/lib/env";
import { handleRouteError } from "@/lib/http/route-error";
import { authenticateTelegramRequest } from "@/lib/telegram/auth";

const uploadRequestSchema = z.object({
  fileName: z.string().min(1).max(120),
});

function sanitizeFileName(fileName: string) {
  return fileName.replace(/[^a-zA-Z0-9_.-]/g, "_");
}

export async function POST(request: Request) {
  try {
    const authContext = await authenticateTelegramRequest(request);
    const { fileName } = uploadRequestSchema.parse(await request.json());
    const env = getServerEnv();

    const objectPath = `${authContext.telegramId}/${crypto.randomUUID()}-${sanitizeFileName(fileName)}`;

    const { data, error } = await authContext.supabase.storage
      .from(env.SUPABASE_STORAGE_BUCKET)
      .createSignedUploadUrl(objectPath);

    if (error || !data) {
      throw new Error(error?.message ?? "Unable to create upload URL");
    }

    return NextResponse.json({
      bucket: env.SUPABASE_STORAGE_BUCKET,
      path: data.path,
      token: data.token,
      signedUrl: data.signedUrl,
      method: "PUT",
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
