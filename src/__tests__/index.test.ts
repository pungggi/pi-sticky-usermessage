import { describe, it, expect } from "vitest";
import {
  filterSensitiveData,
  filterPromptLines,
  detectCodeBlocks,
  determineMessageType,
  serializeMetadata,
  deserializeMetadata,
} from "../index.js";

// ═══════════════════════════════════════════════════════════════
// filterSensitiveData
// ═══════════════════════════════════════════════════════════════

describe("filterSensitiveData", () => {
  it("redacts email addresses", () => {
    expect(filterSensitiveData("Contact user@example.com for help")).toBe(
      "Contact [email] for help",
    );
    expect(filterSensitiveData("a@b.co")).toBe("[email]");
  });

  it("redacts IPv4 addresses", () => {
    expect(filterSensitiveData("Host 192.168.1.1 is down")).toBe("Host [ip] is down");
    expect(filterSensitiveData("10.0.0.1")).toBe("[ip]");
  });

  it("redacts phone numbers (international)", () => {
    expect(filterSensitiveData("Call +1-555-123-4567")).toContain("[phone]");
    expect(filterSensitiveData("Call +44 20 7946 0958")).toContain("[phone]");
    expect(filterSensitiveData("My number is (555) 123-4567")).toContain("[phone]");
  });

  it("redacts API keys and tokens", () => {
    expect(filterSensitiveData("Use key sk-abcdefghijklmnopqrstuvwxyz123456")).toContain("[key]");
    expect(filterSensitiveData("Auth: Bearer eyJhbGciOiJIUzI1NiJ9.abc.xyz")).toBe(
      "Auth: Bearer [token]",
    );
  });

  it("redacts password-like patterns", () => {
    expect(filterSensitiveData("password: secret123")).toContain("[redacted]");
    expect(filterSensitiveData("api_key: abc123")).toContain("[redacted]");
    expect(filterSensitiveData("secret: xyz")).toContain("[redacted]");
    expect(filterSensitiveData("token: deadbeef")).toContain("[redacted]");
  });

  it("leaves normal text untouched", () => {
    const text = "Fix the auth middleware to handle expired tokens properly";
    expect(filterSensitiveData(text)).toBe(text);
  });

  it("applies custom patterns", () => {
    const result = filterSensitiveData("Ticket AB-1234 is open", ["\\b[A-Z]{2}-\\d{4}\\b"]);
    expect(result).toBe("Ticket [redacted] is open");
  });

  it("skips overly long custom patterns (ReDoS guard)", () => {
    const long = "a".repeat(201) + ".";
    // Should not throw; the long pattern is skipped.
    expect(() => filterSensitiveData("hello", [long])).not.toThrow();
  });

  it("skips invalid custom regex patterns", () => {
    expect(() => filterSensitiveData("hello", ["[invalid("])).not.toThrow();
  });
});

// ═══════════════════════════════════════════════════════════════
// filterPromptLines
// ═══════════════════════════════════════════════════════════════

describe("filterPromptLines", () => {
  it("filters outside code fences", () => {
    const prompt = "Email user@example.com\n```\nconst api_key: secret123\n```\nAnother email a@b.com";
    const result = filterPromptLines(prompt, true);
    expect(result[0]).toBe("Email [email]");
    expect(result[1]).toBe("```");
    expect(result[2]).toBe("const api_key: secret123"); // inside fence — NOT redacted
    expect(result[3]).toBe("```");
    expect(result[4]).toBe("Another email [email]");
  });

  it("skips filtering when disabled", () => {
    const prompt = "Email user@example.com\npassword: secret123";
    const result = filterPromptLines(prompt, false);
    expect(result[0]).toBe("Email user@example.com");
    expect(result[1]).toBe("password: secret123");
  });

  it("handles multiple code fences", () => {
    const prompt = "secret: abc\n```\nsecret: def\n```\nsecret: ghi\n```\nsecret: jkl\n```\nsecret: mno";
    const result = filterPromptLines(prompt, true);
    expect(result[0]).toContain("[redacted]"); // before fence
    expect(result[2]).toBe("secret: def"); // inside fence 1
    expect(result[4]).toContain("[redacted]"); // between fences
    expect(result[6]).toBe("secret: jkl"); // inside fence 2
    expect(result[8]).toContain("[redacted]"); // after fence
  });

  it("returns lines as-is when no fences and filtering off", () => {
    const prompt = "line1\nline2\nline3";
    const result = filterPromptLines(prompt, false);
    expect(result).toEqual(["line1", "line2", "line3"]);
  });
});

