"use client";

import { usePrivy } from "@privy-io/react-auth";
import { useCallback } from "react";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
  ) {
    super(code);
  }
}

/** fetch autenticado para /api/*: anexa o access token da Privy e trata erros. */
export function useApi() {
  const { getAccessToken } = usePrivy();
  return useCallback(
    async <T>(path: string, init: RequestInit = {}): Promise<T> => {
      const token = await getAccessToken();
      const res = await fetch(path, {
        ...init,
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${token}`,
          ...init.headers,
        },
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new ApiError(res.status, body.error ?? "erro_interno");
      return body as T;
    },
    [getAccessToken],
  );
}
