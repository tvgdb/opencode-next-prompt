export type SuggestionState = {
    kind: "idle";
} | {
    kind: "predicting";
    sessionID: string;
    generation: number;
} | {
    kind: "ready";
    sessionID: string;
    text: string;
    generation: number;
};
export type SuggestionListener = (state: SuggestionState) => void;
/**
 * A tiny explicit pub/sub store.
 *
 * Deliberately not a solid signal: a plugin loaded at runtime resolves solid's
 * server build under bun's node conditions (createEffect would be a no-op)
 * and the plugin's copy of solid is never the TUI's copy, so reactivity must
 * not depend on it.
 */
export declare function createSuggestionStore(): {
    read(): SuggestionState;
    /** Subscribes to state transitions; returns the unsubscribe function. */
    subscribe(listener: SuggestionListener): () => void;
    beginPredict(sessionID: string): number | null;
    commit(generation: number, sessionID: string, text: string | null): void;
    discard(): void;
};
export type SuggestionStore = ReturnType<typeof createSuggestionStore>;
