# Quick Start Guide

## Installation

```bash
pi install pi-sticky-usermessage
```

## Basic Usage

1. **Send a message** - the sticky header appears automatically
2. **Press ENTER/SPACE** - expand to see full message
3. **Press ↑/↓** - scroll through long messages
4. **Press ESC** - collapse back to summary view

## Common Commands

```bash
/sticky              # Check if enabled
/sticky on           # Enable
/sticky off          # Disable
/sticky show         # View all settings
/sticky reset        # Reset to defaults

/sticky-lines 5      # Show up to 5 lines
/sticky-width 100    # Max 100 chars per line

# Multiple settings at once
/sticky config maxLines=5 showTimestamp=true filterSensitive=false
```

## Configuration Options

| Option | Default | Description |
|--------|---------|-------------|
| `maxLines` | 3 | Lines to show before truncating |
| `maxWidth` | 120 | Characters per line |
| `showTimestamp` | true | Show time message was sent |
| `showMessageType` | true | Show ● new / → follow-up |
| `smartTruncation` | true | Highlight files, URLs, errors |
| `codeBlockIndicator` | true | Show `</>` for code |
| `truncateAtWordBoundary` | true | Don't cut words in half |
| `filterSensitive` | true | Redact emails, API keys, etc. |
| `prefixSymbol` | "▎" | Header prefix character |

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `ENTER` | Toggle expand/collapse |
| `SPACE` | Toggle expand/collapse |
| `E` | Toggle expand/collapse |
| `↑` | Scroll up (when expanded) |
| `↓` | Scroll down (when expanded) |
| `ESC` | Collapse (when expanded) |

## Message Type Indicators

- `● new` - First message in session
- `→ follow-up` - Continuing conversation
- `✎ edit` - Edit command detected
- `↺ retry` - Retry operation

## Privacy Features

Automatically redacts:
- Email addresses → `[email]`
- API keys → `[sk-key]` or `[key]`
- Passwords → `password [redacted]`
- IP addresses → `[ip]`
- Phone numbers → `[phone]`
- Bearer tokens → `Bearer [token]`

Disable with: `/sticky config filterSensitive=false`

## Examples

### See your current settings
```bash
/sticky show
```

### Customize for coding sessions
```bash
/sticky config maxLines=7 smartTruncation=true codeBlockIndicator=true
```

### Privacy mode (no timestamps, redact everything)
```bash
/sticky config showTimestamp=false filterSensitive=true
```

### Minimal header
```bash
/sticky config showTimestamp=false showMessageType=false prefixSymbol="→"
```

## Troubleshooting

**Header not showing?**
```bash
/sticky on  # Make sure it's enabled
```

**Settings not saving?**
- Pi auto-saves; just restart to verify

**Want to reset everything?**
```bash
/sticky reset
```

**Text not truncating right?**
```bash
/sticky config truncateAtWordBoundary=true
```

## Need More Help?

See `README.md` for full documentation.
See `IMPROVEMENTS.md` for what's new in the enhanced version.
