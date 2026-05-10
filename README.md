# pi-sticky-usermessage

Enhanced sticky header that shows your last user message above the editor in [Pi](https://pi.dev) coding agent. Features persistence, interactivity, smart formatting, and more.

## What it does

After you send a prompt, a persistent bar above the input editor shows your message with rich metadata. Perfect for keeping context visible during long tool-execution sequences.

```
▎ 14:32 · ● new </>
  Fix the auth middleware to handle expired tokens properly
  and add a retry with exponential backoff to the client
[ENTER/SPACE expand]
```

## Features

### ✨ Core Features
- **Persistent Configuration**: Settings saved across sessions
- **Interactive Widget**: Expand/collapse with keyboard (ENTER/SPACE/ESC)
- **Scrollable View**: Navigate long messages with ↑↓ arrows
- **Smart Truncation**: Word-boundary aware, doesn't cut important words
- **Syntax Awareness**: Highlights file paths, URLs, functions, errors

### 🎨 Customization
- **Timestamp Display**: Show when the message was sent
- **Message Type Indicators**: ● new, → follow-up, ✎ edit, ↺ retry
- **Code Block Detection**: Shows `</>` marker when code is present
- **Custom Prefix Symbol**: Change the `▎` to any character
- **Theme-Aware Colors**: Uses your active Pi theme colors

### 🔒 Privacy & Security
- **Sensitive Data Filtering**: Automatically redacts emails, API keys, passwords, IPs
- **Custom Patterns**: Add your own regex patterns for redaction
- **Toggle Filtering**: Enable/disable per your needs

### ♿ Accessibility
- **Screen Reader Labels**: ARIA-like comments for assistive tech
- **Keyboard Navigation**: Full keyboard control, no mouse needed
- **Clear Visual Cues**: Expand/collapse states are obvious

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

### Keyboard Controls (when widget has focus)

| Key | Action |
|-----|--------|
| `ENTER` / `SPACE` / `E` | Toggle expand/collapse |
| `↑` / `↓` | Scroll through expanded message |
| `ESC` | Collapse (when expanded) |

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

Edit via `/sticky config <key>=<value>` or modify defaults in code:

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
- **API keys**: `sk-abc123...` → `[sk-key]`
- **Bearer tokens**: `Bearer xyz` → `Bearer [token]`
- **Passwords**: `password: secret123` → `password [redacted]`
- **API keys**: `api_key: abc123` → `api_key [redacted]`
- **Secrets**: `secret: xyz` → `secret [redacted]`
- **Long alphanumeric strings**: Likely tokens/keys → `[key]`

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

## Event Handling

The extension captures messages from multiple events for comprehensive coverage:

- `before_agent_start` - When agent starts processing
- `input` - When you submit from the editor

This ensures messages are captured regardless of how they're sent.

## Theme Colors

The extension uses these Pi theme color names:

- `accent` - Primary accent color
- `muted` - Muted text color
- `dim` - Dimmed text color
- `success` - Success messages
- `warning` - Warning messages
- `error` - Error messages
- `cyan` - Cyan color
- `yellow` - Yellow color

## Examples

### Basic Usage

```
You: /sticky on
You: Fix the authentication bug
[Header shows your message with timestamp]
```

### Expanding Long Messages

```
You: Write a comprehensive guide about...
[Header shows first 3 lines]
[Press ENTER to expand]
[Header shows full message with scroll]
[Use ↑↓ to navigate, ESC to collapse]
```

### Configuration

```
You: /sticky show
[Shows all current settings]

You: /sticky config maxLines=5 filterSensitive=false
[Updates configuration and saves]

You: /sticky-lines 7
[Quick way to set max lines]
```

### Privacy Mode

```
You: /sticky config filterSensitive=true showTimestamp=false
[Redacts sensitive data, hides timestamps]
```

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

### Widget Component

The widget is a custom `StickyWidgetComponent` implementing the Pi TUI `Component` interface:

- `render(width: number): string[]` - Renders the widget
- `handleInput(data: string): void` - Handles keyboard input
- `invalidate(): void` - Clears cached rendering

### Multi-Event Capture

Messages are captured from both `before_agent_start` and `input` events to ensure comprehensive coverage.

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
- Verify `filterSensitive: true`
- Check if custom patterns are needed
- Test with known patterns (email, API key)

### Text not truncating correctly
- Check `maxWidth` setting
- Verify `truncateAtWordBoundary` is set as desired
- Try adjusting `maxLines` for better fit

## License

MIT

## Contributing

Contributions welcome! Areas for improvement:

- More syntax highlighting patterns
- Additional sensitive data patterns
- Click-to-copy functionality
- Message history navigation
- Export/import configurations
- Theme presets
