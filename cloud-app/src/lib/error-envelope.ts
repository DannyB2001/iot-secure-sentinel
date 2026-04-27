import { NextResponse } from "next/server";
import type { ZodError, ZodIssue } from "zod";

export type ErrorEnvelope = {
  uuAppErrorMap: Record<
    string,
    { type: "error" | "warning"; message: string; params?: Record<string, unknown> }
  >;
};

export function errorResponse(
  code: string,
  message: string,
  status: number,
  params?: Record<string, unknown>,
) {
  const body: ErrorEnvelope = {
    uuAppErrorMap: {
      [code]: { type: "error", message, ...(params ? { params } : {}) },
    },
  };
  return NextResponse.json(body, { status });
}

type TaggedIssue = ZodIssue & { params: { errorCode: string } };

function hasErrorCode(issue: ZodIssue): issue is TaggedIssue {
  const params = (issue as { params?: { errorCode?: unknown } }).params;
  return typeof params?.errorCode === "string";
}

export function fromZod(error: ZodError) {
  const tagged = error.issues.find(hasErrorCode);
  if (tagged) {
    return errorResponse(tagged.params.errorCode, tagged.message, 400, {
      issues: error.issues,
    });
  }
  return errorResponse("invalidDtoIn", "Request payload is invalid.", 400, {
    issues: error.issues,
  });
}
