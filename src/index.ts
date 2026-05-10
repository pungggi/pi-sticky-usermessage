/**
 * pi-sticky-usermessage — Enhanced Sticky Header Extension
 *
 * Shows your last user message as a persistent, interactive bar above the editor.
 * Features: persistence, scrollable view, syntax awareness, smart truncation,
 * message metadata, accessibility features, and sensitive data filtering.
 *
 * Install:  pi install pi-sticky-usermessage
 * Or local: pi -e ./src/index.ts
 */

import type { ExtensionAPI, ExtensionContext, Theme } from "@earendil-works/pi-coding-agent";
import type { Component, TUI } from "@earendil-works/pi-tui";
import { matchesKey, Key } from "@earendil-works/pi-tui";

// ═══════════════════════════════════════════════════════════════
// Configuration Types
// ═══════════════════════════════════════════════════════════════

interface StickyConfig {
  enabled: boolean;
  maxLines: number;
  maxWidth: number;
  // New customization options
  showTimestamp: boolean;
  showMessageType: boolean;
  smartTruncation: boolean;
  codeBlockIndicator: boolean;
  prefixSymbol: string;
  truncateAtWordBoundary: boolean;
  filterSensitive: boolean;
  customPatterns?: string[];
  // Theme colors
  timestampColor: string;
  metadataColor: string;
}

interface MessageMetadata {
  prompt: string;
  timestamp: Date;
  messageType: "new" | "follow-up" | "edit" | "retry";
  turnNumber: number;
  hasCodeBlocks: boolean;
}

interface SavedState {
  config: StickyConfig;
  lastMetadata?: MessageMetadata;
}

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
// Sensitive Data Patterns
// ═══════════════════════════════════════════════════════════════

