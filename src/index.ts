/**
 * pi-sticky-usermessage — Sticky Header Extension
 *
 * Shows your last user message as a persistent bar above the editor.
 * Updates on every new prompt. Toggle with /sticky on|off.
 *
 * Install:  pi install pi-sticky-usermessage
 * Or local: pi -e ./src/index.ts
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

interface StickyConfig {
  enabled: boolean;
  /** Number of message lines to show before truncating. */
  maxLines: number;
  /** Max characters per line before ellipsis. */
  maxWidth: number;
}

export default function stickyUsermessage(pi: ExtensionAPI) {
  const config: StickyConfig = { enabled: true, maxLines: 3, maxWidth: 120 };

  // ── Command ──────────────────────────────────────────────────────────

  pi.registerCommand("sticky", {
    description: "Sticky header: toggle on/off or show status",
    handler: async (args, ctx) => {
      const arg = args.trim().toLowerCase();
      if (arg === "on") {
        config.enabled = true;
        ctx.ui.notify("Sticky header: ON", "info");
      } else if (arg === "off") {
        config.enabled = false;
        ctx.ui.setWidget("sticky-header", undefined);
        ctx.ui.notify("Sticky header: OFF", "info");
      } else {
        ctx.ui.notify(
          `Sticky header: ${config.enabled ? "ON" : "OFF"}`,
          "info",
        );
      }
    },
  });

  // ── Event — Capture the last user message ───────────────────────────

  pi.on("before_agent_start", (event, ctx) => {
    if (!ctx.hasUI || !config.enabled) return;

    const prompt = event.prompt.trim();
    if (!prompt) {
      ctx.ui.setWidget("sticky-header", undefined);
      return;
    }

    const rawLines = prompt.split("\n");
    const displayLines: string[] = [];

    for (let i = 0; i < Math.min(rawLines.length, config.maxLines); i++) {
      let line = rawLines[i];
      if (line.length > config.maxWidth) {
        line = line.slice(0, config.maxWidth - 1) + "…";
      }
      displayLines.push(line);
    }

    if (rawLines.length > config.maxLines) {
      const remaining = rawLines.length - config.maxLines;
      displayLines.push(`… +${remaining} more line${remaining !== 1 ? "s" : ""}`);
    }

    ctx.ui.setWidget("sticky-header", (_tui, theme) => ({
      render: () =>
        displayLines.map((line, i) => {
          const prefix = i === 0 ? theme.fg("accent", "▎ ") : "  ";
          return prefix + theme.fg("muted", line);
        }),
      invalidate: () => {},
    }));
  });
}
