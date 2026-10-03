# tiny-agent-harness

A tiny agent harness in one TypeScript file.
It calls tools, asks for approval, blocks a dangerous action, trims its own context, and stops a model that never finishes.
The model is a mock. No API key.

## Why it matters

The model decides what to do next.
The harness decides what actually happens.

Tools, permissions, context, budgets and logs all live outside the model.
That is the part you can see, test and control.
If you can't test your harness without a model, you can't really test your harness.

## Run it

You need Node.js 18 or newer.

```bash
npm install
npx tsx harness.ts
```

## Example output

This is real output from `npx tsx harness.ts`:

```text
Run 1: release notes
  1  call     read_file(CHANGELOG.md)
  1  result   1.4.0: fix retry backoff, add CSV export
  2  call     write_file(RELEASE.md::Fixed retry backoff. Added CSV export.)
  2  result   wrote RELEASE.md
  3  call     send_email(team@example.com)
  3  approved approver said yes
  3  result   sent to team@example.com
  4  call     delete_branch(release/1.4.0)
  4  blocked  denied by policy
  5  stop     Release notes written and sent.

Run 2: a model that never finishes
  1  call     read_file(CHANGELOG.md)
  1  result   1.4.0: fix retry backoff, add CSV export
  2  call     read_file(CHANGELOG.md)
  2  result   1.4.0: fix retry backoff, add CSV export
  3  trim     dropped 2 old messages
  3  call     read_file(CHANGELOG.md)
  3  result   1.4.0: fix retry backoff, add CSV export
  4  trim     dropped 4 old messages
  4  call     read_file(CHANGELOG.md)
  4  result   1.4.0: fix retry backoff, add CSV export
  4  stop     step budget reached
```

Run 1 reads and writes files, gets approval to send one email, and is blocked from deleting a branch.
Run 2 never finishes. The harness trims old messages on step 3 and stops the run on step 4.

## How it works

```text
Context ──→ Model ──→ Proposal
   ↑                     ↓
   │                Permissions
   │                     ↓
Event log ←── Result ←── Tool

Step budget: stop when it's out
```

| File | What it does |
| --- | --- |
| `harness.ts` | The whole harness, in the same order as the post |
| `output.txt` | Real output of `npx tsx harness.ts` |
| `package.json` | `tsx`, `typescript` and `@types/node` as dev dependencies |
| `tsconfig.json` | Strict settings for `npx tsc --noEmit` |

Inside `harness.ts`:

- Types: `Message`, `ModelTurn`, `Model`, `Tool`, `HarnessEvent`
- Tool registry: `read_file` and `write_file` are `allow`, `send_email` is `ask`, `delete_branch` is `deny`
- `checkPermission`: turns `allow`, `ask` and `deny` into a verdict
- `trimContext`: keeps the system prompt, the task, and as many recent messages as fit
- `runHarness`: the loop, the step budget, and the event log
- `scriptedModel` and `stuckModel`: the mocks
- `approve`: stands in for a person and only says yes to `@example.com`

## Limits

This is a teaching harness.

- The model is a script. A real model reads the context and can surprise you.
- Token counts are characters divided by four. Fine for a demo, wrong for billing.
- Trimming drops old messages. It does not summarize them.
- It does not notice it's stuck. Run 2 burns its whole budget.
- Approval is a function, not a person. A real `ask` has to pause and resume.
- Tools run in the same process. There is no sandbox.
- The log is a list, not a graph. It records what happened, not why.
- The changelog, file names and email address are made up.

## Read more

- Dev.to: [What Is an Agent Harness? Build a Tiny One in TypeScript](https://dev.to/bobbyhalljr/what-is-an-agent-harness-build-a-tiny-one-in-typescript-4fde)
- Substack: [What Is an Agent Harness? Build a Tiny One in TypeScript](https://bobbyhalljr.substack.com/p/what-is-an-agent-harness)
- More of my writing: [bhjr.dev](https://bhjr.dev)

## License

MIT. See [LICENSE](LICENSE).
