# Claude Code Integration Notes

Deferred — to be addressed when building the `/review-revspec` skill.

## Problem

Claude Code's Bash tool runs without TTY (no stdin, no terminal). A TUI app can't take over the terminal directly.

## Launch strategies

| Environment | Approach |
|---|---|
| tmux session (`$TMUX` set) | `tmux split-window -v "revspec <file>"` + `tmux wait-for` — seamless, human reviews in a pane |
| No tmux | Claude Code prints "Please run: `revspec <file>`" and polls for `.review.json` changes |

## Existing infrastructure

- `~/.config/tmux/claude-hook.sh` — generic hook dispatcher
- `~/.config/tmux/claude-hooks.d/` — per-event hook directories
- `tmux-sudo-pane` skill pattern — existing precedent for spawning interactive commands in tmux

## Open questions

- Can we use Claude Code's Ctrl+G (`$EDITOR`) mechanism? It has TTY access but is designed for text editors, not arbitrary TUIs.
- Should we register a Claude Code hook that auto-launches revspec when a review file is created?
- Polling frequency and mechanism for the no-tmux fallback.
