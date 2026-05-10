# pi-sticky-usermessage

Sticky header that shows your last user message above the editor in [Pi](https://pi.dev) coding agent. Features persistence, smart formatting, and sensitive data filtering.

## What it does

After you send a prompt, a persistent bar above the input editor shows your message with rich metadata. Perfect for keeping context visible during long tool-execution sequences.

```
▎ 14:32 · ● new </>
  Fix the auth middleware to handle expired tokens properly
  and add a retry with exponential backoff to the client
```

## Features

### ✨ Core
- **Persistent Configuration**: Settings saved across sessions
- **Smart Truncation**: Word-boundary aware, respects max lines
- **Syntax Awareness**: Highlights file paths, URLs, functions, errors
- **Overflow Indicator**: Shows `… +N more lines` when message exceeds display

### 🎨 Customization
- **Timestamp Display**: Show when the message was sent
- **Message Type Indicators**: ● new, → follow-up, ✎ edit
- **Code Block Detection**: Shows `</>` marker when code is present
- **Custom Prefix Symbol**: Change the `▎` to any character
- **Theme-Aware Colors**: Uses your active Pi theme colors

### 🔒 Privacy & Security
- **Sensitive Data Filtering**: Automatically redacts emails, API keys, passwords, IPs
- **Custom Patterns**: Add your own regex patterns for redaction
- **Toggle Filtering**: Enable/disable per your needs

## Install

```bash
pi install pi-sticky-usermessage
```

Or test locally:

```bash
pi -e ./src/index.ts
```

## Usage

The header is **on by default** after installation.

### Commands

| Command | Effect |
|---------|--------|
| `/sticky` | Show current status (ON / OFF) |
| `/sticky on` | Enable the sticky header |
| `/sticky off` | Disable and clear the header |
| `/sticky show` | Show detailed configuration |
| `/sticky reset` | Reset to default settings |
| `/sticky config <key>=<value> ...` | Update configuration |
| `/sticky-lines <number>` | Set max lines (1-20) |
| `/sticky-width <number>` | Set max width (20-200) |

### Configuration Examples

```bash
# Change multiple settings at once
/sticky config maxLines=5 showTimestamp=false smartTruncation=true

# Customize colors
/sticky config timestampColor=yellow metadataColor=cyan

# Change prefix symbol
/sticky config prefixSymbol="→"

# Disable sensitive data filtering
/sticky config filterSensitive=false
```

## Configuration Options

| Key | Default | Description |
|-----|---------|-------------|
| `enabled` | `true` | Start enabled |
| `maxLines` | `3` | Maximum message lines to display (1-20) |
| `maxWidth` | `120` | Characters per line before ellipsis (20-200) |
| `showTimestamp` | `true` | Show message timestamp |
| `showMessageType` | `true` | Show message type indicator |
| `smartTruncation` | `true` | Apply smart syntax highlighting |
| `codeBlockIndicator` | `true` | Show `</>` for code blocks |
| `prefixSymbol` | `"▎"` | Prefix character for header |
| `truncateAtWordBoundary` | `true` | Truncate at word boundaries |
| `filterSensitive` | `true` | Filter sensitive data |
| `customPatterns` | `undefined` | Custom regex patterns for redaction |
| `timestampColor` | `"dim"` | Theme color for timestamps |
| `metadataColor` | `"muted"` | Theme color for metadata |

## Sensitive Data Filtering

The extension automatically detects and redacts:

- **Email addresses**: `user@example.com` → `[email]`
- **IP addresses**: `192.168.1.1` → `[ip]`
- **Phone numbers**: `(555) 123-4567` → `[phone]`
- **API keys**: `sk-abc123...` → `[key]`
- **Bearer tokens**: `Bearer xyz` → `Bearer [token]`
- **Passwords**: `password: secret123` → `password [redacted]`
- **API keys**: `api_key: abc123` → `api_key [redacted]`
- **Secrets**: `secret: xyz` → `secret [redacted]`

### Custom Patterns

Add custom regex patterns via the API or by modifying the config in code:

```typescript
config.customPatterns = [
  "\\b[A-Z]{2}-\\d{4}\\b",  // Ticket numbers like AB-1234
  "\\b\\d{4}-\\d{4}-\\d{4}-\\d{4}\\b",  // Credit card format
];
```

## Syntax Highlighting

When `smartTruncation` is enabled, the extension highlights:

- **File paths**: `src/components/Button.tsx` (accent color)
- **URLs**: `https://example.com` (cyan color)
- **Function calls**: `fetchData()` (yellow color)
- **Errors/warnings**: `Error: failed` (error color)

## Theme Colors

The extension uses these Pi theme color names:

| Color | Usage |
|-------|-------|
| `accent` | Code block markers, file paths |
| `muted` | Metadata, message type |
| `dim` | Timestamps, overflow indicator |
| `cyan` | URLs |
| `yellow` | Function calls |
| `error` | Error/warning patterns |

## Technical Details

### Persistence

Configuration and last message metadata are persisted using `pi.appendEntry()`:

```typescript
pi.appendEntry("sticky-config", {
  config: { ... },
  lastMetadata: { ... }
});
```

State is automatically restored on `session_start`.

### Event Capture

Messages are captured from the `before_agent_start` event, which fires for every prompt that reaches the agent.

## Troubleshooting

### Widget not showing
- Check if enabled: `/sticky`
- Verify UI is available (not in print mode)
- Check for errors in Pi logs

### Settings not persisting
- Ensure session is saved (Pi auto-saves)
- Check file permissions for Pi data directory
- Try `/sticky reset` then reconfigure

### Sensitive data not filtered
- Verify `filterSensitive: true` via `/sticky show`
- Check if custom patterns are needed
- Test with known patterns (email, API key)

### Text not truncating correctly
- Check `maxWidth` setting via `/sticky show`
- Verify `truncateAtWordBoundary` is set as desired
- Try adjusting `maxLines` for better fit

## License

MIT
