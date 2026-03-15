# Revspec

A review tool for AI-generated spec documents with real-time AI conversation. Comment on specific lines, get AI replies instantly, resolve discussions, and approve — all without leaving the terminal.

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

## Usage

```bash
revspec spec.md
```

Opens a TUI in line mode with vim-style navigation. Press `c` on any line to open a thread and start commenting.

### Markdown rendering

Revspec renders markdown in-place (toggle with `m`):

- **Headings** — colored and bold, `#`–`######`
- **Inline** — bold (`**`/`__`), italic (`*`/`_`), bold-italic (`***`), strikethrough (`~~`), `code`, [links](url)
- **Fenced code blocks** — fence markers dimmed, body in green
- **Tables** — box-drawing borders, header row bolded, auto-column-widths
- **Lists** — unordered (`•`), ordered, task lists (`☐`/`☑`)
- **Blockquotes** — bar gutter, italicized text
- **Cursor line** highlighting across all elements
- **Search highlights** — colored match segments

### Keybindings

| Key | Action |
|-----|--------|
| `j/k` | Move cursor down/up |
| `gg` / `G` | Go to top / bottom |
| `Ctrl+D/U` | Half page down/up |
| `m` | Toggle markdown / line mode |
| `c` | Open thread / comment on line |
| `r` | Resolve thread (toggle) |
| `R` | Resolve all pending |
| `dd` | Delete draft comment (double-tap) |
| `/` | Search |
| `n/N` | Next/prev search match |
| `]t/[t` | Next/prev thread |
| `]r/[r` | Next/prev unread AI reply |
| `l` | List threads |
| `a` | Approve spec |
| `:w` | Merge changes to review JSON |
| `:wq` | Merge and quit |
| `:q` | Quit (only if merged) |
| `:q!` | Quit without merging |
| `?` | Help |

### Thread popup

The thread popup has two modes:

- **Insert mode** — type your comment, `Tab` sends, `Esc` switches to normal mode
- **Normal mode** — `j/k` and `Ctrl+D/U` scroll the conversation history, `c` to reply, `r` to resolve, `Esc` to close

## Live AI Integration

Revspec supports real-time communication with AI coding tools (Claude Code, opencode, etc.) via two CLI subcommands:

### `revspec watch <file.md>`

Blocks until the reviewer adds comments, then returns them with spec context:

```
=== New Comments ===
Thread: t1 (line 14)
  Context:
      12: The system uses polling...
    > 14: it sends a notification via webhook.
      16: resource state.
  [reviewer]: this is unclear

To reply: revspec reply spec.md t1 "<your response>"
When done replying, run: revspec watch spec.md
```

### `revspec reply <file.md> <threadId> "<text>"`

Sends an AI reply that appears instantly in the reviewer's TUI:

```bash
revspec reply spec.md t1 "Good point. I'll clarify the polling vs webhook distinction."
```

### The loop

```
1. AI generates spec
2. AI launches: revspec spec.md (in tmux pane or separate terminal)
3. AI runs: revspec watch spec.md (blocks)
4. Reviewer comments on lines in the TUI
5. Watch returns with comments → AI replies → watch again
6. Reviewer resolves threads → approves
7. AI reads review JSON, rewrites spec, launches new round
8. Repeat until clean approval
```

### Claude Code skill

Install the `/revspec` skill for Claude Code:

```bash
./scripts/install-skill.sh
```

Then use `/revspec` in Claude Code after generating a spec.

## Protocol

Communication happens through a JSONL file (`spec.review.live.jsonl`) — append-only, both sides write to it. On session end, events are merged into `spec.review.json`.

### Event types

```jsonl
{"type":"comment","threadId":"t1","line":14,"author":"reviewer","text":"unclear","ts":1710400000}
{"type":"reply","threadId":"t1","author":"owner","text":"I'll fix it","ts":1710400005}
{"type":"resolve","threadId":"t1","author":"reviewer","ts":1710400010}
{"type":"approve","author":"reviewer","ts":1710400050}
```

### Review JSON

```json
{
  "file": "spec.md",
  "threads": [
    {
      "id": "t1",
      "line": 14,
      "status": "resolved",
      "messages": [
        { "author": "reviewer", "text": "this is unclear", "ts": 1710400000 },
        { "author": "owner", "text": "I'll restructure this section", "ts": 1710400005 }
      ]
    }
  ]
}
```

Thread statuses: `open` (owner's turn), `pending` (reviewer's turn), `resolved`, `outdated`.

## License

MIT
