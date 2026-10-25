import type { ModelRef, OpenCodeClient } from "@opencode/client";
export type ConversationTurn = {
    id: string;
    role: "user" | "assistant";
    text: string;
};
export type PredictOptions = {
    timeoutMs: number;
    model?: string;
};
export type PredictResult = {
    ok: true;
    text: string | null;
} | {
    ok: false;
};
export type Predictor = {
    predict(model: ModelRef | undefined, turns: ConversationTurn[], variant?: string): Promise<PredictResult>;
    dispose(): Promise<void>;
};
/**
 * Prediction runs through the tool-free `generate.text` endpoint: no session
 * is created, so there is nothing to abort or clean up beyond the request
 * itself, which is cancelled by an AbortSignal on timeout.
 *
 * Model fallback: some gates — notably OpenCode's free tier — reject
 * explicitly selected models on this endpoint (503) while letting the server
 * default through, so a failed call with a specified model is retried once
 * without a model instead of failing the whole prediction. Both attempts
 * share one timeout budget.
 */
export declare function createPredictor(client: OpenCodeClient, options: PredictOptions): Predictor;
