import { createHash } from "node:crypto";
import { query } from "@/lib/server/db";
import { fastModel } from "@/lib/server/models";

export type ModerationStage = "input" | "output";
export type ModerationSource = "keyword" | "classifier" | "provider";
export type ModerationOutcome = "allowed" | "rejected" | "error";

export interface ModerationVerdict {
  stage: ModerationStage;
  outcome: ModerationOutcome;
  source: ModerationSource;
  /** Short neutral classifier reason or a fixed rule description — never the checked text. */
  reason: string;
  rule?: string;
}

export interface AuditContext {
  userId: string;
  videoId: string;
}

export interface ModerationAuditDetails {
  videoId: string;
  stage: ModerationStage;
  outcome: ModerationOutcome;
  source: ModerationSource;
  reason: string;
  rule?: string;
  model?: string;
  textSha256: string;
  textChars: number;
}

const clean = (value: string, max: number) =>
  value
    .replace(/[\u0000-\u001f\u007f]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);

/**
 * Persists one moderation decision in ph_audit. The checked text is stored
 * only as a SHA-256 fingerprint plus its length: the prompt already lives on
 * the video row and the storyboard in its plan.
 */
export async function recordModeration(ctx: AuditContext, verdict: ModerationVerdict, text: string) {
  const details: ModerationAuditDetails = {
    videoId: ctx.videoId,
    stage: verdict.stage,
    outcome: verdict.outcome,
    source: verdict.source,
    reason: clean(verdict.reason, 300),
    ...(verdict.rule ? { rule: verdict.rule } : {}),
    ...(verdict.source !== "keyword" ? { model: fastModel() } : {}),
    textSha256: createHash("sha256").update(text).digest("hex"),
    textChars: text.length,
  };
  await query("INSERT INTO ph_audit(user_id,event,details) VALUES($1,'moderation',$2::jsonb)", [
    ctx.userId,
    JSON.stringify(details),
  ]);
}

export function logAuditFailure(error: unknown) {
  const code = (error as { code?: string })?.code;
  console.error("Moderation audit write failed", code ?? (error instanceof Error ? error.name : "unknown"));
}

export async function moderationHistory(userId: string, videoId: string) {
  const { rows } = await query<{ details: ModerationAuditDetails; created_at: string }>(
    "SELECT details, created_at FROM ph_audit WHERE user_id=$1 AND event='moderation' AND details->>'videoId'=$2 ORDER BY id",
    [userId, videoId],
  );
  return rows;
}
