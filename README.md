# Revspec

A review tool for AI-generated spec documents with real-time AI conversation. Comment on specific lines, get AI replies instantly, resolve discussions, submit for rewrites, and approve — all without leaving the terminal.

## Why

When an AI generates a spec, the human review step breaks the agentic loop. You have to open the file separately, read it, then type unstructured feedback. Revspec closes this loop with a TUI that lets you comment inline and discuss with the AI in real-time — like a chatroom anchored to the spec.

## Install

Requires [Bun](https://bun.sh) (install: `curl -fsSL https://bun.sh/install | bash`).

```bash
bun install -g revspec
```

Or from source:

```bash
git clone https://github.com/icyrainz/revspec.git
cd revspec && bun install && bun link
```

### Claude Code plugin

Install the `/revspec` skill for Claude Code:

```bash
/plugin marketplace add icyrainz/revspec
/plugin install revspec
```

Or manually (clone + symlink, stays updated with `git pull`):

```bash
git clone https://github.com/icyrainz/revspec.git ~/.local/share/revspec
ln -sfn ~/.local/share/revspec/skills/revspec ~/.claude/skills/revspec
```

## Usage

```bash
revspec spec.md
```

Opens a TUI with vim-style navigation. Press `c` on any line to open a thread and start commenting.

### Keybindings

**Navigation**

| Key | Action |
|-----|--------|
| `j/k` | Move cursor down/up |
| `gg` / `G` | Go to top / bottom |
| `Ctrl+D/U` | Half page down/up |
| `H/M/L` | Jump to screen top / middle / bottom |
| `zz` | Center cursor line in viewport |
| `/` | Search (smartcase) |
| `n/N` | Next/prev search match |
| `Esc` | Clear search highlights |
| `]t/[t` | Next/prev thread |
| `]r/[r` | Next/prev unread AI reply |
| `]1/[1` | Next/prev h1 heading |
| `]2/[2` | Next/prev h2 heading |
| `]3/[3` | Next/prev h3 heading |
| `Ctrl+O/I` | Jump list back/forward |
| `''` | Jump to previous position |

**Review**

| Key | Action |
|-----|--------|
| `c` | Open thread / comment on line |
| `r` | Resolve thread (toggle) |
| `R` | Resolve all pending |
| `dd` | Delete thread (with confirm) |
| `t` | List threads (`Ctrl+F` to filter all/active/resolved) |
| `S` | Submit for rewrite (AI updates spec, TUI reloads) |
| `A` | Approve spec (finalize and exit) |

**Commands**

| Key | Action |
|-----|--------|
| `:q` | Quit (warns if unresolved threads) |
| `:q!` | Force quit (also `:wq!`, `:qa!`, etc.) |
| `:{N}` | Jump to line N |
| `Ctrl+C` | Force quit |
| `?` | Help |

### Thread popup

The thread popup has two vim-style modes, indicated by border color and label:

- **Insert mode** (green border) — type your comment, `Tab` sends, `Esc` switches to normal mode
- **Normal mode** (blue border) — `j/k` and `Ctrl+D/U` scroll the conversation, `gg/G` top/bottom, `i/c` to reply, `r` to resolve, `q/Esc` to close

### Markdown rendering

Revspec renders markdown in-place:

- **Headings** — colored and bold, `#`–`######`
- **Inline** — bold, italic, bold-italic, strikethrough, `code`, links
- **Fenced code blocks** — markers dimmed, body in green
- **Tables** — box-drawing borders, header row bolded, auto-column-widths
- **Lists** — unordered, ordered, task lists
- **Blockquotes** — bar gutter, italicized text
- **Cursor line** highlighting and **search highlights**

## Live AI Integration

Revspec communicates with AI coding tools (Claude Code, etc.) via CLI subcommands:

### `revspec watch <file.md>`

Blocks until the reviewer acts, then returns structured output:

```
=== New Comments ===
Thread: x1a3f (line 14)
  Context:
      12: The system uses polling...
    > 14: it sends a notification via webhook.
      16: resource state.
  [reviewer]: this is unclear

To reply: revspec reply spec.md x1a3f "<your response>"
When done replying, run: revspec watch spec.md
```

Watch exits on three events:
- **Comment/reply** — returns thread content for AI to respond
- **Submit (`S`)** — returns resolved thread summaries for AI to rewrite the spec
- **Approve (`A`)** — spec is finalized
- **Session end** — reviewer quit the TUI

### `revspec reply <file.md> <threadId> "<text>"`

Sends an AI reply that appears instantly in the reviewer's TUI.

### The loop

```
1. AI generates spec
2. AI launches: revspec spec.md (in tmux pane)
3. AI runs: revspec watch spec.md (blocks)
4. Reviewer comments → AI replies → watch again
5. Reviewer resolves threads → presses S (submit)
6. Watch returns resolved thread summaries → AI rewrites spec
7. TUI reloads with new spec → reviewer continues reviewing
8. Repeat 3-7 until A (approve)
```

## Testing

```bash
bun run test          # Unit + integration (~3s)
bun run test:e2e      # E2E snapshot tests (~7s)
bun run test:all      # Everything
```

E2E tests use `bun-pty` to spawn revspec in a pseudo-terminal (80x24), send keystrokes, capture plain-text output, and compare snapshots.

## Protocol

Communication happens through a JSONL file (`spec.review.jsonl`) — append-only, both sides write to it. The JSONL is the single source of truth for the review session.

### Event types

```jsonl
{"type":"comment","threadId":"x1a3f","line":14,"author":"reviewer","text":"unclear","ts":1710400000}
{"type":"reply","threadId":"x1a3f","author":"owner","text":"I'll fix it","ts":1710400005}
{"type":"resolve","threadId":"x1a3f","author":"reviewer","ts":1710400010}
{"type":"submit","author":"reviewer","ts":1710400050}
{"type":"approve","author":"reviewer","ts":1710400060}
{"type":"session-end","author":"reviewer","ts":1710400070}
```

The `submit` event acts as a round delimiter — the AI rewrites the spec, and the TUI reloads. Events before a `submit` reference the previous spec version.

Thread statuses: `open` (awaiting AI reply), `pending` (AI replied, awaiting reviewer), `resolved`, `outdated`.

## License

MIT