const SENSITIVE_PATTERNS = [
  { pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, replacement: "[email]" },
  { pattern: /\b(?:\d{1,3}\.){3}\d{1,3}\b/g, replacement: "[ip]" },
  { pattern: /\b(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g, replacement: "[phone]" },
  { pattern: /\b[A-Za-z0-9]{32,}\b/g, replacement: "[key]" }, // Likely API keys/tokens
  { pattern: /sk-[a-zA-Z0-9]{20,}/g, replacement: "[sk-key]" }, // OpenAI-style keys
  { pattern: /Bearer\s+[A-Za-z0-9._-]+/gi, replacement: "Bearer [token]" },
  { pattern: /password["\s:=]+[^\s"']+/gi, replacement: "password [redacted]" },
  { pattern: /api[_-]?key["\s:=]+[^\s"']+/gi, replacement: "api_key [redacted]" },
  { pattern: /secret["\s:=]+[^\s"']+/gi, replacement: "secret [redacted]" },
  { pattern: /token["\s:=]+[^\s"']+/gi, replacement: "token [redacted]" },
];

// ═══════════════════════════════════════════════════════════════
// Custom Interactive Widget Component
// ═══════════════════════════════════════════════════════════════

class StickyWidgetComponent implements Component {
  private metadata: MessageMetadata;
  private config: StickyConfig;
  private theme: Theme;
  private tui: TUI;
  private cachedLines: string[] = [];
  private cachedWidth = 0;
  private version = 0;
  private expanded = false;
  private scrollOffset = 0;
  private onExpandToggle: () => void;

  constructor(
    metadata: MessageMetadata,
    config: StickyConfig,
    theme: Theme,
    tui: TUI,
    onExpandToggle: () => void,
  ) {
    this.metadata = metadata;
    this.config = config;
    this.theme = theme;
    this.tui = tui;
    this.onExpandToggle = onExpandToggle;
  }

  handleInput(data: string): void {
    // Handle keyboard interactions
    if (matchesKey(data, Key.enter) || data === " " || data === "e" || data === "E") {
      this.toggleExpand();
    } else if (matchesKey(data, Key.up) && this.expanded) {
      this.scrollOffset = Math.max(0, this.scrollOffset - 1);
      this.invalidate();
    } else if (matchesKey(data, Key.down) && this.expanded) {
      const maxOffset = Math.max(0, this.getDisplayLines().length - this.config.maxLines);
      this.scrollOffset = Math.min(maxOffset, this.scrollOffset + 1);
      this.invalidate();
    } else if (matchesKey(data, Key.escape) && this.expanded) {
      this.expanded = false;
      this.scrollOffset = 0;
      this.invalidate();
      this.onExpandToggle();
    }
  }

  private toggleExpand(): void {
    this.expanded = !this.expanded;
    this.scrollOffset = 0;
    this.version++;
    this.tui.requestRender();
    this.onExpandToggle();
  }

  invalidate(): void {
    this.cachedWidth = 0;
    this.cachedLines = [];
  }

  updateMetadata(metadata: MessageMetadata): void {
    this.metadata = metadata;
    this.version++;
    this.invalidate();
  }

  updateConfig(config: StickyConfig): void {
    this.config = config;
    this.version++;
    this.invalidate();
  }

  private getDisplayLines(): string[] {
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
      filterSensitive,
      timestampColor,
      metadataColor,
    } = this.config;

    let text = prompt;

    // Filter sensitive data
    if (filterSensitive) {
      text = this.filterSensitiveData(text);
    }

    const rawLines = text.split("\n");
    const displayLines: string[] = [];

    // Build metadata line
    const metaParts: string[] = [];
    if (showTimestamp) {
      const timeStr = timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      metaParts.push(this.theme.fg(timestampColor, timeStr));
    }
    if (showMessageType) {
      const typeSymbol = messageType === "new" ? "●" : messageType === "follow-up" ? "→" : messageType === "edit" ? "✎" : "↺";
      metaParts.push(this.theme.fg(metadataColor, `${typeSymbol} ${messageType}`));
    }
    if (hasCodeBlocks && codeBlockIndicator) {
      metaParts.push(this.theme.fg("accent", "</>"));
    }

    // Process content with syntax awareness
    for (let i = 0; i < rawLines.length; i++) {
      let line = rawLines[i];
      const isCodeBlock = line.startsWith("```") || line.trim().startsWith("```");

      if (isCodeBlock && codeBlockIndicator) {
        // Highlight code block markers
        line = this.theme.fg("accent", line);
      } else if (smartTruncation) {
        // Apply smart truncation with syntax highlighting
        line = this.smartFormatLine(line, maxWidth, truncateAtWordBoundary);
      } else {
        // Simple truncation
        line = this.truncateLine(line, maxWidth, truncateAtWordBoundary);
      }

      displayLines.push(line);
    }

    // Combine metadata with content
    if (metaParts.length > 0) {
      const metaLine = this.theme.fg(metadataColor, prefixSymbol) + " " + metaParts.join(this.theme.fg("dim", " · "));
      displayLines.unshift(metaLine);
    }

    return displayLines;
  }

  private filterSensitiveData(text: string): string {
    let filtered = text;
    for (const { pattern, replacement } of SENSITIVE_PATTERNS) {
      filtered = filtered.replace(pattern, replacement);
    }
    // Apply custom patterns
    if (this.config.customPatterns) {
      for (const customPattern of this.config.customPatterns) {
        try {
          const regex = new RegExp(customPattern, "gi");
          filtered = filtered.replace(regex, "[custom-redacted]");
        } catch {
          // Invalid pattern, skip
        }
      }
    }
    return filtered;
  }

  private smartFormatLine(line: string, maxWidth: number, truncateAtWord: boolean): string {
    // Detect and format common patterns
    const trimmed = line.trim();

    // File paths
    if (trimmed.match(/^[\w./~-]+\.(ts|js|py|rs|go|java|c|cpp|h|json|yaml|yml|md|txt|sh|bash|zsh|fish)$/i)) {
      return this.theme.fg("accent", this.truncateLine(line, maxWidth, truncateAtWord));
    }

    // URLs
    if (trimmed.match(/^https?:\/\//i)) {
      return this.theme.fg("cyan", this.truncateLine(line, maxWidth, truncateAtWord));
    }

    // Function/method calls
    if (trimmed.match(/^\w+\(/)) {
      return this.theme.fg("yellow", this.truncateLine(line, maxWidth, truncateAtWord));
    }

    // Error patterns
    if (trimmed.match(/error|warning|fail|exception/i)) {
      return this.theme.fg("error", this.truncateLine(line, maxWidth, truncateAtWord));
    }

    // Default: just truncate
    return this.truncateLine(line, maxWidth, truncateAtWord);
  }

  private truncateLine(line: string, maxWidth: number, atWordBoundary: boolean): string {
    if (line.length <= maxWidth) return line;

    if (atWordBoundary) {
      // Find last word boundary within limit
      const truncated = line.slice(0, maxWidth - 1);
      const lastSpace = truncated.lastIndexOf(" ");
      const lastPunctuation = Math.max(
        truncated.lastIndexOf("."),
        truncated.lastIndexOf(","),
        truncated.lastIndexOf(";"),
        truncated.lastIndexOf(":"),
      );
      const cutPoint = Math.max(lastSpace, lastPunctuation);
      
      if (cutPoint > maxWidth * 0.6) {
        return line.slice(0, cutPoint) + "…";
      }
    }

    return line.slice(0, maxWidth - 1) + "…";
  }

  render(width: number): string[] {
    // Return cached if valid
    if (this.cachedWidth === width && this.cachedLines.length > 0) {
      return this.cachedLines;
    }

    const allLines = this.getDisplayLines();
    let linesToShow: string[];

    if (this.expanded) {
      // Show with scroll
      const start = this.scrollOffset;
      const end = Math.min(start + this.config.maxLines, allLines.length);
      linesToShow = allLines.slice(start, end);

      // Add scroll indicator
      if (allLines.length > this.config.maxLines) {
        const scrollInfo = this.theme.fg(
          "dim",
          `[${start + 1}-${end}/${allLines.length}] ↑↓ scroll, ESC collapse`,
        );
        linesToShow.push(scrollInfo);
      } else {
        linesToShow.push(this.theme.fg("dim", "[ESC collapse]"));
      }
    } else {
      // Truncated view
      linesToShow = allLines.slice(0, this.config.maxLines);

      if (allLines.length > this.config.maxLines) {
        const remaining = allLines.length - this.config.maxLines;
        linesToShow.push(
          this.theme.fg("dim", `… +${remaining} more line${remaining !== 1 ? "s" : ""}`),
        );
      }
      
      // Add expand hint
      if (allLines.length > 1) {
        linesToShow.push(this.theme.fg("dim", `[ENTER/SPACE expand]`));
      }
    }

    // Add accessibility label (screen reader friendly)
    const ariaLabel = `Sticky message header: ${this.expanded ? "expanded" : "collapsed"}, ${allLines.length} lines`;
    linesToShow.unshift(this.theme.fg("dim", `<!-- ${ariaLabel} -->`));

    this.cachedLines = linesToShow;
    this.cachedWidth = width;

    return linesToShow;
  }
}

// ═══════════════════════════════════════════════════════════════
// Main Extension
// ═══════════════════════════════════════════════════════════════

export default function stickyUsermessage(pi: ExtensionAPI) {
  let config: StickyConfig = { ...DEFAULT_CONFIG };
  let widgetComponent: StickyWidgetComponent | null = null;
  let currentMetadata: MessageMetadata | null = null;
  let turnCount = 0;

  // ═══════════════════════════════════════════════════════════
  // Persistence Functions
  // ═══════════════════════════════════════════════════════════

  function loadState(): void {
    try {
      const entries = pi.getEntries?.() || [];
      for (let i = entries.length - 1; i >= 0; i--) {
        const entry = entries[i];
        if (entry.type === "custom" && entry.customType === "sticky-config") {
          const saved = entry.data as SavedState;
          config = { ...DEFAULT_CONFIG, ...saved.config };
          if (saved.lastMetadata) {
            currentMetadata = saved.lastMetadata;
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
        lastMetadata: currentMetadata,
      } as SavedState);
    } catch (error) {
      console.error("Failed to save sticky header state:", error);
    }
  }

  // ═══════════════════════════════════════════════════════════
  // Helper Functions
  // ═══════════════════════════════════════════════════════════

  function detectCodeBlocks(text: string): boolean {
    return /```[\s\S]*?```/.test(text) || text.includes("```");
  }

  function determineMessageType(
    prompt: string,
    isRetry: boolean = false,
  ): "new" | "follow-up" | "edit" | "retry" {
    if (isRetry) return "retry";
    if (prompt.startsWith("/edit ") || prompt.startsWith("/replace ")) return "edit";
    if (currentMetadata && turnCount > 1) return "follow-up";
    return "new";
  }

  function updateWidget(ctx: ExtensionContext, metadata: MessageMetadata): void {
    if (!ctx.hasUI || !config.enabled) {
      ctx.ui.setWidget("sticky-header", undefined);
      return;
    }

    const theme = ctx.ui.theme;
    
    // Update existing component or create new one
    if (widgetComponent) {
      widgetComponent.updateMetadata(metadata);
    } else {
      widgetComponent = new StickyWidgetComponent(
        metadata,
        config,
        theme,
        ctx.ui as any,
        () => {
          // Callback when expand state changes
          // Could trigger overlay or other actions
        },
      );
    }

    ctx.ui.setWidget("sticky-header", () => widgetComponent!);
  }

  // ═══════════════════════════════════════════════════════════
  // Session Start - Load State
  // ═══════════════════════════════════════════════════════════

  pi.on("session_start", async (_event, ctx) => {
    loadState();
    
    // Restore widget if we have previous metadata
    if (currentMetadata && config.enabled && ctx.hasUI) {
      updateWidget(ctx, currentMetadata);
    }
  });

  // ═══════════════════════════════════════════════════════════
  // Turn Events - Track Turn Count
  // ═══════════════════════════════════════════════════════════

  pi.on("turn_start", async (_event, ctx) => {
    turnCount++;
  });

  // ═══════════════════════════════════════════════════════════
  // Message Events - Capture User Messages
  // ═══════════════════════════════════════════════════════════

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
      turnNumber: turnCount + 1,
      hasCodeBlocks: detectCodeBlocks(prompt),
    };

    currentMetadata = metadata;
    updateWidget(ctx, metadata);
    saveState();
  });

  // Also capture from input events for broader coverage
  pi.on("input", (event, ctx) => {
    if (event.type === "submit" && event.text && event.text.trim()) {
      const prompt = event.text.trim();
      const metadata: MessageMetadata = {
        prompt,
        timestamp: new Date(),
        messageType: determineMessageType(prompt),
        turnNumber: turnCount,
        hasCodeBlocks: detectCodeBlocks(prompt),
      };

      currentMetadata = metadata;
      updateWidget(ctx, metadata);
      saveState();
    }
  });

  // ═══════════════════════════════════════════════════════════
  // Commands
  // ═══════════════════════════════════════════════════════════

  pi.registerCommand("sticky", {
    description: "Sticky header control: on|off|show|config|reset",
    handler: async (args, ctx) => {
      const arg = args.trim().toLowerCase();
      
      if (arg === "on") {
        config.enabled = true;
        if (currentMetadata) updateWidget(ctx, currentMetadata);
        saveState();
        ctx.ui.notify("Sticky header: ON", "success");
      } 
      else if (arg === "off") {
        config.enabled = false;
        ctx.ui.setWidget("sticky-header", undefined);
        saveState();
        ctx.ui.notify("Sticky header: OFF", "info");
      } 
      else if (arg === "show") {
        const status = [
          `Sticky header: ${config.enabled ? "ON" : "OFF"}`,
          `  Max lines: ${config.maxLines}`,
          `  Max width: ${config.maxWidth}`,
          `  Timestamp: ${config.showTimestamp ? "ON" : "OFF"}`,
          `  Message type: ${config.showMessageType ? "ON" : "OFF"}`,
          `  Smart truncation: ${config.smartTruncation ? "ON" : "OFF"}`,
          `  Word boundary: ${config.truncateAtWordBoundary ? "ON" : "OFF"}`,
          `  Filter sensitive: ${config.filterSensitive ? "ON" : "OFF"}`,
        ];
        ctx.ui.notify(status.join("\n"), "info");
      } 
      else if (arg === "reset") {
        config = { ...DEFAULT_CONFIG };
        if (currentMetadata && config.enabled) updateWidget(ctx, currentMetadata);
        saveState();
        ctx.ui.notify("Sticky header: Reset to defaults", "success");
      }
      else if (arg.startsWith("config ")) {
        // Parse config changes: /sticky config maxLines=5 showTimestamp=false
        const changes = arg.slice(7).trim();
        const pairs = changes.split(/\s+/);
        
        for (const pair of pairs) {
          const [key, value] = pair.split("=");
          if (!key || !value) continue;
          
          switch (key) {
            case "maxLines":
              config.maxLines = Math.max(1, Math.min(20, parseInt(value, 10)));
              break;
            case "maxWidth":
              config.maxWidth = Math.max(20, Math.min(200, parseInt(value, 10)));
              break;
            case "showTimestamp":
              config.showTimestamp = value === "true";
              break;
            case "showMessageType":
              config.showMessageType = value === "true";
              break;
            case "smartTruncation":
              config.smartTruncation = value === "true";
              break;
            case "codeBlockIndicator":
              config.codeBlockIndicator = value === "true";
              break;
            case "prefixSymbol":
              config.prefixSymbol = value || "▎";
              break;
            case "truncateAtWordBoundary":
              config.truncateAtWordBoundary = value === "true";
              break;
            case "filterSensitive":
              config.filterSensitive = value === "true";
              break;
            case "timestampColor":
              config.timestampColor = value;
              break;
            case "metadataColor":
              config.metadataColor = value;
              break;
          }
        }
        
        if (widgetComponent) {
          widgetComponent.updateConfig(config);
        }
        if (currentMetadata && config.enabled) {
          updateWidget(ctx, currentMetadata);
        }
        saveState();
        ctx.ui.notify("Sticky header: Configuration updated", "success");
      }
      else {
        // Show current status
        ctx.ui.notify(
          `Sticky header: ${config.enabled ? "ON" : "OFF"} (use /sticky show for details)`,
          config.enabled ? "info" : "warning",
        );
      }
    },
  });

  // Additional configuration commands for quick access
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
      ctx.ui.notify(`Sticky header: Max lines set to ${num}`, "success");
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
      ctx.ui.notify(`Sticky header: Max width set to ${num}`, "success");
    },
  });
}
