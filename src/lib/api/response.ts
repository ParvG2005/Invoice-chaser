import { NextResponse } from "next/server";
import type { ApiResponse } from "@/types";

export function successResponse<T>(data: T, status = 200) {
  const body: ApiResponse<T> = { success: true, data };
  return NextResponse.json(body, { status });
}

export function errorResponse(
  code: string,
  message: string,
  status = 400,
  details?: unknown,
) {
  const body: ApiResponse<never> = {
    success: false,
    error: { code, message, details },
  };
  return NextResponse.json(body, { status });
}
