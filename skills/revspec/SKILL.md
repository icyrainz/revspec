---
name: revspec
description: Launch revspec to review a spec document with real-time AI feedback. Use when the user says /revspec, "review the spec", "let me review this", or after generating a spec/design document that needs human review. Also use when a brainstorming or writing-plans skill produces a markdown spec file.
---

# Revspec — Live Spec Review

Launch revspec to let the human review a spec document with real-time AI conversation. The reviewer comments on specific lines, you reply instantly, and the discussion continues until the spec is approved.

## When to Use

- After writing or updating a spec/design document
- When the user explicitly asks to review a spec
- After the brainstorming or writing-plans skill produces a `.md` file

## How It Works

You and the human communicate through revspec's CLI:
- `revspec watch <file.md>` — blocks until the reviewer adds comments, then returns them
- `revspec reply <file.md> <threadId> "<text>"` — sends your reply (appears in the TUI instantly)

The reviewer stays in the revspec TUI for the entire session. You run the watch/reply loop.

## Step 1: Find the Spec File

Detect which spec was recently created or modified in this conversation. Look for:
- Files written to `docs/superpowers/specs/*.md`
- The last `.md` file you created or edited
- If ambiguous, ask the user which file to review

## Step 2: Launch Revspec

Check if running inside tmux:

```bash
echo $TMUX
```

**If tmux is available:**
```bash
tmux split-window -v "revspec <spec-file>"
```

**If no tmux:**
Tell the user: "Please run in another terminal: `revspec <spec-file>`"

## Step 3: Run the Watch/Reply Loop

Start watching for reviewer comments:

```bash
revspec watch <spec-file>
```

This blocks until the reviewer adds comments. When it returns, you'll see output like:

```
--- New threads ---

[t1] line 14 (new):
  Context:
    12: The system uses polling...
   >14: it sends a notification via webhook.
    16: resource state.
  Comment: "this is unclear"

To reply: revspec reply spec.md <threadId> "<your response>"
When done replying, run: revspec watch spec.md
```

**For each comment:** Read the context, understand the concern, and reply thoughtfully:

```bash
revspec reply <spec-file> t1 "Good point. I'll clarify — it uses polling to detect changes, then sends a webhook notification to downstream services."
```

After replying to all comments, run `revspec watch` again to wait for the next batch.

**If watch returns "Session ended. Reviewer exited revspec."** — the reviewer closed the TUI without approving. Stop the watch loop and wait. The user can invoke `/revspec` again later to resume the review.

**Important:** Your replies should be substantive — address the concern, explain your reasoning, or acknowledge the change you'll make. Don't just say "noted" or "will fix."

## Step 4: Handle Approval

When the reviewer approves, watch returns:

```
Review approved.
Review file: <path-to-review.json>
```

Read `<spec-file>.review.json` and review the resolved threads. Determine if any feedback requires changes to the spec.

**If changes are needed:**
1. Rewrite the spec incorporating the feedback from resolved threads
2. Commit the updated spec
3. Append a round marker to the JSONL:
   ```bash
   echo '{"type":"round","author":"owner","round":2,"ts":'$(date +%s000)'}' >> <spec-file>.review.live.jsonl
   ```
4. Launch a new revspec session (go back to Step 2) so the reviewer can verify the changes

**If no changes needed** (threads were clarification questions, compliments, or the reviewer approved with no threads):

The spec is finalized. Report: "Spec approved and finalized at `<spec-file>`. Ready to proceed with implementation."

## Loop Summary

```
1. Launch revspec on spec file
2. Watch for comments
3. Reply to each comment
4. Watch again (repeat 2-3 until approval)
5. On approval: check if spec changes needed
6. If changes needed: rewrite spec, launch new round (go to 1)
7. If no changes needed: done
```

## Tips

- Read the full thread history in the watch output before replying — the reviewer may have added context across multiple messages
- When rewriting the spec after approval, address every resolved thread — the reviewer trusted you to incorporate their feedback
- Keep replies concise but complete — the reviewer can see them instantly and will follow up if needed
- If a comment is about a section you're unsure about, say so honestly — "I'm not sure about the best approach here. Options are X or Y — which do you prefer?"
