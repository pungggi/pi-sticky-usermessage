/**
 * pi-sticky-usermessage — Sticky Header Extension
 *
 * Shows your last user message as a persistent bar above the editor in Pi.
 * Install:  pi install pi-sticky-usermessage
 * Local:    pi -e ./src/index.ts
 */

import type { ExtensionAPI, ExtensionContext, Theme, ThemeColor } from "@earendil-works/pi-coding-agent";
import { truncateToWidth } from "@earendil-works/pi-tui";

// ═══════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════

interface StickyConfig {
  enabled: boolean;
  maxLines: number;
  maxWidth: number;
  showTimestamp: boolean;
  showMessageType: boolean;
  smartTruncation: boolean;
  codeBlockIndicator: boolean;
  prefixSymbol: string;
  truncateAtWordBoundary: boolean;
  filterSensitive: boolean;
  customPatterns?: string[];
  timestampColor: ThemeColor;
  metadataColor: ThemeColor;
}

interface MessageMetadata {
  prompt: string;
  timestamp: Date;
  messageType: "new" | "follow-up" | "edit" | "retry";
  hasCodeBlocks: boolean;
}

/** Serialized form for persistence (Date → ISO string). */
interface SerializedMetadata {
  prompt: string;
  timestamp: string;
  messageType: "new" | "follow-up" | "edit" | "retry";
  hasCodeBlocks: boolean;
}

interface SavedState {
  config: StickyConfig;
  lastMetadata?: SerializedMetadata;
}

// ═══════════════════════════════════════════════════════════════
// Defaults
// ═══════════════════════════════════════════════════════════════

const DEFAULT_CONFIG: StickyConfig = {
  enabled: true,
  maxLines: 3,
  maxWidth: 120,
  showTimestamp: true,
  showMessageType: true,
  smartTruncation: true,
  codeBlockIndicator: true,
  prefixSymbol: "▎",
  truncateAtWordBoundary: true,
  filterSensitive: true,
  customPatterns: undefined,
  timestampColor: "dim",
  metadataColor: "muted",
};

// ═══════════════════════════════════════════════════════════════
// Sensitive Data Filtering
// ═══════════════════════════════════════════════════════════════

/**
 * Pattern definitions stored as source strings.
 * Fresh RegExp instances are created per invocation to avoid /g lastIndex bugs.
 */
interface SensitivePatternDef {
  source: string;
  flags: string;
  replacement: string;
}

const SENSITIVE_PATTERN_DEFS: readonly SensitivePatternDef[] = [
  { source: "\\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}\\b", flags: "g", replacement: "[email]" },
  { source: "\\b(?:\\d{1,3}\\.){3}\\d{1,3}\\b", flags: "g", replacement: "[ip]" },
  // International phone with optional country code and flexible separators.
  { source: "\\b(?:\\+\\d{1,3}[-.\\s]?)?\\(?\\d{2,4}\\)?[-.\\s]?\\d{2,4}[-.\\s]?\\d{3,6}\\b", flags: "g", replacement: "[phone]" },
  // Prefixed secrets only — avoids false positives on long identifiers / hashes
  { source: "\\b(?:sk-|ghp_|gho_|github_pat_|xox[bpsa]-)[A-Za-z0-9_-]{20,}\\b", flags: "g", replacement: "[key]" },
  { source: "Bearer\\s+[A-Za-z0-9._-]+", flags: "gi", replacement: "Bearer [token]" },
  { source: "(?:password|passwd|pwd)[\"'\\s:=]+[^\\s\"']+", flags: "gi", replacement: "password [redacted]" },
  { source: "api[_-]?key[\"'\\s:=]+[^\\s\"']+", flags: "gi", replacement: "api_key [redacted]" },
  { source: "secret[\"'\\s:=]+[^\\s\"']+", flags: "gi", replacement: "secret [redacted]" },
  { source: "token[\"'\\s:=]+[^\\s\"']+", flags: "gi", replacement: "token [redacted]" },
] as const;

/** Max source length for custom regex patterns to mitigate ReDoS. */
const MAX_CUSTOM_PATTERN_LENGTH = 200;

export function filterSensitiveData(text: string, customPatterns?: string[]): string {
  let filtered = text;

  for (const def of SENSITIVE_PATTERN_DEFS) {
    filtered = filtered.replace(new RegExp(def.source, def.flags), def.replacement);
  }

  if (customPatterns) {
    for (const pattern of customPatterns) {
      if (pattern.length > MAX_CUSTOM_PATTERN_LENGTH) continue;
      try {
        filtered = filtered.replace(new RegExp(pattern, "gi"), "[redacted]");
      } catch {
        // Invalid regex — skip
      }
    }
  }

  return filtered;
}

