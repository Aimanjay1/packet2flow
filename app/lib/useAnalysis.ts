"use client";

import { useEffect, useRef, useState } from "react";

// Where the Python backend runs. Set NEXT_PUBLIC_API_URL in .env.local to change it.
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
// How often to ask the backend "is it finished yet?", in milliseconds.
const POLL_MS = 3000;

// The shapes of the JSON that GET /analyses/{job_id} sends back.
export type Flag = "clean" | "suspicious" | "malicious";

export type FileResult = {
  name: string;
  status: "queued" | "scanning" | "done" | "error";
  flag?: Flag;
  malicious?: number;
  suspicious?: number;
  source?: "cached" | "uploaded";
  permalink?: string;
  error?: string;
};

export type AnalysisJob = {
  id: string;
  status: "running" | "done";
  overall: Flag | null;
  files: FileResult[];
};

// Wait `ms` milliseconds, but stop early if the analysis is cancelled.
function wait(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(signal.reason);
      },
      { once: true },
    );
  });
}

// FastAPI puts its error text in a "detail" field. Use it if it's there.
async function readError(res: Response, fallback: string) {
  const body = await res.json().catch(() => null);
  return typeof body?.detail === "string" ? body.detail : `${fallback} (${res.status})`;
}

/**
 * Everything the page needs to run a VirusTotal analysis:
 * - start(files): upload the files, then keep checking until the backend says "done"
 * - reset(): forget the current analysis (and stop checking)
 * - job / busy / error: what to show on screen
 */
export function useAnalysis() {
  const [job, setJob] = useState<AnalysisJob | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Lets us cancel the current upload or polling loop.
  const cancel = useRef<AbortController | null>(null);

  // If the user leaves the page, stop polling.
  useEffect(() => () => cancel.current?.abort(), []);

  async function start(files: File[]) {
    cancel.current?.abort(); // stop any older analysis first
    const controller = new AbortController();
    cancel.current = controller;
    const { signal } = controller;

    setBusy(true);
    setError(null);
    setJob(null);

    try {
      // 1. Send the files. FormData is how browsers send files in a request.
      const body = new FormData();
      for (const file of files) body.append("files", file, file.name);
      // No Content-Type header here: the browser adds the right one by itself.
      const res = await fetch(`${API_URL}/analyses`, { method: "POST", body, signal });
      if (!res.ok) throw new Error(await readError(res, "Upload failed"));
      const { job_id } = (await res.json()) as { job_id: string };

      // 2. Ask for the result every few seconds until the backend says "done".
      for (;;) {
        const poll = await fetch(`${API_URL}/analyses/${job_id}`, { signal });
        if (!poll.ok) throw new Error(await readError(poll, "Could not read the analysis"));
        const data = (await poll.json()) as AnalysisJob;
        setJob(data);
        if (data.status === "done") break;
        await wait(POLL_MS, signal);
      }
    } catch (err) {
      if (signal.aborted) return; // cancelled on purpose, so this is not an error
      // fetch throws a TypeError when it can't reach the server at all.
      setError(
        err instanceof TypeError
          ? `Can't reach the backend at ${API_URL}. Is uvicorn running?`
          : err instanceof Error
            ? err.message
            : "Something went wrong.",
      );
    } finally {
      if (!signal.aborted) setBusy(false);
    }
  }

  function reset() {
    cancel.current?.abort();
    setJob(null);
    setError(null);
    setBusy(false);
  }

  return { job, busy, error, start, reset };
}