// ═══════════════════════════════════════════════════════════════
// detectCodeBlocks
// ═══════════════════════════════════════════════════════════════

describe("detectCodeBlocks", () => {
  it("detects triple backticks", () => {
    expect(detectCodeBlocks("```\ncode\n```")).toBe(true);
  });

  it("returns false without backticks", () => {
    expect(detectCodeBlocks("plain text")).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════
// determineMessageType
// ═══════════════════════════════════════════════════════════════

describe("determineMessageType", () => {
  it('returns "edit" for /edit and /replace', () => {
    expect(determineMessageType("/edit foo.ts")).toBe("edit");
    expect(determineMessageType("/replace bar with baz")).toBe("edit");
    expect(determineMessageType("  /edit  foo.ts  ")).toBe("edit");
  });

  it('returns "retry" for /retry', () => {
    expect(determineMessageType("/retry")).toBe("retry");
    expect(determineMessageType("/retry with changes")).toBe("retry");
  });

  it('returns "new" for ordinary prompts', () => {
    expect(determineMessageType("Fix the auth middleware")).toBe("new");
    expect(determineMessageType("Hello world")).toBe("new");
    expect(determineMessageType("Refactor the UserService class")).toBe("new");
  });

  it('returns "follow-up" for continuation phrases', () => {
    expect(determineMessageType("also fix the tests")).toBe("follow-up");
    expect(determineMessageType("can you also check the types")).toBe("follow-up");
    expect(determineMessageType("what about the database layer")).toBe("follow-up");
    expect(determineMessageType("continue with the refactor")).toBe("follow-up");
    expect(determineMessageType("keep going")).toBe("follow-up");
    expect(determineMessageType("one more thing please")).toBe("follow-up");
    expect(determineMessageType("for that case")).toBe("follow-up");
  });

  it('returns "new" for non-continuation prompts', () => {
    // These are standalone prompts, not continuations
    expect(determineMessageType("Let's work on a different task")).toBe("new");
    expect(determineMessageType("Create a new React component")).toBe("new");
  });
});

// ═══════════════════════════════════════════════════════════════
// serialize / deserialize metadata
// ═══════════════════════════════════════════════════════════════

describe("serializeMetadata / deserializeMetadata", () => {
  it("round-trips metadata", () => {
    const original = {
      prompt: "Fix the auth bug",
      timestamp: new Date("2026-05-11T12:00:00Z"),
      messageType: "new" as const,
      hasCodeBlocks: true,
    };
    const serialized = serializeMetadata(original);
    const restored = deserializeMetadata(serialized);

    expect(restored.prompt).toBe(original.prompt);
    expect(restored.timestamp.toISOString()).toBe(original.timestamp.toISOString());
    expect(restored.messageType).toBe(original.messageType);
    expect(restored.hasCodeBlocks).toBe(original.hasCodeBlocks);
  });

  it("preserves all message types", () => {
    for (const type of ["new", "follow-up", "edit", "retry"] as const) {
      const meta = {
        prompt: "test",
        timestamp: new Date(),
        messageType: type,
        hasCodeBlocks: false,
      };
      const restored = deserializeMetadata(serializeMetadata(meta));
      expect(restored.messageType).toBe(type);
    }
  });
});