/**
 * Split the prompt into lines and filter sensitive data only on lines
 * outside code fences. Lines inside ``` fences are left intact so that
 * code-snippet examples are not mangled.
 */
export function filterPromptLines(
  prompt: string,
  shouldFilter: boolean,
  customPatterns?: string[],
): string[] {
  const allLines = prompt.split("\n");
  if (!shouldFilter) return allLines;

  const result: string[] = [];
  let insideFence = false;

  for (const line of allLines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("```")) {
      insideFence = !insideFence;
      result.push(line); // keep fence markers as-is
      continue;
    }
    if (insideFence) {
      result.push(line); // inside code block — don't filter
      continue;
    }
    result.push(filterSensitiveData(line, customPatterns));
  }

  return result;
}

// ═══════════════════════════════════════════════════════════════
// Widget Component (display-only — setWidget does not forward keys)
// ═══════════════════════════════════════════════════════════════

class StickyWidgetComponent {
  private metadata: MessageMetadata;
  private config: StickyConfig;
  private theme: Theme;
  private cachedLines: string[] | null = null;
  private cachedWidth = -1;

  constructor(metadata: MessageMetadata, config: StickyConfig, theme: Theme) {
    this.metadata = metadata;
    this.config = config;
    this.theme = theme;
  }

  /** Called by the setWidget factory so theme changes are reflected. */
  setTheme(theme: Theme): void {
    this.theme = theme;
    this.invalidate();
  }

  updateMetadata(metadata: MessageMetadata): void {
    this.metadata = metadata;
    this.invalidate();
  }

  updateConfig(config: StickyConfig): void {
    this.config = config;
    this.invalidate();
  }

  invalidate(): void {
    this.cachedLines = null;
    this.cachedWidth = -1;
  }

  render(width: number): string[] {
    if (this.cachedLines !== null && this.cachedWidth === width) {
      return this.cachedLines;
    }

    const lines = this.buildDisplayLines(width);
    this.cachedLines = lines;
    this.cachedWidth = width;
    return lines;
  }

  // ─── Private helpers ─────────────────────────────────────

  private buildDisplayLines(termWidth: number): string[] {
    const { prompt, timestamp, messageType, hasCodeBlocks } = this.metadata;
    const {
      maxLines,
      maxWidth,
      showTimestamp,
      showMessageType,
      smartTruncation,
      codeBlockIndicator,
      prefixSymbol,
      truncateAtWordBoundary,
      filterSensitive: shouldFilter,
      timestampColor,
      metadataColor,
    } = this.config;

    // --- sensitive data (code-fence-aware) ---
    const rawLines = filterPromptLines(prompt, shouldFilter, this.config.customPatterns);

    const displayLines: string[] = [];

    // --- metadata line ---
    const metaParts: string[] = [];
    if (showTimestamp) {
      const timeStr = timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      metaParts.push(this.theme.fg(timestampColor, timeStr));
    }
    if (showMessageType) {
      const symbols: Record<string, string> = { new: "●", "follow-up": "→", edit: "✎", retry: "↺" };
      metaParts.push(this.theme.fg(metadataColor, `${symbols[messageType] ?? "●"} ${messageType}`));
    }
    if (hasCodeBlocks && codeBlockIndicator) {
      metaParts.push(this.theme.fg("accent", "</>"));
    }

    if (metaParts.length > 0) {
      const metaLine =
        this.theme.fg(metadataColor, prefixSymbol) +
        " " +
        metaParts.join(this.theme.fg("dim", " · "));
      displayLines.push(truncateToWidth(metaLine, termWidth));
    }

    // --- content lines ---
    for (const rawLine of rawLines) {
      let line: string;
      const isCodeBlock = rawLine.startsWith("```") || rawLine.trim().startsWith("```");

      if (isCodeBlock && codeBlockIndicator) {
        line = this.theme.fg("accent", this.truncateLine(rawLine, maxWidth, truncateAtWordBoundary));
      } else if (smartTruncation) {
        line = this.smartFormatLine(rawLine, maxWidth, truncateAtWordBoundary);
      } else {
        line = this.truncateLine(rawLine, maxWidth, truncateAtWordBoundary);
      }

      displayLines.push(truncateToWidth(line, termWidth));
    }

    // --- apply maxLines limit ---
    if (displayLines.length > maxLines) {
      const kept = displayLines.slice(0, maxLines);
      const remaining = displayLines.length - maxLines;
      kept.push(
        truncateToWidth(
          this.theme.fg("dim", `… +${remaining} more line${remaining !== 1 ? "s" : ""}`),
          termWidth,
        ),
      );
      return kept;
    }

    return displayLines;
  }

