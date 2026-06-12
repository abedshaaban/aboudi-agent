// @ts-nocheck
import type {
  TrelloAddToStackInput,
  TrelloBulkMoveReadyToQueueResult,
  TrelloRemoveFromStackInput,
  TrelloListBoardsResult,
  TrelloBoardSummary,
  TrelloBoardCache,
  TrelloJobIdInput,
  TrelloMoveToQueueInput,
  TrelloQueueControlInput,
  TrelloQueueJob,
  TrelloQueueStatus,
  TrelloReorderStackInput,
  TrelloSettingsUpdateInput,
  TrelloSelectBoardInput,
  TrelloStackItem,
  TrelloStartQueueInput,
  TrelloSyncResult,
  TrelloTestConnectionResult,
  TrelloUpdateStackItemInput,
  TrelloWorkflowSnapshot,
} from "@t3tools/contracts";
import * as Context from "effect/Context";
import * as Crypto from "effect/Crypto";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Net from "node:net";
import * as PathNode from "node:path";
import { spawn } from "node:child_process";
import { promises as Fs } from "node:fs";

import * as DesktopEnvironment from "../app/DesktopEnvironment.ts";
import * as ElectronSafeStorage from "../electron/ElectronSafeStorage.ts";

const emptyPlan = {
  overview: "",
  implementationNotes: "",
  questions: "",
  risks: "",
  acceptanceCriteria: "",
  testInstructions: "",
  environmentNotes: "",
};

const emptyCache: TrelloBoardCache = {
  board: null,
  lists: [],
  cards: [],
  labels: [],
  members: [],
  syncedAt: null,
};

interface TrelloWorkflowDocument {
  readonly version: number;
  activeBoardId: string | null;
  readonly updatedAt: string | null;
  readonly encryptedApiKey?: string;
  readonly encryptedToken?: string;
  boards: TrelloBoardSummary[];
  boardCaches: Record<string, TrelloBoardCache>;
  readonly stackItems: TrelloStackItem[];
  readonly queue: TrelloQueueStatus;
}

export interface TrelloCredentials {
  readonly apiKey: string;
  readonly token: string;
}

export interface DesktopTrelloWorkflowShape {
  readonly getCredentials: () => Effect.Effect<TrelloCredentials>;
  readonly getSnapshot: () => Effect.Effect<TrelloWorkflowSnapshot>;
  readonly updateSettings: (
    input: TrelloSettingsUpdateInput,
  ) => Effect.Effect<TrelloWorkflowSnapshot>;
  readonly listBoards: () => Effect.Effect<TrelloListBoardsResult>;
  readonly selectBoard: (input: TrelloSelectBoardInput) => Effect.Effect<TrelloWorkflowSnapshot>;
  readonly testConnection: () => Effect.Effect<TrelloTestConnectionResult>;
  readonly syncBoard: (input: TrelloSelectBoardInput) => Effect.Effect<TrelloSyncResult>;
  readonly addToStack: (input: TrelloAddToStackInput) => Effect.Effect<TrelloStackItem>;
  readonly removeFromStack: (input: TrelloRemoveFromStackInput) => Effect.Effect<void>;
  readonly updateStackItem: (input: TrelloUpdateStackItemInput) => Effect.Effect<TrelloStackItem>;
  readonly moveToQueue: (input: TrelloMoveToQueueInput) => Effect.Effect<TrelloQueueJob>;
  readonly reorderStack: (
    input: TrelloReorderStackInput,
  ) => Effect.Effect<readonly TrelloStackItem[]>;
  readonly bulkMoveReadyToQueue: () => Effect.Effect<TrelloBulkMoveReadyToQueueResult>;
  readonly startQueue: (input: TrelloStartQueueInput) => Effect.Effect<TrelloQueueStatus>;
  readonly stopQueue: (input: TrelloQueueControlInput) => Effect.Effect<TrelloQueueStatus>;
  readonly pauseQueue: (input: TrelloQueueControlInput) => Effect.Effect<TrelloQueueStatus>;
  readonly retryJob: (input: TrelloJobIdInput) => Effect.Effect<TrelloQueueJob>;
  readonly removeJob: (input: TrelloJobIdInput) => Effect.Effect<void>;
  readonly cleanupJob: (input: TrelloJobIdInput) => Effect.Effect<TrelloQueueJob>;
}

