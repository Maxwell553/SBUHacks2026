"use client";
import type { Aspect, VideoScript } from "@/lib/schema/video";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string,
  ) {
    super(message);
  }
}

export interface User {
  id: string;
  name: string;
  email: string;
  createdAt: string;
}

export type VideoStatus = "pending" | "researching" | "scripting" | "ready" | "rendered" | "failed" | "rejected";

export interface Source {
  title: string;
  url: string;
}

export interface Video {
  id: string;
  prompt: string;
  title: string | null;
  duration: number;
  aspect?: Aspect | null;
  status: VideoStatus;
  script: VideoScript | null;
  research?: string | null;
  sources: Source[] | null;
  gifUrl: string | null;
  posterUrl: string | null;
  gifBytes?: number | null;
  error?: string | null;
  createdAt: string;
  updatedAt: string;
}

export async function api<T>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const { json, headers, ...rest } = init;
  const res = await fetch(path, {
    credentials: "same-origin",
    ...rest,
    headers: { ...(json !== undefined ? { "Content-Type": "application/json" } : {}), ...headers },
    body: json !== undefined ? JSON.stringify(json) : rest.body,
  });
  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  if (!res.ok) {
    const err = (data as { error?: unknown } | null)?.error;
    const message =
      typeof err === "string"
        ? err
        : ((err as { message?: string } | undefined)?.message ?? `Request failed (${res.status})`);
    const code = typeof err === "object" && err ? (err as { code?: string }).code : undefined;
    throw new ApiError(res.status, message, code);
  }
  return data as T;
}

export const auth = {
  me: () => api<{ user: User | null }>("/api/auth/me"),
  login: (email: string, password: string) =>
    api<{ user: User }>("/api/auth/login", { method: "POST", json: { email, password } }),
  signup: (name: string, email: string, password: string) =>
    api<{ user: User }>("/api/auth/signup", {
      method: "POST",
      json: { name, email, password, acceptTerms: true, termsVersion: TERMS_VERSION },
    }),
  logout: () => api<{ ok: boolean }>("/api/auth/logout", { method: "POST" }),
  deleteAccount: () => api<unknown>("/api/auth/me", { method: "DELETE" }),
};

export const videos = {
  list: () => api<{ videos: Video[] }>("/api/videos"),
  get: (id: string) => api<{ video: Video }>(`/api/videos/${id}`),
  create: (prompt: string, duration: number, aspect: Aspect) =>
    api<{ video: Video }>("/api/videos", { method: "POST", json: { prompt, duration, aspect } }),
  remove: (id: string) => api<{ ok: boolean }>(`/api/videos/${id}`, { method: "DELETE" }),
};

export const TERMS_VERSION = "2026-10-23";