  private smartFormatLine(line: string, maxLen: number, atWord: boolean): string {
    const trimmed = line.trim();
    let color: ThemeColor | null = null;

    // Standalone file path on its own line, or inline path with directory separator.
    if (
      /^[\w./~\\-]+\.[a-z]{1,12}$/i.test(trimmed) ||
      /[\w./~\\-]*\/[\w./~\\-]+\.[a-z]{1,12}\b/i.test(trimmed)
    ) {
      color = "accent";
    } else if (/^https?:\/\//i.test(trimmed)) {
      color = "mdLink"; // URLs
    } else if (/^\w+\(/.test(trimmed)) {
      color = "syntaxFunction"; // function calls
    } else if (/error|warning|fail|exception/i.test(trimmed)) {
      color = "error";
    }

    const truncated = this.truncateLine(line, maxLen, atWord);
    return color ? this.theme.fg(color, truncated) : truncated;
  }

  private truncateLine(line: string, maxLen: number, atWordBoundary: boolean): string {
    if (line.length <= maxLen) return line;

    if (atWordBoundary) {
      const head = line.slice(0, maxLen - 1);
      const cut = Math.max(
        head.lastIndexOf(" "),
        head.lastIndexOf("."),
        head.lastIndexOf(","),
        head.lastIndexOf(";"),
        head.lastIndexOf(":"),
      );
      // Only use the word-boundary cut if the resulting line is > 60 % of maxLen;
      // otherwise the shortened line would feel too abrupt — fall back to hard truncation.
      if (cut > maxLen * 0.6) return line.slice(0, cut) + "…";
    }

    return line.slice(0, maxLen - 1) + "…";
  }
}

// ═══════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════

export function detectCodeBlocks(text: string): boolean {
  return text.includes("```");
}

export function determineMessageType(prompt: string): "new" | "follow-up" | "edit" | "retry" {
  const normalized = prompt.trim().toLowerCase();

  if (/^\/(?:edit|replace)(?:\s|$)/.test(normalized)) return "edit";
  if (/^\/retry(?:\s|$)/.test(normalized)) return "retry";

  // Be conservative: an arbitrary later prompt in the same session is not
  // necessarily a follow-up. Only mark it as one when the prompt explicitly
  // reads like a continuation of the previous turn.
  if (
    /^(?:also|and|then|next|additionally|one more thing|another thing|continue|keep going|what about)\b/.test(
      normalized,
    ) ||
    /^(?:can you also|could you also|please also|regarding (?:that|this|the above)|about (?:that|this|the above)|for that|in that case|same for)\b/.test(
      normalized,
    )
  ) {
    return "follow-up";
  }

  return "new";
}

export function serializeMetadata(m: MessageMetadata): SerializedMetadata {
  return {
    prompt: m.prompt,
    timestamp: m.timestamp.toISOString(),
    messageType: m.messageType,
    hasCodeBlocks: m.hasCodeBlocks,
  };
}

export function deserializeMetadata(s: SerializedMetadata): MessageMetadata {
  return {
    prompt: s.prompt,
    timestamp: new Date(s.timestamp),
    messageType: s.messageType,
    hasCodeBlocks: s.hasCodeBlocks,
  };
}

// ═══════════════════════════════════════════════════════════════
// Config helpers
// ═══════════════════════════════════════════════════════════════

/** Valid ThemeColor values from Pi's theme system. */
const VALID_COLORS: ReadonlySet<string> = new Set<ThemeColor>([
  "accent",
  "border",
  "borderAccent",
  "borderMuted",
  "success",
  "error",
  "warning",
  "muted",
  "dim",
  "text",
  "thinkingText",
  "userMessageText",
  "customMessageText",
  "customMessageLabel",
  "toolTitle",
  "toolOutput",
  "mdHeading",
  "mdLink",
  "mdLinkUrl",
  "mdCode",
  "mdCodeBlock",
  "mdCodeBlockBorder",
  "mdQuote",
  "mdQuoteBorder",
  "mdHr",
  "mdListBullet",
  "toolDiffAdded",
  "toolDiffRemoved",
  "toolDiffContext",
  "syntaxComment",
  "syntaxKeyword",
  "syntaxFunction",
  "syntaxVariable",
  "syntaxString",
  "syntaxNumber",
  "syntaxType",
  "syntaxOperator",
  "syntaxPunctuation",
  "thinkingOff",
  "thinkingMinimal",
  "thinkingLow",
  "thinkingMedium",
  "thinkingHigh",
  "thinkingXhigh",
  "bashMode",
]);

function parseConfigKey(key: string, value: string, config: StickyConfig): boolean {
  // Strip enclosing quotes from string values.
  const clean = value.replace(/^["']|["']$/g, "");

  switch (key) {
    case "maxLines":
      config.maxLines = Math.max(1, Math.min(20, parseInt(clean, 10) || 3));
      return true;
    case "maxWidth":
      config.maxWidth = Math.max(20, Math.min(200, parseInt(clean, 10) || 120));
      return true;
    case "showTimestamp":
      config.showTimestamp = clean === "true";
      return true;
    case "showMessageType":
      config.showMessageType = clean === "true";
      return true;
    case "smartTruncation":
      config.smartTruncation = clean === "true";
      return true;
    case "codeBlockIndicator":
      config.codeBlockIndicator = clean === "true";
      return true;
    case "prefixSymbol":
      config.prefixSymbol = clean || "▎";
      return true;
    case "truncateAtWordBoundary":
      config.truncateAtWordBoundary = clean === "true";
      return true;
    case "filterSensitive":
      config.filterSensitive = clean === "true";
      return true;
    case "customPatterns":
      // Comma-separated regex patterns.
      config.customPatterns = clean
        ? clean.split(",").map((p) => p.trim()).filter(Boolean)
        : undefined;
      return true;
    case "timestampColor":
      if (VALID_COLORS.has(clean)) {
        config.timestampColor = clean as ThemeColor;
        return true;
      }
      return false;
    case "metadataColor":
      if (VALID_COLORS.has(clean)) {
        config.metadataColor = clean as ThemeColor;
        return true;
      }
      return false;
    default:
      return false;
  }
}

// ═══════════════════════════════════════════════════════════════
// Main Extension
// ═══════════════════════════════════════════════════════════════

export default function stickyUsermessage(pi: ExtensionAPI) {
  let config: StickyConfig = { ...DEFAULT_CONFIG };
  let widgetComponent: StickyWidgetComponent | null = null;
  let currentMetadata: MessageMetadata | null = null;

  // ─── Persistence ───────────────────────────────────────────

  function loadState(entries: readonly { type: string; customType?: string; data?: unknown }[]): void {
    try {
      // Find the last sticky-config entry.
      for (const entry of [...entries].reverse()) {
        if (entry.type === "custom" && entry.customType === "sticky-config") {
          const saved = entry.data as SavedState;
          config = { ...DEFAULT_CONFIG, ...saved.config };
          if (saved.lastMetadata) {
            currentMetadata = deserializeMetadata(saved.lastMetadata);
          }
          break;
        }
      }
    } catch (error) {
      console.error("Failed to load sticky header state:", error);
    }
  }

  function saveState(): void {
    try {
      pi.appendEntry("sticky-config", {
        config,
        lastMetadata: currentMetadata ? serializeMetadata(currentMetadata) : undefined,
      } satisfies SavedState);
    } catch (error) {
      console.error("Failed to save sticky header state:", error);
    }
  }

  // ─── Widget management ─────────────────────────────────────

  function updateWidget(ctx: ExtensionContext, metadata: MessageMetadata): void {
    if (!ctx.hasUI || !config.enabled) {
      ctx.ui.setWidget("sticky-header", undefined);
      return;
    }

    // Create or reuse the component
    if (widgetComponent) {
      widgetComponent.updateMetadata(metadata);
      widgetComponent.updateConfig(config);
    } else {
      widgetComponent = new StickyWidgetComponent(metadata, config, ctx.ui.theme);
    }

    // Capture local reference to avoid non-null assertions in the factory.
    const comp = widgetComponent;
    ctx.ui.setWidget("sticky-header", (_tui, theme) => {
      comp.setTheme(theme);
      return comp;
    });
  }

  // ─── Events ────────────────────────────────────────────────

  pi.on("session_start", async (_event, ctx) => {
    loadState(ctx.sessionManager.getEntries());
    if (currentMetadata && config.enabled && ctx.hasUI) {
      updateWidget(ctx, currentMetadata);
    }
  });

  // Single capture point — before_agent_start always fires for agent prompts.
  // Using only this event avoids the double-capture race from input + before_agent_start.
  pi.on("before_agent_start", (event, ctx) => {
    const prompt = event.prompt.trim();
    if (!prompt) {
      ctx.ui.setWidget("sticky-header", undefined);
      return;
    }

    const metadata: MessageMetadata = {
      prompt,
      timestamp: new Date(),
      messageType: determineMessageType(prompt),
      hasCodeBlocks: detectCodeBlocks(prompt),
    };

    currentMetadata = metadata;
    updateWidget(ctx, metadata);
    saveState();
  });

  // ─── Commands ──────────────────────────────────────────────

  pi.registerCommand("sticky", {
    description: "Sticky header control: on|off|show|config|reset",
    handler: async (args, ctx) => {
      const arg = args.trim().toLowerCase();

      if (arg === "on") {
        config.enabled = true;
        if (currentMetadata) updateWidget(ctx, currentMetadata);
        saveState();
        ctx.ui.notify("Sticky header: ON", "info");
      } else if (arg === "off") {
        config.enabled = false;
        ctx.ui.setWidget("sticky-header", undefined);
        saveState();
        ctx.ui.notify("Sticky header: OFF", "info");
      } else if (arg === "show") {
        const customCount = config.customPatterns?.length ?? 0;
        const status = [
          `Sticky header: ${config.enabled ? "ON" : "OFF"}`,
          `  Max lines: ${config.maxLines}`,
          `  Max width: ${config.maxWidth}`,
          `  Timestamp: ${config.showTimestamp ? "ON" : "OFF"}`,
          `  Message type: ${config.showMessageType ? "ON" : "OFF"}`,
          `  Smart truncation: ${config.smartTruncation ? "ON" : "OFF"}`,
          `  Word boundary: ${config.truncateAtWordBoundary ? "ON" : "OFF"}`,
          `  Filter sensitive: ${config.filterSensitive ? "ON" : "OFF"}`,
          `  Custom patterns: ${customCount} (${customCount > 0 ? config.customPatterns!.join(", ") : "none"})`,
          `  Timestamp color: ${config.timestampColor}`,
          `  Metadata color: ${config.metadataColor}`,
        ];
        ctx.ui.notify(status.join("\n"), "info");
      } else if (arg === "reset") {
        config = { ...DEFAULT_CONFIG };
        if (currentMetadata && config.enabled) updateWidget(ctx, currentMetadata);
        saveState();
        ctx.ui.notify("Sticky header: Reset to defaults", "info");
      } else if (arg.startsWith("config ")) {
        const errors = applyConfigChanges(arg.slice(7).trim());
        if (widgetComponent) widgetComponent.updateConfig(config);
        if (currentMetadata && config.enabled) updateWidget(ctx, currentMetadata);
        saveState();
        if (errors.length > 0) {
          ctx.ui.notify(
            `Sticky header: Configuration updated (${errors.length} invalid key${errors.length !== 1 ? "s" : ""}: ${errors.join(", ")})`,
            "warning",
          );
        } else {
          ctx.ui.notify("Sticky header: Configuration updated", "info");
        }
      } else {
        ctx.ui.notify(
          `Sticky header: ${config.enabled ? "ON" : "OFF"} (use /sticky show for details)`,
          config.enabled ? "info" : "warning",
        );
      }
    },
  });

  pi.registerCommand("sticky-lines", {
    description: "Set max lines to display: /sticky-lines <number>",
    handler: async (args, ctx) => {
      const num = parseInt(args.trim(), 10);
      if (isNaN(num) || num < 1 || num > 20) {
        ctx.ui.notify("Usage: /sticky-lines <1-20>", "error");
        return;
      }
      config.maxLines = num;
      if (widgetComponent) widgetComponent.updateConfig(config);
      if (currentMetadata && config.enabled) updateWidget(ctx, currentMetadata);
      saveState();
      ctx.ui.notify(`Sticky header: Max lines set to ${num}`, "info");
    },
  });

  pi.registerCommand("sticky-width", {
    description: "Set max line width: /sticky-width <number>",
    handler: async (args, ctx) => {
      const num = parseInt(args.trim(), 10);
      if (isNaN(num) || num < 20 || num > 200) {
        ctx.ui.notify("Usage: /sticky-width <20-200>", "error");
        return;
      }
      config.maxWidth = num;
      if (widgetComponent) widgetComponent.updateConfig(config);
      if (currentMetadata && config.enabled) updateWidget(ctx, currentMetadata);
      saveState();
      ctx.ui.notify(`Sticky header: Max width set to ${num}`, "info");
    },
  });

  // ─── Config parsing ────────────────────────────────────────

  function applyConfigChanges(changes: string): string[] {
    const errors: string[] = [];
    const pairs = changes.split(/\s+/);
    for (const pair of pairs) {
      const eqIdx = pair.indexOf("=");
      if (eqIdx < 0) continue;
      const key = pair.slice(0, eqIdx);
      const value = pair.slice(eqIdx + 1);
      if (!key) continue;

      if (!parseConfigKey(key, value, config)) {
        errors.push(key);
      }
    }
    return errors;
  }
}
