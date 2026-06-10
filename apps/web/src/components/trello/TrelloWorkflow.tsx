import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  CheckCircle2Icon,
  ClipboardListIcon,
  Loader2Icon,
  MessageSquareIcon,
  PaperclipIcon,
  PlayIcon,
  RefreshCwIcon,
  RotateCcwIcon,
  SettingsIcon,
  SquareIcon,
  Trash2Icon,
} from "lucide-react";
import type {
  ProjectId,
  TrelloBoardSummary,
  TrelloCard,
  TrelloImplementationPlan,
  TrelloQueueJob,
  TrelloWorkflowJobId,
  TrelloWorkflowSnapshot,
} from "@t3tools/contracts";

import { ensureLocalApi } from "../../localApi";
import { selectProjectsAcrossEnvironments, useStore } from "../../store";
import { useSettings } from "../../hooks/useSettings";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { SidebarInset, SidebarTrigger } from "../ui/sidebar";
import { Textarea } from "../ui/textarea";
import { toastManager } from "../ui/toast";

type TrelloSection = "board" | "stack" | "queue" | "runs" | "settings";

interface TrelloWorkflowProps {
  readonly section: TrelloSection;
}

const emptyPlan: TrelloImplementationPlan = {
  overview: "",
  implementationNotes: "",
  questions: "",
  risks: "",
  acceptanceCriteria: "",
  testInstructions: "",
  environmentNotes: "",
};

function getClient() {
  return ensureLocalApi().trello;
}

function useTrelloSnapshot() {
  const [snapshot, setSnapshot] = useState<TrelloWorkflowSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setSnapshot(await getClient().getSnapshot());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Failed to load Trello workflow.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { snapshot, loading, error, reload, setSnapshot };
}

function notifyError(title: string, cause: unknown) {
  toastManager.add({
    type: "error",
    title,
    description: cause instanceof Error ? cause.message : "An error occurred.",
  });
}

function checklistProgress(card: TrelloCard) {
  const items = card.checklists.flatMap((checklist) => checklist.items);
  const complete = items.filter((item) => item.state === "complete").length;
  return { complete, total: items.length };
}

function Header({
  title,
  onRefresh,
  loading,
}: {
  title: string;
  onRefresh: () => void;
  loading: boolean;
}) {
  return (
    <header className="flex h-[52px] shrink-0 items-center gap-2 border-b border-border px-3 sm:px-5">
      <SidebarTrigger className="size-7 shrink-0 md:hidden" />
      <span className="text-sm font-medium text-foreground">{title}</span>
      <Button
        size="xs"
        variant="outline"
        className="ml-auto"
        onClick={onRefresh}
        disabled={loading}
      >
        {loading ? (
          <Loader2Icon className="size-3.5 animate-spin" />
        ) : (
          <RefreshCwIcon className="size-3.5" />
        )}
        Refresh
      </Button>
    </header>
  );
}

export function TrelloWorkflow({ section }: TrelloWorkflowProps) {
  const { snapshot, loading, error, reload, setSnapshot } = useTrelloSnapshot();
  const title =
    section === "board"
      ? "Trello Board"
      : section === "stack"
        ? "Stack / Planning"
        : section === "queue"
          ? "Queue"
          : section === "runs"
            ? "Job Review / Runs"
            : "Trello Settings";

  return (
    <SidebarInset className="h-dvh min-h-0 overflow-hidden bg-background text-foreground">
      <div className="flex min-h-0 flex-1 flex-col">
        <Header title={title} onRefresh={reload} loading={loading} />
        <main className="min-h-0 flex-1 overflow-auto">
          {error ? (
            <div className="m-4 rounded-lg border border-destructive/30 bg-destructive/8 p-3 text-sm text-destructive">
              {error}
            </div>
          ) : null}
          {!snapshot && loading ? (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              <Loader2Icon className="mr-2 size-4 animate-spin" />
              Loading
            </div>
          ) : snapshot ? (
            <Section
              section={section}
              snapshot={snapshot}
              reload={reload}
              setSnapshot={setSnapshot}
            />
          ) : null}
        </main>
      </div>
    </SidebarInset>
  );
}

