"use client";

import { useEffect, useState } from "react";

import { registerMasilWebMcpProvider } from "@/features/webmcp/provider";
import type {
  MasilToolExecutor,
  WebMcpProviderStatus,
} from "@/features/webmcp/types";

const MAX_HOST_DISCOVERY_ATTEMPTS = 24;
const HOST_DISCOVERY_INTERVAL_MS = 250;

export function useMasilWebMcpProvider(execute: MasilToolExecutor) {
  const [status, setStatus] = useState<WebMcpProviderStatus>("checking");

  useEffect(() => {
    let active = true;
    let retryTimer = 0;
    let unregister: (() => Promise<void>) | null = null;
    const registrationController = new AbortController();

    const start = async (attempt = 0) => {
      await Promise.resolve();
      if (!active) return;

      const modelContext = document.modelContext;
      if (!modelContext?.registerTool) {
        if (attempt < MAX_HOST_DISCOVERY_ATTEMPTS) {
          retryTimer = window.setTimeout(
            () => void start(attempt + 1),
            HOST_DISCOVERY_INTERVAL_MS,
          );
          return;
        }
        setStatus("demo");
        return;
      }

      try {
        unregister = await registerMasilWebMcpProvider({
          modelContext,
          execute,
          isActive: () => active,
          signal: registrationController.signal,
        });
        if (active) setStatus("connected");
        else void unregister();
      } catch {
        if (active) setStatus("error");
      }
    };

    void start();

    return () => {
      active = false;
      registrationController.abort();
      window.clearTimeout(retryTimer);
      void unregister?.();
    };
  }, [execute]);

  return status;
}
