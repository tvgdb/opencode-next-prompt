import type { ModelRef, OpenCodeClient } from "@opencode/client"
import { debug } from "./debug.ts"

export type ConversationTurn = { id: string; role: "user" | "assistant"; text: string }

export type PredictOptions = {
  timeoutMs: number
  model?: string
}

export type PredictResult = { ok: true; text: string | null } | { ok: false }

const PROMPT = `You are the user in a conversation with an AI coding assistant. The
assistant just finished replying to your latest message.

Write your next message — your natural reaction to what you just read.
Address the assistant directly: a request, a question, or an instruction
(the assistant acts; you never describe doing things yourself). React to
what was said, not to how it was said. One line, natural and brief, in
your language and tone.
Do not call any tools and do not take any actions. Reply with plain text only.

If nothing plausible remains to say, reply with exactly: NO_SUGGESTION

Conversation (oldest first):
`

const MAX_PREDICTION_CHARS = 170
const MAX_TURNS = 8
const MAX_TURN_CHARS = 800

const TITLE = "next-prompt-suggestion"
const DENY_ALL_TOOLS = [{ action: "*", resource: "*", effect: "deny" as const }]

export type Predictor = {
  predict(
    sessionID: string,
    model: { providerID: string; id: string } | undefined,
    turns: ConversationTurn[],
    variant?: string,
    location?: { directory: string },
  ): Promise<PredictResult>
  dispose(): Promise<void>
}

/**
 * Prediction runs through a lightweight, tool-denied helper session in the active
 * session's `Location` using `session.generate` (`POST /api/session/:sessionID/generate`):
 * - `location` ensures project-scoped providers and models in `opencode.jsonc` resolve.
 * - `permissions: [{ action: "*", resource: "*", effect: "deny" }]` strips all MCP tools,
 *   skills, and MCP instructions from the request context.
 * - `model: spec` applies the resolved fast/small model (e.g. `agents["next-prompt"].model`
 *   or `agents.title.model`) and minimal/low reasoning variant.
 * - `session.generate` writes no messages and emits no execution events, and the empty
 *   helper session is removed immediately after the call completes.
 */
export function createPredictor(client: OpenCodeClient, options: PredictOptions): Predictor {
  let activeHelperSessionID: string | undefined

  const removeHelperSession = async (id: string | undefined): Promise<void> => {
    if (!id) return
    if (activeHelperSessionID === id) activeHelperSessionID = undefined
    if (typeof client.session?.remove === "function") {
      await client.session.remove({ sessionID: id }).catch(() => {})
    }
  }

  return {
    async predict(sessionID, model, turns, variant, location) {
      if (turns.length === 0) return { ok: true, text: null }
      const prompt = PROMPT + renderConversation(turns)
      const ref = resolveModel(options.model, model)
      const spec = ref ? { providerID: ref.providerID, id: ref.id, ...(variant ? { variant } : {}) } : undefined
      const deadline = Date.now() + options.timeoutMs

      const runWithTimeout = async (call: (signal: AbortSignal) => Promise<{ text: string }>): Promise<PredictResult> => {
        const remaining = deadline - Date.now()
        if (remaining <= 0) return { ok: false }
        const controller = new AbortController()
        const timer = setTimeout(() => controller.abort(), remaining)
        try {
          const result = await call(controller.signal)
          return { ok: true, text: parsePrediction(result.text) }
        } finally {
          clearTimeout(timer)
        }
      }

      const hasSessionCreate = typeof client.session?.create === "function"
      const hasSessionGenerate = typeof client.session?.generate === "function"
      const hasGenerateText = typeof client.generate?.text === "function"

      if (hasSessionCreate && hasSessionGenerate) {
        try {
          return await runWithTimeout(async (signal) => {
            const created = await client.session.create(
              {
                title: TITLE,
                ...(location ? { location: { directory: location.directory } } : {}),
                ...(spec ? { model: spec } : {}),
                permissions: DENY_ALL_TOOLS,
              },
              { signal },
            )
            activeHelperSessionID = created.id
            try {
              return await client.session.generate({ sessionID: created.id, prompt }, { signal })
            } finally {
              await removeHelperSession(created.id)
            }
          })
        } catch (error) {
          debug("helper session.generate failed", errorMessage(error))
          return { ok: false }
        }
      }

      if (options.model && spec && hasGenerateText) {
        try {
          return await runWithTimeout((signal) => client.generate.text({ prompt, model: spec }, { signal }))
        } catch (error) {
          if (!hasSessionGenerate) {
            debug("generate failed", errorMessage(error))
            return { ok: false }
          }
          debug("generate.text with custom model failed, falling back to session.generate", errorMessage(error))
        }
      }

      if (hasSessionGenerate) {
        try {
          return await runWithTimeout((signal) => client.session.generate({ sessionID, prompt }, { signal }))
        } catch (error) {
          debug("session.generate failed", errorMessage(error))
          return { ok: false }
        }
      }

      if (hasGenerateText) {
        try {
          return await runWithTimeout((signal) => client.generate.text({ prompt, model: spec }, { signal }))
        } catch (error) {
          debug("generate failed", errorMessage(error))
          return { ok: false }
        }
      }

      debug("no generation endpoint available on client")
      return { ok: false }
    },

    async dispose() {
      await removeHelperSession(activeHelperSessionID)
    },
  }
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  if (typeof error === "string") return error
  if (error && typeof error === "object") {
    const candidate = (error as { message?: unknown }).message
    if (typeof candidate === "string") return candidate
    try {
      return JSON.stringify(error)
    } catch {
      return String(error)
    }
  }
  return String(error)
}

function resolveModel(
  spec: string | undefined,
  sessionModel: { providerID: string; id: string } | undefined,
): { providerID: string; id: string } | undefined {
  if (!spec) return sessionModel
  const trimmed = spec.split("#")[0] ?? spec
  const slash = trimmed.indexOf("/")
  if (slash > 0 && slash < trimmed.length - 1) {
    return { providerID: trimmed.slice(0, slash), id: trimmed.slice(slash + 1) }
  }
  return sessionModel ? { providerID: sessionModel.providerID, id: trimmed } : undefined
}

function renderConversation(turns: ConversationTurn[]): string {
  if (turns.length === 0) return ""
  const recent = turns.slice(-MAX_TURNS)
  const lines = recent.map((turn) => `${turn.role}: ${truncate(turn.text, MAX_TURN_CHARS)}`)
  const first = turns[0]
  if (turns.length > MAX_TURNS && first?.role === "user" && first.id !== recent[0]?.id) {
    lines.unshift(`user: [original goal] ${truncate(first.text, MAX_TURN_CHARS)}`)
  }
  return lines.join("\n")
}

function truncate(text: string, max: number): string {
  return text.length > max ? text.slice(0, max - 1) + "…" : text
}

function parsePrediction(raw: string): string | null {
  const line = raw
    .replace(/<\/?think>[\s\S]*?<\/think>\s*/g, "")
    .split("\n")
    .map((item) => item.trim())
    .find((item) => item.length > 0)
  if (!line) return null
  const text = line.replace(/^["'`]+|["'`]+$/g, "")
  if (!text) return null
  const tag = text.toUpperCase().replace(/[\s-]+/g, "_").replace(/[^A-Z_]/g, "")
  if (tag === "NO_SUGGESTION") return null
  return text.length > MAX_PREDICTION_CHARS ? text.slice(0, MAX_PREDICTION_CHARS - 3) + "..." : text
}
