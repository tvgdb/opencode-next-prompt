import { asPromptTextarea } from "./editor.js";
import { debug } from "./debug.js";
const ARROW_KEYS = {
    right: "→",
    left: "←",
    up: "↑",
    down: "↓",
};
const SHELL_PLACEHOLDER_PREFIX = "Run a command";
export function isShellPlaceholder(placeholder) {
    return typeof placeholder === "string" && placeholder.startsWith(SHELL_PLACEHOLDER_PREFIX);
}
function displayKey(key) {
    return ARROW_KEYS[key] ?? key;
}
/**
 * Renders the suggestion into the prompt textarea's placeholder. There is no
 * slot inside the input in V2, so the controller writes the placeholder
 * directly: it re-applies on store changes, on the renderer's `focused_editor`
 * event, and — because the TUI rewrites the placeholder from its own reactive
 * memo (session switch, resize, shell change) — on every frame while a
 * suggestion is live. `sessionID()` answers which session the prompt edits.
 *
 * Deliberately free of solid-js: a plugin loaded at runtime resolves solid's
 * server build (createEffect would be a no-op) and the plugin's copy of solid
 * is not the TUI's copy anyway, so side effects here must not depend on it.
 *
 * The placeholder is only cleared when it is ours (it starts with the accept
 * key marker), so OpenCode's own placeholder list is left untouched.
 */
export function createPlaceholderController(context, store, sessionID, acceptKey) {
    const marker = ` [${displayKey(acceptKey)}] `;
    const apply = () => {
        const editor = asPromptTextarea(context.renderer.currentFocusedEditor);
        const current = store.read();
        debug("apply", {
            kind: current.kind,
            want: current.kind === "ready" ? current.sessionID : undefined,
            have: sessionID(),
            editor: editor !== null,
        });
        if (!editor)
            return;
        if (isShellPlaceholder(editor.placeholder))
            return;
        if (current.kind === "ready" && current.sessionID === sessionID()) {
            const desired = marker + current.text;
            // Write only on real changes: the setter is idempotent, which is what
            // lets the frame reconciler below settle after restoring our marker.
            if (editor.placeholder !== desired)
                editor.placeholder = desired;
            return;
        }
        if (typeof editor.placeholder === "string" && editor.placeholder.startsWith(marker)) {
            editor.placeholder = null;
        }
    };
    // TUI overwrites trigger a render, so reconciling on the next frame
    // restores our marker within one paint; when idle there is nothing to
    // defend, and frames skip the work entirely.
    const onFrame = () => {
        if (store.read().kind === "ready")
            apply();
    };
    let unsubscribe = null;
    return {
        apply,
        start() {
            unsubscribe = store.subscribe(apply);
            context.renderer.on("focused_editor", apply);
            context.renderer.on("frame", onFrame);
        },
        dispose() {
            unsubscribe?.();
            unsubscribe = null;
            context.renderer.off("focused_editor", apply);
            context.renderer.off("frame", onFrame);
            const editor = asPromptTextarea(context.renderer.currentFocusedEditor);
            if (editor && typeof editor.placeholder === "string" && editor.placeholder.startsWith(marker)) {
                editor.placeholder = null;
            }
        },
    };
}
