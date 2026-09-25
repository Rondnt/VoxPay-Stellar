"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { apiClient } from "@/services/api-client";
export function useResource<T>(path: string, interval = 0) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const request = useRef<AbortController | null>(null);
  const load = useCallback(() => {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    return apiClient
      .get<T>(path, controller.signal)
      .then((value) => {
        if (!controller.signal.aborted) {
          setData(value);
          setError(null);
        }
      })
      .catch((err) => {
        if (!controller.signal.aborted) setError(err);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
        if (request.current === controller) request.current = null;
      });
  }, [path]);
  useEffect(() => {
    void load();
    const timer = interval
      ? setInterval(() => {
          if (document.visibilityState === "visible" && !request.current)
            void load();
        }, interval)
      : undefined;
    return () => {
      request.current?.abort();
      if (timer) clearInterval(timer);
    };
  }, [load, interval]);
  const refresh = useCallback(async () => {
    setLoading(true);
    await load();
  }, [load]);
  return { data, error, loading, refresh, setData };
}
