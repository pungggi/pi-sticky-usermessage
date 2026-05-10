# pi-sticky-usermessage

Sticky header that shows your last user message above the editor in [Pi](https://pi.dev) coding agent.

## What it does

After you send a prompt, the first few lines of your message stay pinned above the input editor. This helps you keep context visible while the agent works — especially useful during long tool-execution sequences where your original message scrolls away.

```
▎ Fix the auth middleware to handle expired tokens properly
  and add a retry with exponential backoff to the client
… +4 more lines
─────────────────────────────────────────────────────────
> Your next prompt here...
─────────────────────────────────────────────────────────
```

- Theme-aware: uses `accent` + `muted` colors from your active Pi theme
- Auto-truncates: long lines get `…`, multi-paragraph messages collapse to 3 lines with a `+N more` hint
- Non-intrusive: sits in a TUI widget above the editor, zero interference with tool output

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

| Command | Effect |
|---------|--------|
| `/sticky` | Show current status (ON / OFF) |
| `/sticky on` | Enable the sticky header |
| `/sticky off` | Disable and clear the header |

## Configuration

Edit `src/index.ts` and tweak the `config` object at the top:

| Key | Default | Description |
|-----|---------|-------------|
| `enabled` | `true` | Start enabled |
| `maxLines` | `3` | Maximum message lines to display |
| `maxWidth` | `120` | Characters per line before ellipsis |

## License

MIT