export class DesktopTrelloWorkflow extends Context.Service<
  DesktopTrelloWorkflow,
  DesktopTrelloWorkflowShape
>()("@t3tools/desktop/trello/DesktopTrelloWorkflow") {}

const now = () => new Date().toISOString();
const clampParallelism = (value: number) => Math.min(4, Math.max(1, Math.trunc(value || 1)));

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

function createQueueJobFromStackItem(
  item: TrelloStackItem,
  document: TrelloWorkflowDocument,
): TrelloQueueJob {
  const existing = document.queue.jobs.find((job) => job.stackItemId === item.jobId);
  if (existing) return existing;
  const job = {
    jobId: item.jobId,
    stackItemId: item.jobId,
    cardId: item.cardId,
    cardSnapshot: item.cardSnapshot,
    plan: item.plan,
    state: "queued" as const,
    branchName: null,
    worktreePath: null,
    threadId: null,
    envAllocation: null,
    logs: [`Queued at ${now()}.`],
    errors: [],
    finalSummary: null,
    changedFiles: [],
    commandsRun: [],
    blockers: [],
    createdAt: now(),
    updatedAt: now(),
    startedAt: null,
    finishedAt: null,
  };
  item.state = "queued";
  item.updatedAt = now();
  document.queue.jobs.unshift(job);
  return job;
}

function reorderStackItems(
  stackItems: TrelloStackItem[],
  jobIds: readonly TrelloStackItem["jobId"][],
): TrelloStackItem[] {
  if (jobIds.length !== stackItems.length) {
    throw new Error("Stack reorder must include every stack item.");
  }
  const seen = new Set<TrelloStackItem["jobId"]>();
  for (const jobId of jobIds) {
    if (seen.has(jobId)) throw new Error("Stack reorder contains duplicate job ids.");
    seen.add(jobId);
  }
  const byId = new Map(stackItems.map((item) => [item.jobId, item]));
  for (const jobId of jobIds) {
    if (!byId.has(jobId)) throw new Error("Stack reorder contains unknown job id.");
  }
  return jobIds.map((jobId) => byId.get(jobId)!);
}

function defaultDocument(): TrelloWorkflowDocument {
  return {
    version: 2,
    activeBoardId: null,
    updatedAt: null,
    boards: [],
    boardCaches: {},
    stackItems: [],
    queue: { parallelism: 1, running: false, jobs: [] },
  };
}

async function exists(path: string) {
  try {
    await Fs.access(path);
    return true;
  } catch {
    return false;
  }
}

async function execGit(args: string[], cwd: string) {
  return await new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
    const child = spawn("git", args, { cwd, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(stderr.trim() || `git exited with ${code}`));
    });
  });
}

async function canListen(port: number) {
  return await new Promise<boolean>((resolve) => {
    const server = Net.createServer();
    server.once("error", () => resolve(false));
    server.once("listening", () => {
      server.close(() => resolve(true));
    });
    server.listen(port, "127.0.0.1");
  });
}