function Section({
  section,
  snapshot,
  reload,
  setSnapshot,
}: {
  readonly section: TrelloSection;
  readonly snapshot: TrelloWorkflowSnapshot;
  readonly reload: () => Promise<void>;
  readonly setSnapshot: (snapshot: TrelloWorkflowSnapshot) => void;
}) {
  if (section === "settings") return <SettingsPanel snapshot={snapshot} reload={reload} />;
  if (section === "stack") return <StackPanel snapshot={snapshot} reload={reload} />;
  if (section === "queue")
    return <QueuePanel snapshot={snapshot} reload={reload} setSnapshot={setSnapshot} />;
  if (section === "runs") return <RunsPanel snapshot={snapshot} reload={reload} />;
  return <BoardPanel snapshot={snapshot} reload={reload} />;
}

function SettingsPanel({
  snapshot,
  reload,
}: {
  readonly snapshot: TrelloWorkflowSnapshot;
  readonly reload: () => Promise<void>;
}) {
  const [apiKey, setApiKey] = useState("");
  const [token, setToken] = useState("");
  const [boardRef, setBoardRef] = useState(snapshot.settings.boardRef);
  const [boards, setBoards] = useState<readonly TrelloBoardSummary[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  const persistPendingSettings = async () => {
    if (apiKey.trim() || token.trim() || boardRef !== snapshot.settings.boardRef) {
      await getClient().updateSettings({ apiKey, token, boardRef });
      setApiKey("");
      setToken("");
    }
  };

  const save = async () => {
    setBusy("save");
    try {
      await getClient().updateSettings({ apiKey, token, boardRef });
      toastManager.add({ type: "success", title: "Trello settings saved" });
      setApiKey("");
      setToken("");
      await reload();
    } catch (cause) {
      notifyError("Failed to save Trello settings", cause);
    } finally {
      setBusy(null);
    }
  };

  const test = async () => {
    setBusy("test");
    try {
      await persistPendingSettings();
      const result = await getClient().testConnection();
      toastManager.add({ type: result.ok ? "success" : "error", title: result.message });
      await reload();
    } catch (cause) {
      notifyError("Trello connection failed", cause);
    } finally {
      setBusy(null);
    }
  };

  const loadBoards = async () => {
    setBusy("boards");
    try {
      await persistPendingSettings();
      const result = await getClient().listBoards();
      setBoards(result.boards);
      toastManager.add({
        type: "success",
        title: result.boards.length === 0 ? "No open Trello boards found" : "Trello boards loaded",
      });
      await reload();
    } catch (cause) {
      notifyError("Failed to load Trello boards", cause);
    } finally {
      setBusy(null);
    }
  };

  const sync = async () => {
    setBusy("sync");
    try {
      await persistPendingSettings();
      const result = await getClient().syncBoard();
      toastManager.add({
        type: "success",
        title: "Trello board synced",
        description: `${result.cardCount} cards across ${result.listCount} lists`,
      });
      await reload();
    } catch (cause) {
      notifyError("Trello sync failed", cause);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-5 p-4 sm:p-6">
      <section className="space-y-4">
        <div>
          <h2 className="text-sm font-semibold">Connection</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            API key stored: {snapshot.settings.hasApiKey ? "yes" : "no"} · token stored:{" "}
            {snapshot.settings.hasToken ? "yes" : "no"}
          </p>
        </div>
        <label className="block space-y-1.5">
          <span className="text-xs font-medium text-muted-foreground">API key</span>
          <Input
            value={apiKey}
            onChange={(event) => setApiKey(event.target.value)}
            type="password"
            placeholder={snapshot.settings.hasApiKey ? "Stored locally" : ""}
          />
        </label>
        <label className="block space-y-1.5">
          <span className="text-xs font-medium text-muted-foreground">Token</span>
          <Input
            value={token}
            onChange={(event) => setToken(event.target.value)}
            type="password"
            placeholder={snapshot.settings.hasToken ? "Stored locally" : ""}
          />
        </label>
        <div className="space-y-2">
          <div className="flex flex-wrap items-end gap-2">
            <label className="min-w-64 flex-1 space-y-1.5">
              <span className="text-xs font-medium text-muted-foreground">Choose board</span>
              <select
                className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                value={boards.some((board) => board.id === boardRef) ? boardRef : ""}
                onChange={(event) => {
                  const selected = boards.find((board) => board.id === event.target.value);
                  if (selected) setBoardRef(selected.id);
                }}
                disabled={boards.length === 0}
              >
                <option value="">
                  {boards.length === 0 ? "Load boards from Trello" : "Select a board"}
                </option>
                {boards.map((board) => (
                  <option key={board.id} value={board.id}>
                    {board.name}
                  </option>
                ))}
              </select>
            </label>
            <Button size="sm" variant="outline" onClick={loadBoards} disabled={busy !== null}>
              {busy === "boards" ? (
                <Loader2Icon className="size-4 animate-spin" />
              ) : (
                <RefreshCwIcon className="size-4" />
              )}
              Load boards
            </Button>
          </div>
          <label className="block space-y-1.5">
            <span className="text-xs font-medium text-muted-foreground">
              Board ID or URL fallback
            </span>
            <Input value={boardRef} onChange={(event) => setBoardRef(event.target.value)} />
          </label>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={save} disabled={busy !== null}>
            <SettingsIcon className="size-4" />
            Save
          </Button>
          <Button size="sm" variant="outline" onClick={test} disabled={busy !== null}>
            <CheckCircle2Icon className="size-4" />
            Test connection
          </Button>
          <Button size="sm" variant="outline" onClick={sync} disabled={busy !== null}>
            <RefreshCwIcon className="size-4" />
            Sync board
          </Button>
        </div>
      </section>
      <section className="rounded-lg border border-border/70 p-3 text-xs text-muted-foreground">
        Last sync: {snapshot.cache.syncedAt ?? "never"}
      </section>
    </div>
  );
}

function BoardPanel({
  snapshot,
  reload,
}: {
  readonly snapshot: TrelloWorkflowSnapshot;
  readonly reload: () => Promise<void>;
}) {
  const navigate = useNavigate();
  const [selectedCard, setSelectedCard] = useState<TrelloCard | null>(null);
  const [credentialIssue, setCredentialIssue] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const credentialsMissing = !snapshot.settings.hasApiKey || !snapshot.settings.hasToken;
  const cardsByList = useMemo(() => {
    const byList = new Map<string, TrelloCard[]>();
    for (const card of snapshot.cache.cards.filter((card) => !card.closed)) {
      byList.set(card.idList, [...(byList.get(card.idList) ?? []), card]);
    }
    return byList;
  }, [snapshot.cache.cards]);

  const addToStack = async (cardId: string) => {
    try {
      await getClient().addToStack({ cardId: cardId as TrelloCard["id"] });
      toastManager.add({ type: "success", title: "Added to Stack" });
      await reload();
    } catch (cause) {
      notifyError("Failed to add card to Stack", cause);
    }
  };

  const goToSettings = () => {
    void navigate({ to: "/trello-settings" });
  };

  const syncFromBoard = async () => {
    setSyncing(true);
    setCredentialIssue(null);
    try {
      const result = await getClient().syncBoard();
      toastManager.add({
        type: "success",
        title: "Trello board synced",
        description: `${result.cardCount} cards across ${result.listCount} lists`,
      });
      await reload();
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Trello sync failed.";
      setCredentialIssue(message);
      notifyError("Trello sync failed", cause);
    } finally {
      setSyncing(false);
    }
  };

  if (!snapshot.cache.board) {
    return (
      <TrelloBoardSetupPrompt
        title={credentialsMissing ? "Connect Trello to load your board" : "No Trello board cached"}
        message={
          credentialsMissing
            ? "Add your Trello API key and token in settings, then sync the board."
            : (credentialIssue ??
              "Sync your configured Trello board to cache lists, cards, comments, attachments, and checklists locally.")
        }
        primaryLabel={credentialsMissing || credentialIssue ? "Open Trello Settings" : "Sync board"}
        onPrimary={credentialsMissing || credentialIssue ? goToSettings : syncFromBoard}
        {...(credentialsMissing || credentialIssue
          ? {}
          : { secondaryLabel: "Open Trello Settings", onSecondary: goToSettings })}
        busy={syncing}
      />
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-b border-border/60 px-4 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold">{snapshot.cache.board.name}</h2>
            <p className="text-xs text-muted-foreground">
              Cached at {snapshot.cache.syncedAt ?? "never"}
            </p>
          </div>
          <Button
            size="xs"
            variant="outline"
            className="ml-auto"
            onClick={syncFromBoard}
            disabled={syncing}
          >
            {syncing ? (
              <Loader2Icon className="size-3.5 animate-spin" />
            ) : (
              <RefreshCwIcon className="size-3.5" />
            )}
            Sync board
          </Button>
        </div>
        {credentialsMissing || credentialIssue ? (
          <TrelloCredentialsCallout
            message={
              credentialIssue ??
              "Trello API key or token is missing. Cached board data can still be viewed, but syncing needs valid credentials."
            }
            onSettings={goToSettings}
          />
        ) : null}
      </div>
      <div className="flex min-h-0 flex-1 gap-3 overflow-x-auto p-3">
        {snapshot.cache.lists
          .filter((list) => !list.closed)
          .map((list) => (
            <section
              key={list.id}
              className="flex w-72 shrink-0 flex-col rounded-lg border border-border/70 bg-muted/20"
            >
              <div className="border-b border-border/60 px-3 py-2 text-xs font-semibold">
                {list.name}
              </div>
              <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-2">
                {(cardsByList.get(list.id) ?? []).map((card) => {
                  const progress = checklistProgress(card);
                  return (
                    <button
                      key={card.id}
                      className="rounded-md border border-border/70 bg-background p-2 text-left shadow-xs transition-colors hover:bg-accent"
                      onClick={() => setSelectedCard(card)}
                    >
                      <div className="line-clamp-2 text-xs font-medium">{card.name}</div>
                      <div className="mt-2 flex flex-wrap gap-1">
                        {card.labels.slice(0, 4).map((label) => (
                          <span
                            key={label.id}
                            className="rounded-sm bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground"
                          >
                            {label.name || label.color || "label"}
                          </span>
                        ))}
                      </div>
                      <div className="mt-2 flex items-center gap-3 text-[10px] text-muted-foreground">
                        {progress.total > 0 ? (
                          <span>
                            {progress.complete}/{progress.total}
                          </span>
                        ) : null}
                        {card.comments.length > 0 ? (
                          <span className="inline-flex items-center gap-1">
                            <MessageSquareIcon className="size-3" />
                            {card.comments.length}
                          </span>
                        ) : null}
                        {card.attachments.length > 0 ? (
                          <span className="inline-flex items-center gap-1">
                            <PaperclipIcon className="size-3" />
                            {card.attachments.length}
                          </span>
                        ) : null}
                      </div>
                    </button>
                  );
                })}
              </div>
            </section>
          ))}
      </div>
      {selectedCard ? (
        <CardDetail
          card={selectedCard}
          listName={
            snapshot.cache.lists.find((list) => list.id === selectedCard.idList)?.name ?? ""
          }
          members={snapshot.cache.members}
          onClose={() => setSelectedCard(null)}
          onAdd={() => addToStack(selectedCard.id)}
        />
      ) : null}
    </div>
  );
}

function CardDetail({
  card,
  listName,
  members,
  onClose,
  onAdd,
}: {
  readonly card: TrelloCard;
  readonly listName: string;
  readonly members: TrelloWorkflowSnapshot["cache"]["members"];
  readonly onClose: () => void;
  readonly onAdd: () => void;
}) {
  const cardMembers = members.filter((member) => card.idMembers.includes(member.id));
  return (
    <div className="fixed inset-y-0 right-0 z-40 flex w-full max-w-2xl flex-col border-l border-border bg-background shadow-xl">
      <div className="flex items-center gap-2 border-b border-border p-4">
        <div className="min-w-0">
          <h2 className="truncate text-sm font-semibold">{card.name}</h2>
          <p className="text-xs text-muted-foreground">{listName}</p>
        </div>
        <Button size="sm" className="ml-auto" onClick={onAdd}>
          Add to Stack
        </Button>
        <Button size="sm" variant="ghost" onClick={onClose}>
          Close
        </Button>
      </div>
      <div className="min-h-0 flex-1 space-y-5 overflow-auto p-4 text-sm">
        <MetaRow
          label="Labels"
          value={
            card.labels.map((label) => label.name || label.color || label.id).join(", ") || "None"
          }
        />
        <MetaRow
          label="Members"
          value={
            cardMembers.map((member) => member.fullName || member.username).join(", ") || "None"
          }
        />
        <DetailBlock title="Description">{card.desc || "No description."}</DetailBlock>
        <DetailBlock title="Comments">
          {card.comments.length === 0
            ? "No comments."
            : card.comments.map((comment) => (
                <div key={comment.id} className="mb-3 rounded-md border border-border/60 p-2">
                  <div className="text-xs font-medium">
                    {comment.memberCreatorName ?? "Trello"} ·{" "}
                    {new Date(comment.date).toLocaleString()}
                  </div>
                  <p className="mt-1 whitespace-pre-wrap text-sm text-foreground/85">
                    {comment.text}
                  </p>
                </div>
              ))}
        </DetailBlock>
        <DetailBlock title="Checklists">
          {card.checklists.length === 0
            ? "No checklists."
            : card.checklists.map((checklist) => (
                <div key={checklist.id} className="mb-3">
                  <div className="text-xs font-semibold">{checklist.name}</div>
                  {checklist.items.map((item) => (
                    <div key={item.id} className="mt-1 flex items-center gap-2 text-sm">
                      {item.state === "complete" ? (
                        <CheckCircle2Icon className="size-3.5 text-success" />
                      ) : (
                        <SquareIcon className="size-3.5 text-muted-foreground" />
                      )}
                      {item.name}
                    </div>
                  ))}
                </div>
              ))}
        </DetailBlock>
        <DetailBlock title="Attachments">
          {card.attachments.length === 0
            ? "No attachments."
            : card.attachments.map((attachment) => (
                <a
                  key={attachment.id}
                  href={attachment.url}
                  className="mb-2 block truncate text-sm text-primary underline"
                >
                  {attachment.name}
                </a>
              ))}
        </DetailBlock>
      </div>
    </div>
  );
}

function StackPanel({
  snapshot,
  reload,
}: {
  readonly snapshot: TrelloWorkflowSnapshot;
  readonly reload: () => Promise<void>;
}) {
  const [editing, setEditing] = useState<TrelloWorkflowJobId | null>(null);
  const active =
    snapshot.stackItems.find((item) => item.jobId === editing) ?? snapshot.stackItems[0] ?? null;
  const [plan, setPlan] = useState<TrelloImplementationPlan>(active?.plan ?? emptyPlan);

  useEffect(() => {
    setPlan(active?.plan ?? emptyPlan);
  }, [active?.jobId]);

  const save = async (moveToQueue: boolean) => {
    if (!active) return;
    try {
      await getClient().updateStackItem({ jobId: active.jobId, plan, state: "ready_for_queue" });
      if (moveToQueue) await getClient().moveToQueue({ jobId: active.jobId });
      toastManager.add({ type: "success", title: moveToQueue ? "Moved to Queue" : "Plan saved" });
      await reload();
    } catch (cause) {
      notifyError("Failed to update stack item", cause);
    }
  };

  if (snapshot.stackItems.length === 0) return <EmptyState text="No stacked Trello tickets yet." />;

  return (
    <div className="grid min-h-full grid-cols-1 md:grid-cols-[18rem_1fr]">
      <aside className="border-b border-border md:border-b-0 md:border-r">
        {snapshot.stackItems.map((item) => (
          <button
            key={item.jobId}
            className={`block w-full border-b border-border/60 px-3 py-2 text-left text-xs ${active?.jobId === item.jobId ? "bg-accent text-foreground" : "text-muted-foreground hover:bg-accent/60"}`}
            onClick={() => setEditing(item.jobId)}
          >
            <div className="truncate font-medium">{item.cardSnapshot.name}</div>
            <div className="mt-1">{item.state}</div>
          </button>
        ))}
      </aside>
      {active ? (
        <section className="space-y-4 p-4">
          <div>
            <h2 className="text-sm font-semibold">{active.cardSnapshot.name}</h2>
            <a className="text-xs text-primary underline" href={active.cardSnapshot.url}>
              Original Trello card
            </a>
          </div>
          <PlanEditor plan={plan} onChange={setPlan} />
          <div className="flex gap-2">
            <Button size="sm" onClick={() => save(false)}>
              Save plan
            </Button>
            <Button size="sm" variant="outline" onClick={() => save(true)}>
              Move to Queue
            </Button>
          </div>
        </section>
      ) : null}
    </div>
  );
}

function QueuePanel({
  snapshot,
  reload,
  setSnapshot,
}: {
  readonly snapshot: TrelloWorkflowSnapshot;
  readonly reload: () => Promise<void>;
  readonly setSnapshot: (snapshot: TrelloWorkflowSnapshot) => void;
}) {
  const [parallelism, setParallelism] = useState(String(snapshot.queue.parallelism || 1));
  const projects = useStore(selectProjectsAcrossEnvironments);
  const settings = useSettings();
  const [projectId, setProjectId] = useState<ProjectId | "">(projects[0]?.id ?? "");
  const selectedProject = projects.find((project) => project.id === projectId);

  const start = async () => {
    if (!selectedProject) {
      toastManager.add({ type: "error", title: "Select a project first" });
      return;
    }
    try {
      const queue = await getClient().startQueue({
        parallelism: Math.min(4, Math.max(1, Number(parallelism) || 1)),
        projectId: selectedProject.id,
        projectCwd: selectedProject.cwd,
        baseBranch: "main",
        modelSelection: settings.textGenerationModelSelection,
      });
      setSnapshot({ ...snapshot, queue });
      toastManager.add({ type: "success", title: "Queue started" });
      await reload();
    } catch (cause) {
      notifyError("Failed to start queue", cause);
    }
  };

  const stop = async () => {
    try {
      await getClient().stopQueue({
        parallelism: Math.min(4, Math.max(1, Number(parallelism) || 1)),
      });
      await reload();
    } catch (cause) {
      notifyError("Failed to stop queue", cause);
    }
  };

  const groups = groupJobs(snapshot.queue.jobs);

  return (
    <div className="space-y-5 p-4">
      <section className="flex flex-wrap items-end gap-3">
        <label className="space-y-1">
          <span className="block text-xs font-medium text-muted-foreground">Parallelism</span>
          <select
            className="h-8 rounded-md border border-input bg-background px-2 text-sm"
            value={parallelism}
            onChange={(event) => setParallelism(event.target.value)}
          >
            {[1, 2, 3, 4].map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </label>
        <label className="min-w-72 space-y-1">
          <span className="block text-xs font-medium text-muted-foreground">Project</span>
          <select
            className="h-8 w-full rounded-md border border-input bg-background px-2 text-sm"
            value={projectId}
            onChange={(event) => setProjectId(event.target.value as ProjectId)}
          >
            {projects.map((project) => (
              <option key={`${project.environmentId}:${project.id}`} value={project.id}>
                {project.name}
              </option>
            ))}
          </select>
        </label>
        <Button size="sm" onClick={start}>
          <PlayIcon className="size-4" />
          Start queue
        </Button>
        <Button size="sm" variant="outline" onClick={stop}>
          Stop queue
        </Button>
      </section>
      <div className="grid gap-4 lg:grid-cols-2">
        {Object.entries(groups).map(([state, jobs]) => (
          <section key={state} className="rounded-lg border border-border/70">
            <div className="border-b border-border/60 px-3 py-2 text-xs font-semibold capitalize">
              {state.replaceAll("_", " ")} ({jobs.length})
            </div>
            <div className="divide-y divide-border/60">
              {jobs.length === 0 ? (
                <div className="p-3 text-xs text-muted-foreground">None</div>
              ) : (
                jobs.map((job) => <JobRow key={job.jobId} job={job} reload={reload} compact />)
              )}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

function RunsPanel({
  snapshot,
  reload,
}: {
  readonly snapshot: TrelloWorkflowSnapshot;
  readonly reload: () => Promise<void>;
}) {
  if (snapshot.queue.jobs.length === 0) return <EmptyState text="No Trello job runs yet." />;
  return (
    <div className="divide-y divide-border/70">
      {snapshot.queue.jobs.map((job) => (
        <JobRow key={job.jobId} job={job} reload={reload} />
      ))}
    </div>
  );
}

function JobRow({
  job,
  reload,
  compact = false,
}: {
  readonly job: TrelloQueueJob;
  readonly reload: () => Promise<void>;
  readonly compact?: boolean;
}) {
  const retry = async () => {
    try {
      await getClient().retryJob({ jobId: job.jobId });
      await reload();
    } catch (cause) {
      notifyError("Failed to retry job", cause);
    }
  };
  const remove = async () => {
    try {
      await getClient().removeJob({ jobId: job.jobId });
      await reload();
    } catch (cause) {
      notifyError("Failed to remove job", cause);
    }
  };
  const cleanup = async () => {
    try {
      await getClient().cleanupJob({ jobId: job.jobId });
      await reload();
    } catch (cause) {
      notifyError("Cleanup blocked", cause);
    }
  };
  return (
    <article className="space-y-2 p-3">
      <div className="flex min-w-0 items-start gap-2">
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-medium">{job.cardSnapshot.name}</h3>
          <p className="text-xs text-muted-foreground">
            {job.state} · {job.branchName ?? "no branch yet"}
          </p>
        </div>
        {job.state === "failed" || job.state === "needs_review" ? (
          <Button size="xs" variant="outline" onClick={retry}>
            <RotateCcwIcon className="size-3.5" />
            Retry
          </Button>
        ) : null}
        <Button size="xs" variant="ghost" onClick={remove}>
          <Trash2Icon className="size-3.5" />
        </Button>
      </div>
      {!compact ? (
        <div className="grid gap-3 text-xs text-muted-foreground md:grid-cols-2">
          <MetaRow label="Worktree" value={job.worktreePath ?? "Not assigned"} />
          <MetaRow label="Thread" value={job.threadId ?? "Not started"} />
          <MetaRow
            label="Environment"
            value={
              job.envAllocation
                ? `APP ${job.envAllocation.appPort}, API ${job.envAllocation.apiPort}, ${job.envAllocation.databaseName}`
                : "Not assigned"
            }
          />
          <MetaRow label="Started" value={job.startedAt ?? "Not started"} />
          <div className="md:col-span-2">
            <div className="mb-1 font-medium text-foreground">Logs</div>
            <pre className="max-h-56 overflow-auto rounded-md bg-muted/50 p-2 text-[11px] text-foreground/80">
              {[...job.logs, ...job.errors.map((error) => `ERROR: ${error}`)].join("\n") ||
                "No logs yet."}
            </pre>
          </div>
          {job.worktreePath ? (
            <Button size="xs" variant="outline" onClick={cleanup}>
              Cleanup worktree
            </Button>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}

function PlanEditor({
  plan,
  onChange,
}: {
  readonly plan: TrelloImplementationPlan;
  readonly onChange: (plan: TrelloImplementationPlan) => void;
}) {
  const fields: ReadonlyArray<[keyof TrelloImplementationPlan, string]> = [
    ["overview", "Overview"],
    ["implementationNotes", "Implementation notes"],
    ["questions", "Questions"],
    ["risks", "Risks"],
    ["acceptanceCriteria", "Acceptance criteria"],
    ["testInstructions", "Test instructions"],
    ["environmentNotes", "Environment notes"],
  ];
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {fields.map(([key, label]) => (
        <label key={key} className="space-y-1.5">
          <span className="text-xs font-medium text-muted-foreground">{label}</span>
          <Textarea
            value={plan[key]}
            onChange={(event) => onChange({ ...plan, [key]: event.target.value })}
          />
        </label>
      ))}
    </div>
  );
}

function groupJobs(jobs: ReadonlyArray<TrelloQueueJob>) {
  return {
    queued: jobs.filter((job) => job.state === "queued"),
    running: jobs.filter((job) => job.state === "running"),
    waiting_for_user: jobs.filter((job) => job.state === "waiting_for_user"),
    completed: jobs.filter((job) => job.state === "completed"),
    failed: jobs.filter((job) => job.state === "failed"),
    needs_review: jobs.filter((job) => job.state === "needs_review"),
    cleaned_up: jobs.filter((job) => job.state === "cleaned_up"),
  };
}

function DetailBlock({
  title,
  children,
}: {
  readonly title: string;
  readonly children: React.ReactNode;
}) {
  return (
    <section>
      <h3 className="mb-2 text-xs font-semibold uppercase text-muted-foreground">{title}</h3>
      <div className="whitespace-pre-wrap text-sm text-foreground/85">{children}</div>
    </section>
  );
}

function MetaRow({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <div>
      <div className="text-[11px] font-medium uppercase text-muted-foreground">{label}</div>
      <div className="break-all text-sm text-foreground/85">{value}</div>
    </div>
  );
}

function EmptyState({ text }: { readonly text: string }) {
  return (
    <div className="flex h-full items-center justify-center p-6 text-center text-sm text-muted-foreground">
      <div>
        <ClipboardListIcon className="mx-auto mb-3 size-8 opacity-60" />
        {text}
      </div>
    </div>
  );
}

function TrelloCredentialsCallout({
  message,
  onSettings,
}: {
  readonly message: string;
  readonly onSettings: () => void;
}) {
  return (
    <div className="mt-3 flex flex-wrap items-center gap-3 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-foreground">
      <div className="min-w-0 flex-1">
        <div className="font-medium">Trello credentials need attention</div>
        <div className="mt-0.5 text-muted-foreground">{message}</div>
      </div>
      <Button size="xs" variant="outline" onClick={onSettings}>
        <SettingsIcon className="size-3.5" />
        Update settings
      </Button>
    </div>
  );
}

function TrelloBoardSetupPrompt({
  title,
  message,
  primaryLabel,
  onPrimary,
  secondaryLabel,
  onSecondary,
  busy,
}: {
  readonly title: string;
  readonly message: string;
  readonly primaryLabel: string;
  readonly onPrimary: () => void;
  readonly secondaryLabel?: string;
  readonly onSecondary?: () => void;
  readonly busy: boolean;
}) {
  return (
    <div className="flex h-full items-center justify-center p-6">
      <div className="w-full max-w-md rounded-lg border border-border/70 bg-background p-5 shadow-sm">
        <SettingsIcon className="mb-3 size-7 text-muted-foreground" />
        <h2 className="text-sm font-semibold">{title}</h2>
        <p className="mt-2 text-sm text-muted-foreground">{message}</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button size="sm" onClick={onPrimary} disabled={busy}>
            {busy ? (
              <Loader2Icon className="size-4 animate-spin" />
            ) : (
              <SettingsIcon className="size-4" />
            )}
            {primaryLabel}
          </Button>
          {secondaryLabel && onSecondary ? (
            <Button size="sm" variant="outline" onClick={onSecondary}>
              {secondaryLabel}
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
