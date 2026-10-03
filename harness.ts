// Tiny agent harness. Companion code for "What Is an Agent Harness? Build a Tiny One in TypeScript".
// MOCKED: the model is a script, and the files, changelog and email address are made up.
// No API key. No network. Run with: npx tsx harness.ts

type Role = "system" | "user" | "assistant" | "tool";

type Message = {
  role: Role;
  content: string;
};

type ModelTurn =
  | { type: "tool"; tool: string; input: string }
  | { type: "finish"; answer: string };

type Model = (context: Message[]) => ModelTurn;

type Permission = "allow" | "ask" | "deny";

type Tool = {
  name: string;
  permission: Permission;
  run: (input: string) => string;
};

type HarnessEvent = {
  step: number;
  kind: "call" | "approved" | "blocked" | "result" | "trim" | "stop";
  detail: string;
};

const files = new Map<string, string>([
  ["CHANGELOG.md", "1.4.0: fix retry backoff, add CSV export"],
]);

const tools: Tool[] = [
  {
    name: "read_file",
    permission: "allow",
    run: (path) => files.get(path) ?? `not found: ${path}`,
  },
  {
    name: "write_file",
    permission: "allow",
    run: (input) => {
      const [path, body = ""] = input.split("::");
      files.set(path, body);
      return `wrote ${path}`;
    },
  },
  {
    name: "send_email",
    permission: "ask",
    run: (to) => `sent to ${to}`,
  },
  {
    name: "delete_branch",
    permission: "deny",
    run: (branch) => `deleted ${branch}`,
  },
];

const registry = new Map(tools.map((tool) => [tool.name, tool]));

type Approver = (tool: string, input: string) => boolean;

type Verdict = { ok: boolean; reason: string };

function checkPermission(
  tool: Tool,
  input: string,
  approve: Approver,
): Verdict {
  if (tool.permission === "allow") {
    return { ok: true, reason: "allowed" };
  }

  if (tool.permission === "deny") {
    return { ok: false, reason: "denied by policy" };
  }

  return approve(tool.name, input)
    ? { ok: true, reason: "approver said yes" }
    : { ok: false, reason: "approver said no" };
}

const estimateTokens = (message: Message) =>
  Math.ceil(message.content.length / 4);

function trimContext(messages: Message[], budget: number) {
  const [system, task, ...rest] = messages;

  let used = estimateTokens(system) + estimateTokens(task);
  const recent: Message[] = [];

  for (let i = rest.length - 1; i >= 0; i--) {
    const cost = estimateTokens(rest[i]);

    if (used + cost > budget) {
      break;
    }

    recent.unshift(rest[i]);
    used += cost;
  }

  return {
    context: [system, task, ...recent],
    dropped: rest.length - recent.length,
  };
}

type HarnessConfig = {
  model: Model;
  approve: Approver;
  maxSteps: number;
  contextBudget: number;
};

function runHarness(task: string, config: HarnessConfig) {
  const log: HarnessEvent[] = [];

  const history: Message[] = [
    { role: "system", content: "You are a release assistant." },
    { role: "user", content: task },
  ];

  for (let step = 1; step <= config.maxSteps; step++) {
    const { context, dropped } = trimContext(
      history,
      config.contextBudget,
    );

    if (dropped > 0) {
      log.push({ step, kind: "trim", detail: `dropped ${dropped} old messages` });
    }

    const turn = config.model(context);

    if (turn.type === "finish") {
      log.push({ step, kind: "stop", detail: turn.answer });
      return log;
    }

    log.push({ step, kind: "call", detail: `${turn.tool}(${turn.input})` });
    history.push({ role: "assistant", content: `${turn.tool} ${turn.input}` });

    const tool = registry.get(turn.tool);

    const verdict: Verdict = tool
      ? checkPermission(tool, turn.input, config.approve)
      : { ok: false, reason: "unknown tool" };

    if (!tool || !verdict.ok) {
      log.push({ step, kind: "blocked", detail: verdict.reason });
      history.push({ role: "tool", content: `blocked: ${verdict.reason}` });
      continue;
    }

    if (tool.permission === "ask") {
      log.push({ step, kind: "approved", detail: verdict.reason });
    }

    const result = tool.run(turn.input);

    log.push({ step, kind: "result", detail: result });
    history.push({ role: "tool", content: result });
  }

  log.push({
    step: config.maxSteps,
    kind: "stop",
    detail: "step budget reached",
  });

  return log;
}

function scriptedModel(script: ModelTurn[]): Model {
  let turn = 0;

  return () =>
    script[turn++] ?? { type: "finish", answer: "nothing left to do" };
}

const releaseModel = scriptedModel([
  { type: "tool", tool: "read_file", input: "CHANGELOG.md" },
  {
    type: "tool",
    tool: "write_file",
    input: "RELEASE.md::Fixed retry backoff. Added CSV export.",
  },
  { type: "tool", tool: "send_email", input: "team@example.com" },
  { type: "tool", tool: "delete_branch", input: "release/1.4.0" },
  { type: "finish", answer: "Release notes written and sent." },
]);

const stuckModel: Model = () => ({
  type: "tool",
  tool: "read_file",
  input: "CHANGELOG.md",
});

const approve: Approver = (tool, input) =>
  tool === "send_email" && input.endsWith("@example.com");

function print(title: string, log: HarnessEvent[]) {
  console.log(title);

  for (const event of log) {
    console.log(`  ${event.step}  ${event.kind.padEnd(9)}${event.detail}`);
  }

  console.log("");
}

print(
  "Run 1: release notes",
  runHarness("Write release notes for 1.4.0 and email the team.", {
    model: releaseModel,
    approve,
    maxSteps: 10,
    contextBudget: 200,
  }),
);

print(
  "Run 2: a model that never finishes",
  runHarness("Write release notes for 1.4.0 and email the team.", {
    model: stuckModel,
    approve,
    maxSteps: 4,
    contextBudget: 40,
  }),
);
