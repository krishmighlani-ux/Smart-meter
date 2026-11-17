"use client";
import { useCallback, useEffect, useState } from "react";

/** Fetch JSON with loading / error state. Pass null as url to skip. */
export function useApi(url) {
  const [state, setState] = useState({ data: null, error: null, loading: !!url });
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!url) return;
    const ctrl = new AbortController();
    setState((s) => ({ ...s, loading: true, error: null }));
    fetch(url, { signal: ctrl.signal })
      .then(async (res) => {
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body.error || `Request failed (${res.status})`);
        setState({ data: body, error: null, loading: false });
      })
      .catch((err) => {
        if (err.name !== "AbortError") setState({ data: null, error: err.message || "Network error", loading: false });
      });
    return () => ctrl.abort();
  }, [url, tick]);
  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { ...state, reload };
}