export const layer = Layer.effect(
  DesktopTrelloWorkflow,
  Effect.gen(function* () {
    const environment = yield* DesktopEnvironment.DesktopEnvironment;
    const safeStorage = yield* ElectronSafeStorage.ElectronSafeStorage;
    const crypto = yield* Crypto.Crypto;
    const documentPath = PathNode.join(environment.stateDir, "trello-workflow.json");
    const workspaceRoot = PathNode.join(environment.stateDir, "trello-worktrees");
    const envRoot = PathNode.join(environment.stateDir, "trello-env");

    const readDocument = async (): Promise<TrelloWorkflowDocument> => {
      if (!(await exists(documentPath))) return defaultDocument();
      try {
        const raw = await Fs.readFile(documentPath, "utf8");
        const parsed = JSON.parse(raw);
        const migratedBoardCache =
          parsed.cache?.board?.id && !parsed.boardCaches?.[parsed.cache.board.id]
            ? { [parsed.cache.board.id]: { ...emptyCache, ...parsed.cache } }
            : {};
        const migratedBoards =
          Array.isArray(parsed.boards) && parsed.boards.length > 0
            ? parsed.boards
            : parsed.cache?.board
              ? [
                  {
                    id: parsed.cache.board.id,
                    name: parsed.cache.board.name ?? "",
                    url: parsed.cache.board.url ?? "",
                    closed: false,
                  },
                ]
              : [];
        const activeBoardId =
          typeof parsed.activeBoardId === "string"
            ? parsed.activeBoardId
            : (parsed.cache?.board?.id ?? null);
        return {
          ...defaultDocument(),
          ...parsed,
          version: 2,
          activeBoardId,
          boards: migratedBoards,
          boardCaches: {
            ...migratedBoardCache,
            ...parsed.boardCaches,
          },
          queue: {
            parallelism: clampParallelism(parsed.queue?.parallelism ?? 1),
            running: false,
            jobs: (parsed.queue?.jobs ?? []).map((job: TrelloQueueJob) =>
              job.state === "running"
                ? {
                    ...job,
                    state: "needs_review",
                    updatedAt: now(),
                    logs: [
                      ...job.logs,
                      "Desktop app restarted while this job was running; marked for review.",
                    ],
                  }
                : job,
            ),
          },
        };
      } catch {
        return defaultDocument();
      }
    };

    const writeDocument = async (document: TrelloWorkflowDocument) => {
      await Fs.mkdir(PathNode.dirname(documentPath), { recursive: true });
      const suffix = (await Effect.runPromise(crypto.randomUUIDv4)).replaceAll("-", "");
      const tmpPath = `${documentPath}.${process.pid}.${suffix}.tmp`;
      await Fs.writeFile(tmpPath, `${JSON.stringify(document, null, 2)}\n`, "utf8");
      await Fs.rename(tmpPath, documentPath);
    };

    const encryptSecret = async (value: string) => {
      if (!value.trim()) return undefined;
      const available = await Effect.runPromise(safeStorage.isEncryptionAvailable);
      if (!available) return `plain:${Buffer.from(value, "utf8").toString("base64")}`;
      const encrypted = await Effect.runPromise(safeStorage.encryptString(value));
      return `safe:${Buffer.from(encrypted).toString("base64")}`;
    };

    const decryptSecret = async (stored: string | undefined) => {
      if (!stored) return "";
      if (stored.startsWith("plain:")) {
        return Buffer.from(stored.slice("plain:".length), "base64").toString("utf8");
      }
      if (!stored.startsWith("safe:")) return "";
      const bytes = Uint8Array.from(Buffer.from(stored.slice("safe:".length), "base64"));
      return await Effect.runPromise(safeStorage.decryptString(bytes));
    };

    const activeCacheFromDocument = (document: TrelloWorkflowDocument): TrelloBoardCache =>
      document.activeBoardId
        ? (document.boardCaches[document.activeBoardId] ?? emptyCache)
        : emptyCache;

    const snapshotFromDocument = (document: TrelloWorkflowDocument): TrelloWorkflowSnapshot => ({
      settings: {
        hasApiKey: Boolean(document.encryptedApiKey),
        hasToken: Boolean(document.encryptedToken),
        updatedAt: document.updatedAt,
      },
      boards: document.boards,
      activeBoardId: document.activeBoardId,
      cache: activeCacheFromDocument(document),
      stackItems: document.stackItems,
      queue: document.queue,
    });

    const trelloFetch = async (path: string, document: TrelloWorkflowDocument) => {
      const key = await decryptSecret(document.encryptedApiKey);
      const token = await decryptSecret(document.encryptedToken);
      if (!key || !token) throw new Error("Configure a Trello API key and token first.");
      const separator = path.includes("?") ? "&" : "?";
      const response = await fetch(
        `https://api.trello.com/1${path}${separator}key=${encodeURIComponent(key)}&token=${encodeURIComponent(token)}`,
      );
      if (!response.ok) {
        const endpoint = path.split("?")[0] ?? path;
        if (response.status === 401 || response.status === 403) {
          throw new Error(`Trello rejected the saved API key or token while fetching ${endpoint}.`);
        }
        if (response.status === 404) throw new Error(`Trello resource was not found: ${endpoint}.`);
        if (response.status === 429) throw new Error("Trello rate limit reached.");
        throw new Error(
          `Trello request failed with HTTP ${response.status} while fetching ${endpoint}.`,
        );
      }
      return response.json();
    };

    const persist = (mutate: (document: TrelloWorkflowDocument) => Promise<unknown>) =>
      Effect.tryPromise({
        try: async () => {
          const document = await readDocument();
          const result = await mutate(document);
          await writeDocument(document);
          return result;
        },
        catch: (cause) => (cause instanceof Error ? cause : new Error(String(cause))),
      });

    const refreshBoards = async (document: TrelloWorkflowDocument) => {
      const boards = await trelloFetch(
        "/members/me/boards?fields=name,url,closed&filter=open",
        document,
      );
      document.boards = boards.map((board) => ({
        id: board.id,
        name: board.name ?? "",
        url: board.url ?? "",
        closed: Boolean(board.closed),
      }));
      if (
        document.activeBoardId &&
        !document.boards.some((board) => board.id === document.activeBoardId)
      ) {
        document.activeBoardId = document.boards[0]?.id ?? null;
      }
      if (!document.activeBoardId) document.activeBoardId = document.boards[0]?.id ?? null;
      return { boards: document.boards } satisfies TrelloListBoardsResult;
    };

    const allocateEnv = async (document: TrelloWorkflowDocument, job: TrelloQueueJob) => {
      const usedPorts = new Set(
        document.queue.jobs.flatMap((existing) =>
          existing.envAllocation && existing.jobId !== job.jobId
            ? [existing.envAllocation.appPort, existing.envAllocation.apiPort]
            : [],
        ),
      );
      for (let index = 0; index < 4; index += 1) {
        const appPort = 3001 + index;
        const apiPort = 4001 + index;
        if (usedPorts.has(appPort) || usedPorts.has(apiPort)) continue;
        if (!(await canListen(appPort)) || !(await canListen(apiPort))) continue;
        const safeId = job.jobId.replace(/[^a-zA-Z0-9_-]/g, "_");
        const databaseName = `trello_${safeId}`;
        const envFilePath = PathNode.join(envRoot, `${safeId}.env`);
        const worktreePath =
          job.worktreePath ??
          PathNode.join(workspaceRoot, `${safeId}-${slugify(job.cardSnapshot.name)}`);
        const allocation = {
          appPort,
          apiPort,
          databaseName,
          databaseUrl: `file:${PathNode.join(envRoot, `${safeId}.sqlite`)}`,
          envFilePath,
          worktreePath,
          allocatedAt: now(),
        };
        await Fs.mkdir(envRoot, { recursive: true });
        await Fs.writeFile(
          envFilePath,
          [
            `PORT=${appPort}`,
            `VITE_PORT=${appPort}`,
            `APP_PORT=${appPort}`,
            `API_PORT=${apiPort}`,
            `DATABASE_URL=${allocation.databaseUrl}`,
            `TRELLO_JOB_ID=${job.jobId}`,
            `TRELLO_CARD_ID=${job.cardId}`,
            "",
          ].join("\n"),
          "utf8",
        );
        return allocation;
      }
      throw new Error("No free Trello job environment slot is available.");
    };

    const buildPrompt = (job: TrelloQueueJob) => {
      const checklistText = job.cardSnapshot.checklists
        .map(
          (checklist) =>
            `Checklist: ${checklist.name}\n${checklist.items.map((item) => `- [${item.state === "complete" ? "x" : " "}] ${item.name}`).join("\n")}`,
        )
        .join("\n\n");
      const comments = job.cardSnapshot.comments
        .map(
          (comment) =>
            `${comment.memberCreatorName ?? "Trello"} (${comment.date}):\n${comment.text}`,
        )
        .join("\n\n");
      const attachments = job.cardSnapshot.attachments
        .map((attachment) => `- ${attachment.name}: ${attachment.url}`)
        .join("\n");
      return [
        "You are running as one isolated Trello workflow job inside the desktop app.",
        `Work only inside this assigned worktree: ${job.worktreePath}`,
        `Branch: ${job.branchName}`,
        job.envAllocation
          ? `Use env file ${job.envAllocation.envFilePath}, app port ${job.envAllocation.appPort}, API port ${job.envAllocation.apiPort}, database ${job.envAllocation.databaseUrl}.`
          : "",
        "Do not touch unrelated files outside the assigned worktree. Run relevant checks/tests. Report blockers instead of guessing.",
        "",
        `Trello card: ${job.cardSnapshot.name}`,
        `URL: ${job.cardSnapshot.url}`,
        "",
        "Description:",
        job.cardSnapshot.desc || "(none)",
        "",
        "Comments:",
        comments || "(none)",
        "",
        "Checklists:",
        checklistText || "(none)",
        "",
        "Attachments:",
        attachments || "(none)",
        "",
        "Implementation guidance:",
        `Overview:\n${job.plan.overview}`,
        `Implementation notes:\n${job.plan.implementationNotes}`,
        `Questions:\n${job.plan.questions}`,
        `Risks:\n${job.plan.risks}`,
        `Acceptance criteria:\n${job.plan.acceptanceCriteria}`,
        `Test instructions:\n${job.plan.testInstructions}`,
        `Environment notes:\n${job.plan.environmentNotes}`,
        "",
        "When finished, summarize changed files, commands run, final result, and any blockers/questions.",
      ]
        .filter(Boolean)
        .join("\n");
    };

    const runJob = async (jobId: string) => {
      const document = await readDocument();
      const job = document.queue.jobs.find((item) => item.jobId === jobId);
      if (!job || !job.worktreePath) return;
      const promptPath = PathNode.join(
        envRoot,
        `${jobId.replace(/[^a-zA-Z0-9_-]/g, "_")}.prompt.md`,
      );
      await Fs.writeFile(promptPath, buildPrompt(job), "utf8");
      job.logs.push(`Prompt written to ${promptPath}`);
      await writeDocument(document);

      const command = process.env.T3_TRELLO_AGENT_COMMAND || "codex";
      const args = process.env.T3_TRELLO_AGENT_ARGS
        ? process.env.T3_TRELLO_AGENT_ARGS.split(" ").filter(Boolean)
        : ["exec", buildPrompt(job)];
      const child = spawn(command, args, {
        cwd: job.worktreePath,
        env: {
          ...process.env,
          ...(job.envAllocation
            ? {
                PORT: String(job.envAllocation.appPort),
                VITE_PORT: String(job.envAllocation.appPort),
                APP_PORT: String(job.envAllocation.appPort),
                API_PORT: String(job.envAllocation.apiPort),
                DATABASE_URL: job.envAllocation.databaseUrl,
                TRELLO_JOB_ENV_FILE: job.envAllocation.envFilePath,
              }
            : {}),
        },
      });

      const append = async (field: "logs" | "errors", text: string) => {
        const latest = await readDocument();
        const latestJob = latest.queue.jobs.find((item) => item.jobId === jobId);
        if (!latestJob) return;
        latestJob[field].push(text.trimEnd());
        latestJob.updatedAt = now();
        await writeDocument(latest);
      };

      child.stdout.on("data", (chunk) => void append("logs", String(chunk)));
      child.stderr.on("data", (chunk) => void append("errors", String(chunk)));
      child.on("error", (error) => void append("errors", error.message));
      child.on("close", async (code) => {
        const latest = await readDocument();
        const latestJob = latest.queue.jobs.find((item) => item.jobId === jobId);
        if (!latestJob) return;
        latestJob.state = code === 0 ? "needs_review" : "failed";
        latestJob.finishedAt = now();
        latestJob.updatedAt = now();
        latestJob.logs.push(`Agent process exited with code ${code}.`);
        await writeDocument(latest);
      });
    };

    const startOneJob = async (
      document: TrelloWorkflowDocument,
      job: TrelloQueueJob,
      input: TrelloStartQueueInput,
    ) => {
      const branchName = `trello/${job.cardId}-${slugify(job.cardSnapshot.name)}`;
      if (
        document.queue.jobs.some(
          (other) =>
            other.jobId !== job.jobId &&
            other.branchName === branchName &&
            !["failed", "completed", "cleaned_up"].includes(other.state),
        )
      ) {
        throw new Error(`Branch ${branchName} is already assigned to another active Trello job.`);
      }
      const allocation = await allocateEnv(document, { ...job, branchName });
      const worktreePath = allocation.worktreePath;
      await Fs.mkdir(PathNode.dirname(worktreePath), { recursive: true });
      if (await exists(worktreePath)) {
        const status = await execGit(
          ["-C", worktreePath, "status", "--porcelain"],
          input.projectCwd,
        );
        if (status.stdout.trim())
          throw new Error(`Refusing to reuse dirty worktree ${worktreePath}.`);
      } else {
        await execGit(
          ["worktree", "add", "-b", branchName, worktreePath, input.baseBranch],
          input.projectCwd,
        );
      }
      job.branchName = branchName;
      job.worktreePath = worktreePath;
      job.envAllocation = allocation;
      job.state = "running";
      job.startedAt = now();
      job.updatedAt = now();
      job.logs.push(`Created worktree ${worktreePath} on ${branchName}.`);
      void runJob(job.jobId);
    };

    return DesktopTrelloWorkflow.of({
      getCredentials: () =>
        Effect.tryPromise({
          try: async () => {
            const document = await readDocument();
            return {
              apiKey: await decryptSecret(document.encryptedApiKey),
              token: await decryptSecret(document.encryptedToken),
            };
          },
          catch: (cause) => (cause instanceof Error ? cause : new Error(String(cause))),
        }),
      getSnapshot: () =>
        Effect.tryPromise({
          try: async () => snapshotFromDocument(await readDocument()),
          catch: (cause) => cause,
        }),
      updateSettings: (input) =>
        persist(async (document) => {
          if (input.apiKey !== undefined && input.apiKey.trim()) {
            document.encryptedApiKey = await encryptSecret(input.apiKey.trim());
          }
          if (input.token !== undefined && input.token.trim()) {
            document.encryptedToken = await encryptSecret(input.token.trim());
          }
          const key = await decryptSecret(document.encryptedApiKey);
          const token = await decryptSecret(document.encryptedToken);
          if (key && token) await refreshBoards(document);
          document.updatedAt = now();
          return snapshotFromDocument(document);
        }),
      listBoards: () =>
        persist(async (document) => refreshBoards(document)).pipe(
          Effect.map((result) => result as TrelloListBoardsResult),
        ),
      selectBoard: (input) =>
        persist(async (document) => {
          if (!document.boards.some((board) => board.id === input.boardId)) {
            await refreshBoards(document);
          }
          if (!document.boards.some((board) => board.id === input.boardId)) {
            throw new Error("Trello board is not available for the saved credentials.");
          }
          document.activeBoardId = input.boardId;
          document.updatedAt = now();
          return snapshotFromDocument(document);
        }),
      testConnection: () =>
        Effect.tryPromise({
          try: async () => {
            const document = await readDocument();
            const member = await trelloFetch("/members/me?fields=fullName,username", document);
            return {
              ok: true,
              message: `Connected to ${member.fullName || member.username || "Trello"}.`,
            };
          },
          catch: (cause) => ({
            ok: false,
            message: cause instanceof Error ? cause.message : String(cause),
          }),
        }),
      syncBoard: (input) =>
        persist(async (document) => {
          const boardId = input.boardId;
          if (!document.boards.some((board) => board.id === boardId)) {
            await refreshBoards(document);
          }
          if (!document.boards.some((board) => board.id === boardId)) {
            throw new Error("Trello board is not available for the saved credentials.");
          }
          const board = await trelloFetch(
            `/boards/${encodeURIComponent(boardId)}?fields=name,url,desc`,
            document,
          );
          const [lists, cards, labels, members] = await Promise.all([
            trelloFetch(
              `/boards/${encodeURIComponent(boardId)}/lists?fields=name,closed,pos`,
              document,
            ),
            trelloFetch(
              `/boards/${encodeURIComponent(boardId)}/cards?fields=name,desc,url,closed,idList,idMembers,idLabels,dateLastActivity&labels=all&attachments=true&checklists=all`,
              document,
            ),
            trelloFetch(
              `/boards/${encodeURIComponent(boardId)}/labels?fields=name,color`,
              document,
            ),
            trelloFetch(
              `/boards/${encodeURIComponent(boardId)}/members?fields=fullName,username,avatarUrl`,
              document,
            ),
          ]);
          const commentsByCardId = new Map<string, unknown[]>();
          await Promise.all(
            cards.map(async (card) => {
              try {
                const actions = await trelloFetch(
                  `/cards/${encodeURIComponent(card.id)}/actions?filter=commentCard&limit=1000`,
                  document,
                );
                commentsByCardId.set(card.id, Array.isArray(actions) ? actions : []);
              } catch {
                commentsByCardId.set(card.id, []);
              }
            }),
          );
          const normalizedLabels = labels.map((label) => ({
            id: label.id,
            name: label.name ?? "",
            color: label.color ?? null,
          }));
          const labelById = new Map(normalizedLabels.map((label) => [label.id, label]));
          document.boardCaches[boardId] = {
            board: {
              id: board.id,
              name: board.name ?? "",
              url: board.url ?? "",
              desc: board.desc ?? "",
            },
            lists: lists.map((list) => ({
              id: list.id,
              name: list.name ?? "",
              closed: Boolean(list.closed),
              pos: Number(list.pos ?? 0),
            })),
            labels: normalizedLabels,
            members: members.map((member) => ({
              id: member.id,
              fullName: member.fullName ?? "",
              username: member.username ?? "",
              avatarUrl: member.avatarUrl ?? null,
            })),
            cards: cards.map((card) => ({
              id: card.id,
              idList: card.idList,
              name: card.name ?? "",
              desc: card.desc ?? "",
              url: card.url ?? "",
              closed: Boolean(card.closed),
              labels: [
                ...(card.labels ?? []).map((label) => ({
                  id: label.id,
                  name: label.name ?? "",
                  color: label.color ?? null,
                })),
                ...(card.idLabels ?? [])
                  .map((id) => labelById.get(id))
                  .filter((label) => label !== undefined),
              ].filter(
                (label, index, allLabels) =>
                  allLabels.findIndex((candidate) => candidate.id === label.id) === index,
              ),
              idMembers: card.idMembers ?? [],
              comments: (commentsByCardId.get(card.id) ?? [])
                .filter((action) => action.type === "commentCard" && action.data?.text)
                .map((action) => ({
                  id: action.id,
                  text: action.data.text,
                  date: action.date,
                  memberCreatorId: action.idMemberCreator ?? null,
                  memberCreatorName: action.memberCreator?.fullName ?? null,
                })),
              attachments: (card.attachments ?? []).map((attachment) => ({
                id: attachment.id,
                name: attachment.name ?? "",
                url: attachment.url ?? "",
                mimeType: attachment.mimeType ?? null,
                bytes: typeof attachment.bytes === "number" ? attachment.bytes : null,
                date: attachment.date ?? null,
              })),
              checklists: (card.checklists ?? []).map((checklist) => ({
                id: checklist.id,
                name: checklist.name ?? "",
                items: (checklist.checkItems ?? []).map((item) => ({
                  id: item.id,
                  name: item.name ?? "",
                  state: item.state === "complete" ? "complete" : "incomplete",
                })),
              })),
              dateLastActivity: card.dateLastActivity ?? null,
            })),
            syncedAt: now(),
          };
          document.activeBoardId = boardId;
          document.updatedAt = now();
          const cache = document.boardCaches[boardId];
          return {
            boardId,
            syncedAt: cache.syncedAt,
            cardCount: cache.cards.length,
            listCount: cache.lists.length,
          } satisfies TrelloSyncResult;
        }),
      addToStack: (input) =>
        persist(async (document) => {
          const cache = activeCacheFromDocument(document);
          const card = cache.cards.find((candidate) => candidate.id === input.cardId);
          if (!card)
            throw new Error("Trello card is not in the local cache. Sync the board first.");
          const existing = document.stackItems.find((item) => item.cardId === input.cardId);
          if (existing) return existing;
          const jobId = `trello-${input.cardId}-${Date.now()}`;
          const item = {
            jobId,
            cardId: card.id,
            cardSnapshot: card,
            plan: emptyPlan,
            state: "planning",
            createdAt: now(),
            updatedAt: now(),
          };
          document.stackItems.unshift(item);
          return item;
        }),
      removeFromStack: (input) =>
        persist(async (document) => {
          const index = document.stackItems.findIndex((item) => item.cardId === input.cardId);
          if (index === -1) throw new Error("Stack item not found.");
          document.stackItems.splice(index, 1);
        }),
      updateStackItem: (input) =>
        persist(async (document) => {
          const item = document.stackItems.find((candidate) => candidate.jobId === input.jobId);
          if (!item) throw new Error("Stack item not found.");
          item.plan = input.plan;
          item.state = input.state ?? item.state;
          item.updatedAt = now();
          return item;
        }),
      moveToQueue: (input) =>
        persist(async (document) => {
          const item = document.stackItems.find((candidate) => candidate.jobId === input.jobId);
          if (!item) throw new Error("Stack item not found.");
          return createQueueJobFromStackItem(item, document);
        }),
      reorderStack: (input) =>
        persist(async (document) => {
          document.stackItems = reorderStackItems(document.stackItems, input.jobIds);
          return document.stackItems;
        }),
      bulkMoveReadyToQueue: () =>
        persist(async (document) => {
          const readyItems = document.stackItems.filter((item) => item.state === "ready_for_queue");
          for (const item of [...readyItems].toReversed()) {
            createQueueJobFromStackItem(item, document);
          }
          return { movedCount: readyItems.length } satisfies TrelloBulkMoveReadyToQueueResult;
        }),
      startQueue: (input) =>
        persist(async (document) => {
          document.queue.parallelism = clampParallelism(input.parallelism);
          document.queue.running = true;
          const runningCount = document.queue.jobs.filter((job) => job.state === "running").length;
          const available = Math.max(0, document.queue.parallelism - runningCount);
          const queued = document.queue.jobs
            .filter((job) => job.state === "queued")
            .slice(0, available);
          for (const job of queued) await startOneJob(document, job, input);
          return document.queue;
        }),
      stopQueue: (input) =>
        persist(async (document) => {
          document.queue.parallelism = clampParallelism(input.parallelism);
          document.queue.running = false;
          return document.queue;
        }),
      pauseQueue: (input) =>
        persist(async (document) => {
          document.queue.parallelism = clampParallelism(input.parallelism);
          document.queue.running = false;
          return document.queue;
        }),
      retryJob: (input) =>
        persist(async (document) => {
          const job = document.queue.jobs.find((candidate) => candidate.jobId === input.jobId);
          if (!job) throw new Error("Job not found.");
          job.state = "queued";
          job.errors = [];
          job.finishedAt = null;
          job.updatedAt = now();
          job.logs.push(`Retry queued at ${now()}.`);
          return job;
        }),
      removeJob: (input) =>
        persist(async (document) => {
          document.queue.jobs = document.queue.jobs.filter((job) => job.jobId !== input.jobId);
        }).pipe(Effect.asVoid),
      cleanupJob: (input) =>
        persist(async (document) => {
          const job = document.queue.jobs.find((candidate) => candidate.jobId === input.jobId);
          if (!job) throw new Error("Job not found.");
          if (!job.worktreePath) return job;
          const status = await execGit(
            ["-C", job.worktreePath, "status", "--porcelain"],
            environment.rootDir,
          );
          if (status.stdout.trim()) {
            throw new Error("Refusing to clean up a worktree with uncommitted changes.");
          }
          await execGit(
            ["worktree", "remove", job.worktreePath],
            PathNode.dirname(job.worktreePath),
          );
          job.state = "cleaned_up";
          job.updatedAt = now();
          job.logs.push(`Cleaned up worktree at ${now()}.`);
          return job;
        }),
    });
  }),
);
