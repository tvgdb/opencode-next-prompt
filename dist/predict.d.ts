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
    predict(sessionID: string, model: ModelRef | undefined, turns: ConversationTurn[], variant?: string): Promise<PredictResult>;
    dispose(): Promise<void>;
};
/**
 * By default, prediction runs through `session.generate` (`POST /api/session/:sessionID/generate`),
 * which executes in the session's own `Location` (honoring project-scoped providers and models in
 * `opencode.jsonc`, reusing the session's prompt cache, and mutating nothing).
 *
 * When the user explicitly configures `options.model`, we try `generate.text` first so the custom
 * model/variant override takes effect, and fall back to `session.generate` if `generate.text` fails
 * (for example, when the provider is only defined in the project config rather than global config).
 */
export declare function createPredictor(client: OpenCodeClient, options: PredictOptions): Predictor;
