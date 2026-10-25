/** Where debug output lands while running inside the real TUI. */
export declare const DEBUG_LOG_FILE: string;
/**
 * Debug logging is off by default. Enable with `NEXT_PROMPT_DEBUG=1` (or the
 * globalThis flag used by tests).
 *
 * Output goes to a file: inside the TUI, console.error is captured by the
 * host and never reaches stderr, so a file is the only reliable channel.
 */
export declare function debug(message: string, extra?: unknown): void;
