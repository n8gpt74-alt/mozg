import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { TelegramAuthError } from "@/lib/telegram/validate-init-data";

export function handleRouteError(error: unknown) {
  if (error instanceof TelegramAuthError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  if (error instanceof ZodError) {
    return NextResponse.json(
      {
        error: "Invalid request payload",
        details: error.flatten().fieldErrors,
      },
      { status: 400 },
    );
  }

  console.error(error);
  return NextResponse.json({ error: "Internal server error" }, { status: 500 });
}
