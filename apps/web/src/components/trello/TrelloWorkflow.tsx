import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentProps,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  DndContext,
  type DragEndEvent,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import {
  restrictToFirstScrollableAncestor,
  restrictToVerticalAxis,
} from "@dnd-kit/modifiers";
import { CSS } from "@dnd-kit/utilities";
import {
  CheckCircle2Icon,
  ChevronDownIcon,
  ChevronsUpDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ClipboardListIcon,
  EyeIcon,
  FileIcon,
  FilterIcon,
  GripVerticalIcon,
  LayersIcon,
  ListOrderedIcon,
  Loader2Icon,
  MessageSquareIcon,
  PaperclipIcon,
  PlayIcon,
  RefreshCwIcon,
  RotateCcwIcon,
  SearchIcon,
  SettingsIcon,
  SquareIcon,
  TagsIcon,
  Trash2Icon,
  XIcon,
  ZoomInIcon,
  ZoomOutIcon,
  type LucideIcon,
} from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import type {
  ProjectId,
  TrelloBoardSummary,
  TrelloCard,
  TrelloImplementationPlan,
  TrelloJobState,
  TrelloLabel,
  TrelloMember,
  TrelloQueueJob,
  TrelloStackItem,
  TrelloWorkflowJobId,
  TrelloWorkflowSnapshot,
} from "@t3tools/contracts";

import {
  buildTrelloImageIndexByUrl,
  collectTrelloCardImages,
  resolveTrelloImageLightboxIndex,
} from "@t3tools/shared/trelloCardImages";
import {
  resolveTrelloMediaPreviewUrl,
  resolveTrelloMemberAvatarPreviewUrl,
} from "@t3tools/shared/trelloMediaUrl";

import { cn } from "~/lib/utils";

import { ensureLocalApi } from "../../localApi";
import { selectProjectsAcrossEnvironments, useStore } from "../../store";
import { useSettings } from "../../hooks/useSettings";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import {
  Select,
  SelectGroup,
  SelectGroupLabel,
  SelectItem,
  SelectPopup,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
import { SidebarInset, SidebarTrigger } from "../ui/sidebar";
import { Textarea } from "../ui/textarea";
import { toastManager } from "../ui/toast";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import TrelloMarkdown from "./TrelloMarkdown";

type TrelloSection = "board" | "stack" | "queue" | "runs" | "settings";
type BoardFeatureFilter =
  | "all"
  | "comments"
  | "attachments"
  | "checklists"
  | "description";

interface TrelloWorkflowProps {
  readonly section: TrelloSection;
  readonly stackCardId?: string;
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
      setError(
        cause instanceof Error
          ? cause.message
          : "Failed to load Trello workflow.",
      );
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

function labelTone(label: TrelloLabel) {
  const color = label.color ?? "";
  if (color === "green")
    return "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300";
  if (color === "yellow")
    return "bg-yellow-500/20 text-yellow-800 dark:text-yellow-300";
  if (color === "orange")
    return "bg-orange-500/15 text-orange-700 dark:text-orange-300";
  if (color === "red") return "bg-red-500/15 text-red-700 dark:text-red-300";
  if (color === "purple")
    return "bg-violet-500/15 text-violet-700 dark:text-violet-300";
  if (color === "blue")
    return "bg-blue-500/15 text-blue-700 dark:text-blue-300";
  if (color === "sky") return "bg-sky-500/15 text-sky-700 dark:text-sky-300";
  if (color === "lime")
    return "bg-lime-500/15 text-lime-700 dark:text-lime-300";
  if (color === "pink")
    return "bg-pink-500/15 text-pink-700 dark:text-pink-300";
  if (color === "black") return "bg-zinc-700 text-zinc-50";
  return "bg-muted text-muted-foreground";
}

function memberInitials(member: TrelloMember) {
  const source = member.fullName || member.username;
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length >= 2)
    return `${parts[0]?.[0] ?? ""}${parts[1]?.[0] ?? ""}`.toUpperCase();
  return source.slice(0, 2).toUpperCase() || "?";
}

function memberDisplayName(member: TrelloMember) {
  return member.fullName || member.username;
}

function formatTrelloJobState(state: TrelloJobState) {
  return state.replaceAll("_", " ");
}

function stackStateTone(state: TrelloJobState) {
  if (state === "ready_for_queue")
    return "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300";
  if (state === "planning")
    return "bg-sky-500/15 text-sky-700 dark:text-sky-300";
  return "bg-muted text-muted-foreground";
}

function stackQueuePriorityLabel(priority: number) {
  if (priority === 1) return "Next in queue";
  return `#${priority} in queue`;
}

function truncatePreview(value: string, maxLength: number) {
  const trimmed = value.trim();
  if (trimmed.length <= maxLength) return trimmed;
  return `${trimmed.slice(0, maxLength).trimEnd()}…`;
}

type CardWorkflowBadgeKind = "stack" | "queue" | "review";

type CardWorkflowBadge = {
  readonly kind: CardWorkflowBadgeKind;
  readonly label: string;
  readonly icon: LucideIcon;
  readonly borderClass: string;
  readonly chipClass: string;
  readonly pulse?: boolean;
};

const stackOnlyStates = new Set<TrelloJobState>([
  "selected",
  "planning",
  "ready_for_queue",
]);
const queueActiveStates = new Set<TrelloJobState>(["queued", "running"]);
const reviewStates = new Set<TrelloJobState>([
  "needs_review",
  "waiting_for_user",
  "failed",
]);

function resolveCardWorkflowBadge(
  snapshot: TrelloWorkflowSnapshot,
  cardId: string,
): CardWorkflowBadge | null {
  const queueJob = snapshot.queue.jobs.find((job) => job.cardId === cardId);
  if (queueJob) {
    if (reviewStates.has(queueJob.state)) {
      return {
        kind: "review",
        label:
          queueJob.state === "failed"
            ? "Failed"
            : queueJob.state === "waiting_for_user"
              ? "Awaiting input"
              : "Needs review",
        icon: EyeIcon,
        borderClass: "border-l-amber-500",
        chipClass: "bg-amber-500/15 text-amber-800 dark:text-amber-300",
        pulse: queueJob.state === "needs_review",
      };
    }
    if (queueActiveStates.has(queueJob.state)) {
      return {
        kind: "queue",
        label: queueJob.state === "running" ? "Running" : "In queue",
        icon: queueJob.state === "running" ? Loader2Icon : ListOrderedIcon,
        borderClass: "border-l-sky-500",
        chipClass: "bg-sky-500/15 text-sky-800 dark:text-sky-300",
      };
    }
  }

  const stackItem = snapshot.stackItems.find((item) => item.cardId === cardId);
  if (stackItem && stackOnlyStates.has(stackItem.state)) {
    return {
      kind: "stack",
      label: "In stack",
      icon: LayersIcon,
      borderClass: "border-l-violet-500",
      chipClass: "bg-violet-500/15 text-violet-800 dark:text-violet-300",
    };
  }

  return null;
}

function buildCardWorkflowIndex(snapshot: TrelloWorkflowSnapshot) {
  const cardIds = new Set<string>();
  for (const item of snapshot.stackItems) cardIds.add(item.cardId);
  for (const job of snapshot.queue.jobs) cardIds.add(job.cardId);
  const index = new Map<string, CardWorkflowBadge>();
  for (const cardId of cardIds) {
    const badge = resolveCardWorkflowBadge(snapshot, cardId);
    if (badge) index.set(cardId, badge);
  }
  return index;
}

function CardWorkflowStatusChip({
  badge,
}: {
  readonly badge: CardWorkflowBadge;
}) {
  const Icon = badge.icon;
  return (
    <span
      className={cn(
        "inline-flex max-w-full items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
        badge.chipClass,
      )}
      title={badge.label}
    >
      {badge.pulse ? (
        <span className="relative flex size-2 shrink-0">
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-current opacity-40" />
          <span className="relative inline-flex size-2 rounded-full bg-current" />
        </span>
      ) : (
        <Icon
          className={cn(
            "size-3 shrink-0",
            badge.icon === Loader2Icon && "animate-spin",
          )}
        />
      )}
      <span className="truncate">{badge.label}</span>
    </span>
  );
}

type TrelloAttachment = TrelloCard["attachments"][number];

function isImageAttachment(attachment: TrelloAttachment) {
  if (attachment.mimeType?.startsWith("image/")) return true;
  return /\.(avif|gif|jpe?g|png|svg|webp)(\?|$)/i.test(attachment.url);
}

function attachmentExtension(attachment: TrelloAttachment) {
  const fromName = attachment.name.split(".").pop()?.toLowerCase();
  if (fromName && fromName !== attachment.name.toLowerCase()) return fromName;
  try {
    const pathname = new URL(attachment.url).pathname;
    const fromUrl = pathname.split(".").pop()?.toLowerCase();
    if (fromUrl && fromUrl !== pathname.toLowerCase()) return fromUrl;
  } catch {
    // Ignore invalid attachment URLs and fall back to the generic label.
  }
  return null;
}

function attachmentKind(attachment: TrelloAttachment) {
  const mime = attachment.mimeType?.toLowerCase() ?? "";
  const extension = attachmentExtension(attachment);

  if (mime.includes("pdf") || extension === "pdf") {
    return {
      label: "PDF",
      tone: "bg-red-500/15 text-red-700 dark:text-red-300",
    };
  }
  if (mime.includes("xml") || extension === "xml") {
    return {
      label: "XML",
      tone: "bg-orange-500/15 text-orange-700 dark:text-orange-300",
    };
  }
  if (mime.includes("json") || extension === "json") {
    return {
      label: "JSON",
      tone: "bg-amber-500/15 text-amber-800 dark:text-amber-300",
    };
  }
  if (mime.includes("csv") || extension === "csv") {
    return {
      label: "CSV",
      tone: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
    };
  }
  if (
    mime.includes("spreadsheet") ||
    mime.includes("excel") ||
    extension === "xls" ||
    extension === "xlsx"
  ) {
    return {
      label: "XLS",
      tone: "bg-green-500/15 text-green-700 dark:text-green-300",
    };
  }
  if (
    mime.includes("word") ||
    mime.includes("document") ||
    extension === "doc" ||
    extension === "docx"
  ) {
    return {
      label: "DOC",
      tone: "bg-blue-500/15 text-blue-700 dark:text-blue-300",
    };
  }
  if (
    mime.includes("zip") ||
    mime.includes("compressed") ||
    extension === "zip"
  ) {
    return {
      label: "ZIP",
      tone: "bg-violet-500/15 text-violet-700 dark:text-violet-300",
    };
  }
  if (mime.includes("text/plain") || extension === "txt") {
    return { label: "TXT", tone: "bg-muted text-muted-foreground" };
  }
  if (extension === "md" || extension === "markdown") {
    return {
      label: "MD",
      tone: "bg-sky-500/15 text-sky-700 dark:text-sky-300",
    };
  }
  if (mime.includes("html") || extension === "html" || extension === "htm") {
    return {
      label: "HTML",
      tone: "bg-indigo-500/15 text-indigo-700 dark:text-indigo-300",
    };
  }
  if (extension) {
    return {
      label: extension.slice(0, 4).toUpperCase(),
      tone: "bg-muted text-muted-foreground",
    };
  }
  return { label: "FILE", tone: "bg-muted text-muted-foreground" };
}

function formatAttachmentSize(bytes: number | null) {
  if (bytes === null || bytes <= 0) return null;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function FileAttachmentCard({
  attachment,
}: {
  readonly attachment: TrelloAttachment;
}) {
  const kind = attachmentKind(attachment);
  const size = formatAttachmentSize(attachment.bytes);
  return (
    <a
      href={attachment.url}
      target="_blank"
      rel="noreferrer"
      className="flex min-w-0 items-center gap-3 rounded-md border border-border/60 bg-muted/20 p-3 transition-colors hover:border-border hover:bg-muted/40"
    >
      <div
        className={`flex size-11 shrink-0 flex-col items-center justify-center gap-0.5 rounded-md border border-border/50 bg-background ${kind.tone}`}
      >
        <FileIcon className="size-3.5 opacity-70" />
        <span className="text-[10px] font-bold leading-none">{kind.label}</span>
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium text-foreground">
          {attachment.name}
        </div>
        <div className="mt-0.5 text-xs text-muted-foreground">
          {size ? `${kind.label} · ${size}` : kind.label}
        </div>
      </div>
    </a>
  );
}

function MemberAvatar({
  member,
  size = "sm",
}: {
  readonly member: TrelloMember;
  readonly size?: "sm" | "md";
}) {
  const [imageFailed, setImageFailed] = useState(false);
  const sizeClass = size === "sm" ? "size-6 text-[10px]" : "size-8 text-xs";
  const name = memberDisplayName(member);
  const avatarSrc = resolveTrelloMemberAvatarPreviewUrl(member);
  if (avatarSrc && !imageFailed) {
    return (
      <img
        src={avatarSrc}
        alt={name}
        title={name}
        className={`${sizeClass} shrink-0 rounded-full border border-background object-cover`}
        onError={() => setImageFailed(true)}
      />
    );
  }
  return (
    <span
      className={`inline-flex ${sizeClass} shrink-0 items-center justify-center rounded-full border border-background bg-muted font-semibold text-foreground`}
      title={name}
    >
      {memberInitials(member)}
    </span>
  );
}

function TrelloImagePreview({
  src,
  alt,
  className,
  draggable,
}: {
  readonly src: string;
  readonly alt: string;
  readonly className?: string;
  readonly draggable?: boolean;
}) {
  const previewSrc = resolveTrelloMediaPreviewUrl(src);
  if (!previewSrc) return null;
  return (
    <img
      src={previewSrc}
      alt={alt}
      className={className}
      loading="lazy"
      draggable={draggable}
    />
  );
}

function LabelChips({ labels }: { readonly labels: readonly TrelloLabel[] }) {
  if (labels.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1">
      {labels.map((label) => (
        <span
          key={label.id}
          className={`inline-flex max-w-full items-center gap-1 rounded-sm px-1.5 py-0.5 text-[10px] font-medium ${labelTone(label)}`}
          title={label.name || label.color || "Label"}
        >
          <TagsIcon className="size-2.5 shrink-0" />
          <span className="truncate">
            {label.name || label.color || "label"}
          </span>
        </span>
      ))}
    </div>
  );
}

function cardMatchesFeature(card: TrelloCard, feature: BoardFeatureFilter) {
  if (feature === "comments") return card.comments.length > 0;
  if (feature === "attachments") return card.attachments.length > 0;
  if (feature === "checklists")
    return card.checklists.some((checklist) => checklist.items.length > 0);
  if (feature === "description") return card.desc.trim().length > 0;
  return true;
}

function Header({
  title,
  onRefresh,
  loading,
}: {
  title: ReactNode;
  onRefresh: () => void;
  loading: boolean;
}) {
  return (
    <header className="flex h-[52px] shrink-0 items-center gap-2 border-b border-border px-3 sm:px-5">
      <SidebarTrigger className="size-7 shrink-0 md:hidden" />
      <div className="min-w-0 text-sm font-medium text-foreground">{title}</div>
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

export function TrelloWorkflow({ section, stackCardId }: TrelloWorkflowProps) {
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
        <Header
          title={
            section === "board" && snapshot ? (
              <TrelloBoardSelector snapshot={snapshot} reload={reload} />
            ) : (
              title
            )
          }
          onRefresh={reload}
          loading={loading}
        />
        <main
          className={cn(
            "min-h-0 flex-1",
            section === "board" || section === "stack"
              ? "overflow-hidden"
              : "overflow-auto",
          )}
        >
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
              {...(stackCardId ? { stackCardId } : {})}
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
  stackCardId,
}: {
  readonly section: TrelloSection;
  readonly snapshot: TrelloWorkflowSnapshot;
  readonly reload: () => Promise<void>;
  readonly setSnapshot: (snapshot: TrelloWorkflowSnapshot) => void;
  readonly stackCardId?: string;
}) {
  if (section === "settings")
    return <SettingsPanel snapshot={snapshot} reload={reload} />;
  if (section === "stack")
    return (
      <StackPanel
        snapshot={snapshot}
        reload={reload}
        {...(stackCardId ? { initialCardId: stackCardId } : {})}
      />
    );
  if (section === "queue")
    return (
      <QueuePanel
        snapshot={snapshot}
        reload={reload}
        setSnapshot={setSnapshot}
      />
    );
  if (section === "runs")
    return <RunsPanel snapshot={snapshot} reload={reload} />;
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
  const [busy, setBusy] = useState<string | null>(null);

  const persistPendingSettings = async () => {
    if (apiKey.trim() || token.trim()) {
      await getClient().updateSettings({ apiKey, token });
      setApiKey("");
      setToken("");
    }
  };

  const save = async () => {
    setBusy("save");
    try {
      await getClient().updateSettings({ apiKey, token });
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
      toastManager.add({
        type: result.ok ? "success" : "error",
        title: result.message,
      });
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
      toastManager.add({
        type: "success",
        title:
          result.boards.length === 0
            ? "No open Trello boards found"
            : "Trello boards loaded",
      });
      await reload();
    } catch (cause) {
      notifyError("Failed to load Trello boards", cause);
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
            API key stored: {snapshot.settings.hasApiKey ? "yes" : "no"} · token
            stored: {snapshot.settings.hasToken ? "yes" : "no"}
          </p>
        </div>
        <label className="block space-y-1.5">
          <span className="text-xs font-medium text-muted-foreground">
            API key
          </span>
          <Input
            value={apiKey}
            onChange={(event) => setApiKey(event.target.value)}
            type="password"
            placeholder={snapshot.settings.hasApiKey ? "Stored locally" : ""}
          />
        </label>
        <label className="block space-y-1.5">
          <span className="text-xs font-medium text-muted-foreground">
            Token
          </span>
          <Input
            value={token}
            onChange={(event) => setToken(event.target.value)}
            type="password"
            placeholder={snapshot.settings.hasToken ? "Stored locally" : ""}
          />
        </label>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={save} disabled={busy !== null}>
            <SettingsIcon className="size-4" />
            Save
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={test}
            disabled={busy !== null}
          >
            <CheckCircle2Icon className="size-4" />
            Test connection
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={loadBoards}
            disabled={busy !== null}
          >
            <RefreshCwIcon className="size-4" />
            Load boards
          </Button>
        </div>
      </section>
      <section className="rounded-lg border border-border/70 p-3 text-xs text-muted-foreground">
        Boards available: {snapshot.boards.length} · active board:{" "}
        {snapshot.cache.board?.name ?? "none"}
      </section>
    </div>
  );
}

function isBoardDragBlockedTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return true;
  return (
    target.closest("button, a, input, textarea, select, [role='button']") !==
    null
  );
}

const BOARD_DRAG_THRESHOLD_PX = 4;
const BOARD_MOMENTUM_MIN_VELOCITY = 0.04;
const BOARD_MOMENTUM_MAX_VELOCITY = 3.5;
const BOARD_MOMENTUM_FRICTION = 0.95;

type BoardDragSession = {
  active: boolean;
  pointerId: number;
  scrollLeft: number;
  startX: number;
  startY: number;
  lastX: number;
  lastTime: number;
  velocity: number;
};

function setBoardScrollDragging(element: HTMLElement, dragging: boolean) {
  element.classList.toggle("cursor-grabbing", dragging);
  element.classList.toggle("select-none", dragging);
}

function useHorizontalDragScroll<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const sessionRef = useRef<BoardDragSession | null>(null);
  const momentumFrameRef = useRef<number | null>(null);

  const stopMomentum = useCallback(() => {
    if (momentumFrameRef.current === null) return;
    cancelAnimationFrame(momentumFrameRef.current);
    momentumFrameRef.current = null;
  }, []);

  useEffect(() => () => stopMomentum(), [stopMomentum]);

  const onPointerDown = useCallback(
    (event: ReactPointerEvent<T>) => {
      if (
        event.button !== 0 ||
        event.pointerType !== "mouse" ||
        isBoardDragBlockedTarget(event.target)
      ) {
        return;
      }
      const element = ref.current;
      if (!element) return;

      stopMomentum();
      const now = performance.now();
      sessionRef.current = {
        active: false,
        pointerId: event.pointerId,
        scrollLeft: element.scrollLeft,
        startX: event.clientX,
        startY: event.clientY,
        lastX: event.clientX,
        lastTime: now,
        velocity: 0,
      };
    },
    [stopMomentum],
  );

  const onPointerMove = useCallback((event: ReactPointerEvent<T>) => {
    const session = sessionRef.current;
    const element = ref.current;
    if (!session || !element || session.pointerId !== event.pointerId) return;

    const deltaX = event.clientX - session.startX;
    const deltaY = event.clientY - session.startY;

    if (!session.active) {
      if (Math.hypot(deltaX, deltaY) < BOARD_DRAG_THRESHOLD_PX) return;
      if (Math.abs(deltaY) > Math.abs(deltaX)) {
        sessionRef.current = null;
        return;
      }
      session.active = true;
      session.scrollLeft = element.scrollLeft;
      session.startX = event.clientX;
      session.startY = event.clientY;
      session.lastX = event.clientX;
      session.lastTime = performance.now();
      session.velocity = 0;
      setBoardScrollDragging(element, true);
      element.setPointerCapture(event.pointerId);
    }

    event.preventDefault();
    element.scrollLeft = session.scrollLeft - (event.clientX - session.startX);

    const now = performance.now();
    const dt = now - session.lastTime;
    if (dt > 0) {
      const instantVelocity = (event.clientX - session.lastX) / dt;
      session.velocity = session.velocity * 0.65 + instantVelocity * 0.35;
      session.lastX = event.clientX;
      session.lastTime = now;
    }
  }, []);

  const endDrag = useCallback((event: ReactPointerEvent<T>) => {
    const session = sessionRef.current;
    const element = ref.current;
    if (!session || !element || session.pointerId !== event.pointerId) return;

    const wasActive = session.active;
    const velocity = Math.max(
      -BOARD_MOMENTUM_MAX_VELOCITY,
      Math.min(BOARD_MOMENTUM_MAX_VELOCITY, session.velocity),
    );
    sessionRef.current = null;

    if (wasActive) {
      setBoardScrollDragging(element, false);
      if (element.hasPointerCapture(event.pointerId)) {
        element.releasePointerCapture(event.pointerId);
      }

      if (Math.abs(velocity) >= BOARD_MOMENTUM_MIN_VELOCITY) {
        let momentumVelocity = velocity;
        let lastFrameTime = performance.now();
        const maxScrollLeft = Math.max(
          0,
          element.scrollWidth - element.clientWidth,
        );

        const step = (now: number) => {
          const dt = Math.min(now - lastFrameTime, 32);
          lastFrameTime = now;

          element.scrollLeft = Math.max(
            0,
            Math.min(maxScrollLeft, element.scrollLeft - momentumVelocity * dt),
          );

          if (element.scrollLeft <= 0 || element.scrollLeft >= maxScrollLeft) {
            momentumFrameRef.current = null;
            return;
          }

          momentumVelocity *= Math.pow(BOARD_MOMENTUM_FRICTION, dt / 16);
          if (Math.abs(momentumVelocity) < BOARD_MOMENTUM_MIN_VELOCITY) {
            momentumFrameRef.current = null;
            return;
          }

          momentumFrameRef.current = requestAnimationFrame(step);
        };

        momentumFrameRef.current = requestAnimationFrame(step);
      }
    }
  }, []);

  return {
    ref,
    onPointerDown,
    onPointerMove,
    onPointerUp: endDrag,
    onPointerCancel: endDrag,
  };
}

function TrelloBoardSelector({
  snapshot,
  reload,
}: {
  readonly snapshot: TrelloWorkflowSnapshot;
  readonly reload: () => Promise<void>;
}) {
  const [loadingBoards, setLoadingBoards] = useState(false);
  const [selectingBoardId, setSelectingBoardId] = useState<string | null>(null);
  const credentialsMissing =
    !snapshot.settings.hasApiKey || !snapshot.settings.hasToken;
  const activeBoardId = snapshot.activeBoardId;
  const activeBoardSummary = snapshot.boards.find(
    (board) => board.id === activeBoardId,
  );
  const activeBoardLabel =
    activeBoardSummary?.name ?? snapshot.cache.board?.name ?? "Select a board";

  const loadBoards = async () => {
    setLoadingBoards(true);
    try {
      const result = await getClient().listBoards();
      toastManager.add({
        type: "success",
        title:
          result.boards.length === 0
            ? "No open Trello boards found"
            : "Trello boards loaded",
      });
      await reload();
    } catch (cause) {
      notifyError("Failed to load Trello boards", cause);
    } finally {
      setLoadingBoards(false);
    }
  };

  const selectBoard = async (boardId: string) => {
    if (!boardId || boardId === activeBoardId) return;
    setSelectingBoardId(boardId);
    try {
      await getClient().selectBoard({
        boardId: boardId as TrelloBoardSummary["id"],
      });
      await reload();
    } catch (cause) {
      notifyError("Failed to select Trello board", cause);
    } finally {
      setSelectingBoardId(null);
    }
  };

  return (
    <Select
      modal={false}
      value={activeBoardId ?? null}
      onValueChange={(value) => {
        if (value) void selectBoard(value);
      }}
      onOpenChange={(open) => {
        if (open && !credentialsMissing && snapshot.boards.length === 0) {
          void loadBoards();
        }
      }}
      disabled={credentialsMissing || selectingBoardId !== null}
    >
      <SelectTrigger
        variant="ghost"
        size="sm"
        className="h-auto max-w-full px-2 font-medium text-foreground hover:text-foreground/80 [&_[data-slot=select-icon]]:hidden"
        aria-label="Select Trello board"
      >
        <SelectValue className="min-w-0 truncate">
          {loadingBoards && snapshot.boards.length === 0
            ? "Loading boards..."
            : activeBoardLabel}
        </SelectValue>
        {selectingBoardId !== null ||
        (loadingBoards && snapshot.boards.length === 0) ? (
          <Loader2Icon className="size-4 shrink-0 animate-spin opacity-50" />
        ) : (
          <ChevronsUpDownIcon className="size-4 shrink-0 opacity-50" />
        )}
      </SelectTrigger>
      <SelectPopup align="start" alignItemWithTrigger={false}>
        <SelectGroup>
          <SelectGroupLabel>Boards</SelectGroupLabel>
          {loadingBoards && snapshot.boards.length === 0 ? (
            <SelectItem value="__loading" disabled hideIndicator>
              Loading boards...
            </SelectItem>
          ) : snapshot.boards.length === 0 ? (
            <SelectItem value="__empty" disabled hideIndicator>
              No boards found
            </SelectItem>
          ) : (
            snapshot.boards.map((board) => (
              <SelectItem key={board.id} value={board.id} hideIndicator>
                {board.name}
              </SelectItem>
            ))
          )}
        </SelectGroup>
      </SelectPopup>
    </Select>
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
  const boardScroll = useHorizontalDragScroll<HTMLDivElement>();
  const [selectedCard, setSelectedCard] = useState<TrelloCard | null>(null);
  const [credentialIssue, setCredentialIssue] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [loadingBoards, setLoadingBoards] = useState(false);
  const [query, setQuery] = useState("");
  const [labelId, setLabelId] = useState("");
  const [memberId, setMemberId] = useState("");
  const [feature, setFeature] = useState<BoardFeatureFilter>("all");
  const credentialsMissing =
    !snapshot.settings.hasApiKey || !snapshot.settings.hasToken;
  const activeBoardId = snapshot.activeBoardId;
  const activeBoardSummary = snapshot.boards.find(
    (board) => board.id === activeBoardId,
  );
  const hasActiveFilters =
    query.trim().length > 0 ||
    labelId.length > 0 ||
    memberId.length > 0 ||
    feature !== "all";
  const filteredCards = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return snapshot.cache.cards.filter((card) => {
      if (card.closed) return false;
      if (labelId && !card.labels.some((label) => label.id === labelId))
        return false;
      if (memberId && !card.idMembers.includes(memberId as TrelloMember["id"]))
        return false;
      if (!cardMatchesFeature(card, feature)) return false;
      if (!normalizedQuery) return true;
      const haystack = [
        card.name,
        card.desc,
        ...card.labels.map((label) => label.name || label.color || ""),
        ...card.comments.map((comment) => comment.text),
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(normalizedQuery);
    });
  }, [feature, labelId, memberId, query, snapshot.cache.cards]);
  const cardsByList = useMemo(() => {
    const byList = new Map<string, TrelloCard[]>();
    for (const card of filteredCards) {
      byList.set(card.idList, [...(byList.get(card.idList) ?? []), card]);
    }
    return byList;
  }, [filteredCards]);
  const cardWorkflowByCardId = useMemo(
    () => buildCardWorkflowIndex(snapshot),
    [snapshot],
  );

  const resetFilters = () => {
    setQuery("");
    setLabelId("");
    setMemberId("");
    setFeature("all");
  };

  const previousActiveBoardIdRef = useRef(activeBoardId);
  useEffect(() => {
    if (previousActiveBoardIdRef.current !== activeBoardId) {
      resetFilters();
      setSelectedCard(null);
      previousActiveBoardIdRef.current = activeBoardId;
    }
  }, [activeBoardId]);

  const addToStack = async (cardId: string) => {
    try {
      await getClient().addToStack({ cardId: cardId as TrelloCard["id"] });
      toastManager.add({ type: "success", title: "Added to Stack" });
      await reload();
    } catch (cause) {
      notifyError("Failed to add card to Stack", cause);
    }
  };

  const removeFromStack = async (cardId: string) => {
    try {
      await getClient().removeFromStack({ cardId: cardId as TrelloCard["id"] });
      toastManager.add({ type: "success", title: "Removed from Stack" });
      await reload();
    } catch (cause) {
      notifyError("Failed to remove card from Stack", cause);
    }
  };

  const selectedCardInStack = selectedCard
    ? snapshot.stackItems.some((item) => item.cardId === selectedCard.id)
    : false;
  const selectedCardWorkflowBadge = selectedCard
    ? (cardWorkflowByCardId.get(selectedCard.id) ?? null)
    : null;

  const viewInStack = (cardId: string) => {
    setSelectedCard(null);
    void navigate({ to: "/trello-stack", search: { cardId } });
  };

  const goToSettings = () => {
    void navigate({ to: "/trello-settings" });
  };

  const loadBoards = async () => {
    setLoadingBoards(true);
    setCredentialIssue(null);
    try {
      const result = await getClient().listBoards();
      toastManager.add({
        type: "success",
        title:
          result.boards.length === 0
            ? "No open Trello boards found"
            : "Trello boards loaded",
      });
      await reload();
    } catch (cause) {
      const message =
        cause instanceof Error
          ? cause.message
          : "Failed to load Trello boards.";
      setCredentialIssue(message);
      notifyError("Failed to load Trello boards", cause);
    } finally {
      setLoadingBoards(false);
    }
  };

  const syncFromBoard = async (boardId = activeBoardId) => {
    if (!boardId) {
      toastManager.add({ type: "error", title: "Select a Trello board first" });
      return;
    }
    setSyncing(true);
    setCredentialIssue(null);
    try {
      const result = await getClient().syncBoard({
        boardId: boardId as TrelloBoardSummary["id"],
      });
      toastManager.add({
        type: "success",
        title: "Trello board synced",
        description: `${result.cardCount} cards across ${result.listCount} lists`,
      });
      await reload();
    } catch (cause) {
      const message =
        cause instanceof Error ? cause.message : "Trello sync failed.";
      setCredentialIssue(message);
      notifyError("Trello sync failed", cause);
    } finally {
      setSyncing(false);
    }
  };

  const syncButton = (
    <Button
      size="xs"
      variant="outline"
      onClick={() => void syncFromBoard()}
      disabled={
        credentialsMissing || !activeBoardId || syncing || loadingBoards
      }
    >
      {syncing ? (
        <Loader2Icon className="size-3.5 animate-spin" />
      ) : (
        <RefreshCwIcon className="size-3.5" />
      )}
      Sync
    </Button>
  );

  if (!snapshot.cache.board) {
    return (
      <div className="flex h-full min-h-0 flex-col">
        <TrelloBoardSetupPrompt
          title={
            credentialsMissing
              ? "Connect Trello to load your boards"
              : activeBoardSummary
                ? `${activeBoardSummary.name} is not cached yet`
                : "Choose a Trello board"
          }
          message={
            credentialsMissing
              ? "Add your Trello API key and token in settings, then return here to load your boards."
              : (credentialIssue ??
                (snapshot.boards.length === 0
                  ? "Load your Trello boards, choose one, then sync it locally."
                  : "Sync the selected board to cache lists, cards, comments, attachments, and checklists locally."))
          }
          primaryLabel={
            credentialsMissing
              ? "Open Trello Settings"
              : activeBoardId
                ? "Sync selected board"
                : "Load boards"
          }
          onPrimary={
            credentialsMissing
              ? goToSettings
              : activeBoardId
                ? syncFromBoard
                : loadBoards
          }
          {...(credentialsMissing
            ? {}
            : {
                secondaryLabel: "Open Trello Settings",
                onSecondary: goToSettings,
              })}
          busy={syncing || loadingBoards}
        />
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-b border-border/60 px-4 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-xs text-muted-foreground">
            Cached at {snapshot.cache.syncedAt ?? "never"}
          </p>
          <div className="ml-auto">{syncButton}</div>
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
        <BoardFilters
          query={query}
          onQueryChange={setQuery}
          labelId={labelId}
          onLabelChange={setLabelId}
          memberId={memberId}
          onMemberChange={setMemberId}
          feature={feature}
          onFeatureChange={setFeature}
          labels={snapshot.cache.labels}
          members={snapshot.cache.members}
          filteredCount={filteredCards.length}
          totalCount={
            snapshot.cache.cards.filter((card) => !card.closed).length
          }
          onReset={resetFilters}
          hasActiveFilters={hasActiveFilters}
        />
        {cardWorkflowByCardId.size > 0 ? (
          <div className="mt-2 flex flex-wrap items-center gap-2 text-[10px] text-muted-foreground">
            <span className="font-medium uppercase tracking-wide">
              Workflow
            </span>
            <CardWorkflowStatusChip
              badge={{
                kind: "stack",
                label: "In stack",
                icon: LayersIcon,
                borderClass: "border-l-violet-500",
                chipClass:
                  "bg-violet-500/15 text-violet-800 dark:text-violet-300",
              }}
            />
            <CardWorkflowStatusChip
              badge={{
                kind: "queue",
                label: "In queue",
                icon: ListOrderedIcon,
                borderClass: "border-l-sky-500",
                chipClass: "bg-sky-500/15 text-sky-800 dark:text-sky-300",
              }}
            />
            <CardWorkflowStatusChip
              badge={{
                kind: "review",
                label: "Needs review",
                icon: EyeIcon,
                borderClass: "border-l-amber-500",
                chipClass: "bg-amber-500/15 text-amber-800 dark:text-amber-300",
                pulse: true,
              }}
            />
          </div>
        ) : null}
      </div>
      <div
        ref={boardScroll.ref}
        className="flex min-h-0 flex-1 cursor-grab touch-pan-y gap-3 overflow-x-auto overscroll-x-contain p-3"
        onPointerDown={boardScroll.onPointerDown}
        onPointerMove={boardScroll.onPointerMove}
        onPointerUp={boardScroll.onPointerUp}
        onPointerCancel={boardScroll.onPointerCancel}
      >
        {snapshot.cache.lists
          .filter((list) => !list.closed)
          .map((list) => (
            <section
              key={list.id}
              className="flex w-72 shrink-0 flex-col rounded-lg border border-border/70 bg-muted/20"
            >
              <div className="flex items-center gap-2 border-b border-border/60 px-3 py-2">
                <span className="min-w-0 flex-1 truncate text-xs font-semibold">
                  {list.name}
                </span>
                <span className="rounded-full bg-background px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                  {(cardsByList.get(list.id) ?? []).length}
                </span>
              </div>
              <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-2">
                {(cardsByList.get(list.id) ?? []).map((card) => (
                  <BoardCard
                    key={card.id}
                    card={card}
                    members={snapshot.cache.members}
                    workflowBadge={cardWorkflowByCardId.get(card.id) ?? null}
                    onSelect={() => setSelectedCard(card)}
                  />
                ))}
                {(cardsByList.get(list.id) ?? []).length === 0 ? (
                  <div className="rounded-md border border-dashed border-border/70 p-3 text-center text-xs text-muted-foreground">
                    No matching cards
                  </div>
                ) : null}
              </div>
            </section>
          ))}
      </div>
      {selectedCard ? (
        <CardDetail
          card={selectedCard}
          listName={
            snapshot.cache.lists.find((list) => list.id === selectedCard.idList)
              ?.name ?? ""
          }
          members={snapshot.cache.members}
          isInStack={selectedCardInStack}
          workflowBadge={selectedCardWorkflowBadge}
          onClose={() => setSelectedCard(null)}
          onAdd={() => addToStack(selectedCard.id)}
          onRemove={() => removeFromStack(selectedCard.id)}
          onViewInStack={() => viewInStack(selectedCard.id)}
        />
      ) : null}
    </div>
  );
}

function TrelloCardBody({
  card,
  members,
  showTitle = false,
}: {
  readonly card: TrelloCard;
  readonly members: readonly TrelloMember[];
  readonly showTitle?: boolean;
}) {
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const cardMembers = members.filter((member) =>
    card.idMembers.includes(member.id),
  );
  const imageAttachments = useMemo(
    () => card.attachments.filter(isImageAttachment),
    [card.attachments],
  );
  const fileAttachments = card.attachments.filter(
    (attachment) => !isImageAttachment(attachment),
  );
  const checklistsWithItems = card.checklists.filter(
    (checklist) => checklist.items.length > 0,
  );
  const hasDescription = card.desc.trim().length > 0;
  const cardImages = useMemo(
    () =>
      collectTrelloCardImages({
        imageAttachments,
        desc: card.desc,
        commentTexts: card.comments.map((comment) => comment.text),
      }),
    [card.comments, card.desc, imageAttachments],
  );
  const imageIndexByUrl = useMemo(
    () => buildTrelloImageIndexByUrl(cardImages),
    [cardImages],
  );
  const openLightbox = useCallback((index: number) => {
    setLightboxIndex(index);
  }, []);
  const openLightboxForUrl = useCallback(
    (url: string) => {
      const index = resolveTrelloImageLightboxIndex(imageIndexByUrl, url);
      if (index !== null) setLightboxIndex(index);
    },
    [imageIndexByUrl],
  );

  return (
    <>
      <div className="space-y-5 text-sm">
        {showTitle ? (
          <h2 className="wrap-break-word text-base font-semibold leading-snug">
            {card.name}
          </h2>
        ) : null}
        {card.labels.length > 0 ? (
          <section>
            <h3 className="mb-2 text-xs font-semibold uppercase text-muted-foreground">
              Labels
            </h3>
            <LabelChips labels={card.labels} />
          </section>
        ) : null}
        {cardMembers.length > 0 ? (
          <section>
            <h3 className="mb-2 text-xs font-semibold uppercase text-muted-foreground">
              Members
            </h3>
            <div className="flex flex-wrap gap-2">
              {cardMembers.map((member) => (
                <div
                  key={member.id}
                  className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-muted/30 py-1 pl-1 pr-2.5"
                >
                  <MemberAvatar member={member} size="md" />
                  <span className="text-sm text-foreground/85">
                    {memberDisplayName(member)}
                  </span>
                </div>
              ))}
            </div>
          </section>
        ) : null}
        {hasDescription ? (
          <section>
            <h3 className="mb-2 text-xs font-semibold uppercase text-muted-foreground">
              Description
            </h3>
            <TrelloMarkdown
              text={card.desc}
              imageIndexByUrl={imageIndexByUrl}
              onImageClick={openLightbox}
            />
          </section>
        ) : null}
        {card.comments.length > 0 ? (
          <DetailBlock title="Comments">
            {card.comments.map((comment) => (
              <div
                key={comment.id}
                className="mb-3 rounded-md border border-border/60 p-2"
              >
                <div className="text-xs font-medium">
                  {comment.memberCreatorName ?? "Trello"} ·{" "}
                  {new Date(comment.date).toLocaleString()}
                </div>
                <div className="mt-1">
                  <TrelloMarkdown
                    text={comment.text}
                    imageIndexByUrl={imageIndexByUrl}
                    onImageClick={openLightbox}
                  />
                </div>
              </div>
            ))}
          </DetailBlock>
        ) : null}
        {checklistsWithItems.length > 0 ? (
          <DetailBlock title="Checklists">
            {checklistsWithItems.map((checklist) => (
              <div key={checklist.id} className="mb-3">
                <div className="text-xs font-semibold">{checklist.name}</div>
                {checklist.items.map((item) => (
                  <div
                    key={item.id}
                    className="mt-1 flex items-center gap-2 text-sm"
                  >
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
        ) : null}
        {imageAttachments.length > 0 ? (
          <DetailBlock title="Images">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {imageAttachments.map((attachment) => (
                <button
                  key={attachment.id}
                  type="button"
                  className="group overflow-hidden rounded-md border border-border/60 bg-muted/20 text-left transition-colors hover:border-border hover:bg-muted/40"
                  onClick={() => openLightboxForUrl(attachment.url)}
                >
                  <TrelloImagePreview
                    src={attachment.url}
                    alt={attachment.name}
                    className="aspect-[4/3] w-full object-cover transition-transform group-hover:scale-[1.02]"
                  />
                  <span className="block truncate px-2 py-1 text-[11px] text-muted-foreground">
                    {attachment.name}
                  </span>
                </button>
              ))}
            </div>
          </DetailBlock>
        ) : null}
        {fileAttachments.length > 0 ? (
          <DetailBlock title="Attachments">
            <div className="grid gap-2 sm:grid-cols-2">
              {fileAttachments.map((attachment) => (
                <FileAttachmentCard
                  key={attachment.id}
                  attachment={attachment}
                />
              ))}
            </div>
          </DetailBlock>
        ) : null}
      </div>
      {lightboxIndex !== null ? (
        <CardImageLightbox
          images={cardImages}
          index={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
          onIndexChange={setLightboxIndex}
        />
      ) : null}
    </>
  );
}

function CardDetail({
  card,
  listName,
  members,
  isInStack,
  workflowBadge,
  onClose,
  onAdd,
  onRemove,
  onViewInStack,
}: {
  readonly card: TrelloCard;
  readonly listName: string;
  readonly members: TrelloWorkflowSnapshot["cache"]["members"];
  readonly isInStack: boolean;
  readonly workflowBadge: CardWorkflowBadge | null;
  readonly onClose: () => void;
  readonly onAdd: () => void;
  readonly onRemove: () => void;
  readonly onViewInStack: () => void;
}) {
  return (
    <div className="fixed inset-y-0 right-0 z-40 flex w-full max-w-2xl flex-col border-l border-border bg-background shadow-xl">
      <header className="border-b border-border px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            {listName ? (
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {listName}
              </p>
            ) : null}
            {workflowBadge ? (
              <CardWorkflowStatusChip badge={workflowBadge} />
            ) : null}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {isInStack ? (
              <>
                <Button size="sm" onClick={onViewInStack}>
                  View in Stack
                </Button>
                <Button size="sm" variant="outline" onClick={onRemove}>
                  Remove from Stack
                </Button>
              </>
            ) : (
              <Button size="sm" onClick={onAdd}>
                Add to Stack
              </Button>
            )}
            <Button
              size="icon"
              variant="ghost"
              onClick={onClose}
              aria-label="Close"
            >
              <XIcon className="size-4" />
            </Button>
          </div>
        </div>
      </header>
      <div className="min-h-0 flex-1 overflow-auto p-4">
        <TrelloCardBody card={card} members={members} showTitle />
      </div>
    </div>
  );
}

const LIGHTBOX_MIN_ZOOM = 1;
const LIGHTBOX_MAX_ZOOM = 4;
const LIGHTBOX_ZOOM_STEP = 0.25;

function clampLightboxZoom(value: number) {
  return Math.min(LIGHTBOX_MAX_ZOOM, Math.max(LIGHTBOX_MIN_ZOOM, value));
}

function CardImageLightbox({
  images,
  index,
  onClose,
  onIndexChange,
}: {
  readonly images: readonly { readonly url: string; readonly name: string }[];
  readonly index: number;
  readonly onClose: () => void;
  readonly onIndexChange: (index: number) => void;
}) {
  const image = images[index];
  const hasMultiple = images.length > 1;
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const panSessionRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
  } | null>(null);
  const viewportRef = useRef<HTMLDivElement>(null);

  const resetView = useCallback(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
    setIsPanning(false);
    panSessionRef.current = null;
  }, []);

  const goToPrevious = useCallback(() => {
    onIndexChange((index - 1 + images.length) % images.length);
  }, [images.length, index, onIndexChange]);

  const goToNext = useCallback(() => {
    onIndexChange((index + 1) % images.length);
  }, [images.length, index, onIndexChange]);

  const adjustZoom = useCallback((delta: number) => {
    setZoom((current) => {
      const next = clampLightboxZoom(Number((current + delta).toFixed(2)));
      if (next === LIGHTBOX_MIN_ZOOM) {
        setPan({ x: 0, y: 0 });
      }
      return next;
    });
  }, []);

  useEffect(() => {
    resetView();
  }, [index, resetView]);

  useEffect(() => {
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        if (zoom > LIGHTBOX_MIN_ZOOM || pan.x !== 0 || pan.y !== 0) {
          resetView();
          return;
        }
        onClose();
        return;
      }
      if (event.key === "+" || event.key === "=") {
        event.preventDefault();
        adjustZoom(LIGHTBOX_ZOOM_STEP);
        return;
      }
      if (event.key === "-" || event.key === "_") {
        event.preventDefault();
        adjustZoom(-LIGHTBOX_ZOOM_STEP);
        return;
      }
      if (event.key === "0") {
        event.preventDefault();
        resetView();
        return;
      }
      if (!hasMultiple) return;
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        goToPrevious();
        return;
      }
      if (event.key === "ArrowRight") {
        event.preventDefault();
        goToNext();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    adjustZoom,
    goToNext,
    goToPrevious,
    hasMultiple,
    onClose,
    pan.x,
    pan.y,
    resetView,
    zoom,
  ]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      event.stopPropagation();
      adjustZoom(event.deltaY > 0 ? -LIGHTBOX_ZOOM_STEP : LIGHTBOX_ZOOM_STEP);
    };

    viewport.addEventListener("wheel", onWheel, { passive: false });
    return () => viewport.removeEventListener("wheel", onWheel);
  }, [adjustZoom]);

  const handlePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (zoom <= LIGHTBOX_MIN_ZOOM || event.button !== 0) return;
      event.preventDefault();
      panSessionRef.current = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        originX: pan.x,
        originY: pan.y,
      };
      setIsPanning(true);
      event.currentTarget.setPointerCapture(event.pointerId);
    },
    [pan.x, pan.y, zoom],
  );

  const handlePointerMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const session = panSessionRef.current;
      if (!session || session.pointerId !== event.pointerId) return;
      setPan({
        x: session.originX + event.clientX - session.startX,
        y: session.originY + event.clientY - session.startY,
      });
    },
    [],
  );

  const endPan = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const session = panSessionRef.current;
    if (!session || session.pointerId !== event.pointerId) return;
    panSessionRef.current = null;
    setIsPanning(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }, []);

  if (!image) return null;

  const isZoomed = zoom > LIGHTBOX_MIN_ZOOM || pan.x !== 0 || pan.y !== 0;

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-black/80"
      role="dialog"
      aria-modal="true"
      aria-label="Image preview"
    >
      <button
        type="button"
        className="absolute inset-0 cursor-zoom-out"
        aria-label="Close image preview"
        onClick={onClose}
      />
      <Button
        type="button"
        size="icon-xs"
        variant="ghost"
        className="absolute right-4 top-4 z-20 text-white/90 hover:bg-white/10 hover:text-white"
        onClick={onClose}
        aria-label="Close image preview"
      >
        <XIcon />
      </Button>
      <div className="relative z-10 flex min-h-0 flex-1 items-center justify-center gap-2 px-2 pb-4 pt-4 sm:gap-4 sm:px-6">
        {hasMultiple ? (
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="shrink-0 self-center rounded-full bg-black/50 text-white/90 hover:bg-black/70 hover:text-white"
            aria-label="Previous image"
            onClick={goToPrevious}
          >
            <ChevronLeftIcon className="size-5" />
          </Button>
        ) : null}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col items-center">
          <div
            ref={viewportRef}
            className={`flex min-h-0 w-full flex-1 touch-none items-center justify-center overflow-hidden ${
              zoom > LIGHTBOX_MIN_ZOOM
                ? isPanning
                  ? "cursor-grabbing"
                  : "cursor-grab"
                : "cursor-zoom-in"
            }`}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={endPan}
            onPointerCancel={endPan}
            onDoubleClick={() => {
              if (isZoomed) {
                resetView();
                return;
              }
              setZoom(2);
            }}
          >
            <div
              className="max-h-full max-w-full"
              style={{
                transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                transformOrigin: "center center",
              }}
            >
              <TrelloImagePreview
                src={image.url}
                alt={image.name}
                className="max-h-[calc(100vh-10rem)] max-w-full select-none rounded-lg object-contain shadow-2xl"
                draggable={false}
              />
            </div>
          </div>
          <div className="mt-3 flex items-center justify-center gap-1">
            <Button
              type="button"
              size="icon-xs"
              variant="ghost"
              className="text-white/90 hover:bg-white/10 hover:text-white"
              onClick={() => adjustZoom(-LIGHTBOX_ZOOM_STEP)}
              disabled={zoom <= LIGHTBOX_MIN_ZOOM}
              aria-label="Zoom out"
            >
              <ZoomOutIcon className="size-4" />
            </Button>
            <span className="min-w-12 text-center text-xs tabular-nums text-white/80">
              {Math.round(zoom * 100)}%
            </span>
            <Button
              type="button"
              size="icon-xs"
              variant="ghost"
              className="text-white/90 hover:bg-white/10 hover:text-white"
              onClick={() => adjustZoom(LIGHTBOX_ZOOM_STEP)}
              disabled={zoom >= LIGHTBOX_MAX_ZOOM}
              aria-label="Zoom in"
            >
              <ZoomInIcon className="size-4" />
            </Button>
            <Button
              type="button"
              size="xs"
              variant="ghost"
              className="text-white/90 hover:bg-white/10 hover:text-white"
              onClick={resetView}
              disabled={!isZoomed}
            >
              Reset
            </Button>
          </div>
          <p className="mt-2 max-w-full truncate px-2 text-center text-xs text-white/80">
            {image.name}
            {hasMultiple ? ` (${index + 1}/${images.length})` : ""}
          </p>
        </div>
        {hasMultiple ? (
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="shrink-0 self-center rounded-full bg-black/50 text-white/90 hover:bg-black/70 hover:text-white"
            aria-label="Next image"
            onClick={goToNext}
          >
            <ChevronRightIcon className="size-5" />
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function NativeSelect({ className, ...props }: ComponentProps<"select">) {
  return (
    <div className="relative">
      <select
        className={cn(
          "h-8 w-full appearance-none rounded-md border border-input bg-background pl-2 pr-8 text-sm",
          className,
        )}
        {...props}
      />
      <ChevronDownIcon className="pointer-events-none absolute right-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground opacity-80" />
    </div>
  );
}

function FilterFieldFooter({ children }: { readonly children: ReactNode }) {
  return (
    <div className="space-y-1">
      <span
        className="block text-[11px] font-medium uppercase text-muted-foreground invisible select-none"
        aria-hidden="true"
      >
        &nbsp;
      </span>
      <div className="flex h-8 items-center">{children}</div>
    </div>
  );
}

function BoardFilters({
  query,
  onQueryChange,
  labelId,
  onLabelChange,
  memberId,
  onMemberChange,
  feature,
  onFeatureChange,
  labels,
  members,
  filteredCount,
  totalCount,
  onReset,
  hasActiveFilters,
}: {
  readonly query: string;
  readonly onQueryChange: (value: string) => void;
  readonly labelId: string;
  readonly onLabelChange: (value: string) => void;
  readonly memberId: string;
  readonly onMemberChange: (value: string) => void;
  readonly feature: BoardFeatureFilter;
  readonly onFeatureChange: (value: BoardFeatureFilter) => void;
  readonly labels: readonly TrelloLabel[];
  readonly members: readonly TrelloMember[];
  readonly filteredCount: number;
  readonly totalCount: number;
  readonly onReset: () => void;
  readonly hasActiveFilters: boolean;
}) {
  return (
    <div className="mt-3 flex flex-wrap items-end gap-2">
      <label className="w-full max-w-xs space-y-1">
        <span className="block text-[11px] font-medium uppercase text-muted-foreground">
          Search
        </span>
        <div className="relative">
          <SearchIcon className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            className="h-8 pl-7 text-sm"
            placeholder="Title, description, comment, label"
          />
        </div>
      </label>
      <label className="min-w-40 space-y-1">
        <span className="block text-[11px] font-medium uppercase text-muted-foreground">
          Label
        </span>
        <NativeSelect
          value={labelId}
          onChange={(event) => onLabelChange(event.target.value)}
        >
          <option value="">Any label</option>
          {labels.map((label) => (
            <option key={label.id} value={label.id}>
              {label.name || label.color || "Unnamed label"}
            </option>
          ))}
        </NativeSelect>
      </label>
      <label className="min-w-44 space-y-1">
        <span className="block text-[11px] font-medium uppercase text-muted-foreground">
          Member
        </span>
        <NativeSelect
          value={memberId}
          onChange={(event) => onMemberChange(event.target.value)}
        >
          <option value="">Any member</option>
          {members.map((member) => (
            <option key={member.id} value={member.id}>
              {member.fullName || member.username}
            </option>
          ))}
        </NativeSelect>
      </label>
      <label className="min-w-40 space-y-1">
        <span className="block text-[11px] font-medium uppercase text-muted-foreground">
          Cards
        </span>
        <NativeSelect
          value={feature}
          onChange={(event) =>
            onFeatureChange(event.target.value as BoardFeatureFilter)
          }
        >
          <option value="all">All cards</option>
          <option value="comments">With comments</option>
          <option value="attachments">With attachments</option>
          <option value="checklists">With checklists</option>
          <option value="description">With description</option>
        </NativeSelect>
      </label>
      <FilterFieldFooter>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <FilterIcon className="size-3.5" />
          {filteredCount}/{totalCount}
        </div>
      </FilterFieldFooter>
      {hasActiveFilters ? (
        <FilterFieldFooter>
          <Button size="xs" variant="ghost" onClick={onReset}>
            <XIcon className="size-3.5" />
            Clear
          </Button>
        </FilterFieldFooter>
      ) : null}
    </div>
  );
}

function BoardCard({
  card,
  members,
  workflowBadge,
  onSelect,
}: {
  readonly card: TrelloCard;
  readonly members: readonly TrelloMember[];
  readonly workflowBadge: CardWorkflowBadge | null;
  readonly onSelect: () => void;
}) {
  const progress = checklistProgress(card);
  const cardMembers = members.filter((member) =>
    card.idMembers.includes(member.id),
  );
  return (
    <button
      type="button"
      className={cn(
        "cursor-pointer rounded-md border border-border/70 bg-background p-2 text-left shadow-xs transition-colors hover:bg-muted/50",
        workflowBadge ? cn("border-l-[3px]", workflowBadge.borderClass) : null,
      )}
      onClick={onSelect}
    >
      {workflowBadge ? (
        <div className="mb-2">
          <CardWorkflowStatusChip badge={workflowBadge} />
        </div>
      ) : null}
      {card.labels.length > 0 ? (
        <div className="mb-2">
          <LabelChips labels={card.labels.slice(0, 5)} />
        </div>
      ) : null}
      <div className="line-clamp-2 text-xs font-medium">{card.name}</div>
      <div className="mt-2 flex items-center justify-between gap-2">
        <div className="flex min-w-0 flex-wrap items-center gap-3 text-[10px] text-muted-foreground">
          {progress.total > 0 ? (
            <span className="inline-flex items-center gap-1">
              <CheckCircle2Icon className="size-3" />
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
        {cardMembers.length > 0 ? (
          <div
            className="flex shrink-0 -space-x-1"
            aria-label={`${cardMembers.length} members`}
          >
            {cardMembers.slice(0, 4).map((member) => (
              <MemberAvatar key={member.id} member={member} />
            ))}
            {cardMembers.length > 4 ? (
              <span className="inline-flex size-6 items-center justify-center rounded-full border border-background bg-muted text-[10px] font-semibold text-muted-foreground">
                +{cardMembers.length - 4}
              </span>
            ) : null}
          </div>
        ) : null}
      </div>
    </button>
  );
}

function StackItemPreview({
  item,
  listName,
}: {
  readonly item: TrelloStackItem;
  readonly listName: string;
}) {
  const desc = item.cardSnapshot.desc.trim();
  const overview = item.plan.overview.trim();
  const hasPlanContent = Object.values(item.plan).some(
    (value) => value.trim().length > 0,
  );
  return (
    <div className="max-w-xs space-y-2 text-left">
      <div>
        <p className="text-xs font-medium text-foreground">
          {item.cardSnapshot.name}
        </p>
        {listName ? (
          <p className="mt-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
            {listName}
          </p>
        ) : null}
      </div>
      {desc ? (
        <p className="line-clamp-4 text-[11px] leading-relaxed text-muted-foreground">
          {truncatePreview(desc, 280)}
        </p>
      ) : (
        <p className="text-[11px] text-muted-foreground/80">
          No card description.
        </p>
      )}
      {hasPlanContent ? (
        <div className="rounded-md border border-border/60 bg-muted/20 p-2">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Plan notes
          </p>
          {overview ? (
            <p className="mt-1 line-clamp-3 text-[11px] leading-relaxed text-foreground/90">
              {truncatePreview(overview, 180)}
            </p>
          ) : (
            <p className="mt-1 text-[11px] text-muted-foreground">
              Notes added
            </p>
          )}
        </div>
      ) : null}
    </div>
  );
}

type StackDragHandleProps = {
  readonly attributes: ReturnType<typeof useSortable>["attributes"];
  readonly listeners: ReturnType<typeof useSortable>["listeners"];
  readonly setActivatorNodeRef: ReturnType<
    typeof useSortable
  >["setActivatorNodeRef"];
};

function StackSidebarItem({
  item,
  selected,
  queuePriority,
  listName,
  onSelect,
  dragHandleProps,
}: {
  readonly item: TrelloStackItem;
  readonly selected: boolean;
  readonly queuePriority: number;
  readonly listName: string;
  readonly onSelect: () => void;
  readonly dragHandleProps?: StackDragHandleProps;
}) {
  const progress = checklistProgress(item.cardSnapshot);
  const hasPlanContent = Object.values(item.plan).some(
    (value) => value.trim().length > 0,
  );
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            type="button"
            className={cn(
              "flex w-full cursor-pointer items-start gap-1 border-b border-border/60 px-2 py-2.5 text-left transition-colors",
              selected
                ? "bg-accent text-foreground"
                : "text-muted-foreground hover:bg-accent/60",
            )}
            onClick={onSelect}
          />
        }
      >
        {dragHandleProps ? (
          <span
            ref={dragHandleProps.setActivatorNodeRef}
            className="mt-0.5 inline-flex shrink-0 cursor-grab touch-none items-center rounded-sm p-0.5 text-muted-foreground/70 hover:bg-muted/60 hover:text-foreground active:cursor-grabbing"
            aria-label={`Reorder ${item.cardSnapshot.name}`}
            onClick={(event) => event.stopPropagation()}
            {...dragHandleProps.attributes}
            {...dragHandleProps.listeners}
          >
            <GripVerticalIcon className="size-3.5" />
          </span>
        ) : null}
        <span className="min-w-0 flex-1">
          <div className="flex items-start gap-2">
            <span
              className={cn(
                "inline-flex shrink-0 rounded-sm px-1.5 py-0.5 text-[10px] font-semibold tabular-nums",
                queuePriority === 1
                  ? "bg-primary/15 text-primary"
                  : "bg-muted text-muted-foreground",
              )}
              title={stackQueuePriorityLabel(queuePriority)}
            >
              #{queuePriority}
            </span>
            <span className="min-w-0 flex-1 truncate text-xs font-medium text-foreground">
              {item.cardSnapshot.name}
            </span>
          </div>
          {item.cardSnapshot.labels.length > 0 ? (
            <div className="mt-1.5">
              <LabelChips labels={item.cardSnapshot.labels.slice(0, 4)} />
            </div>
          ) : null}
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span
              className={cn(
                "inline-flex rounded-sm px-1.5 py-0.5 text-[10px] font-medium capitalize",
                stackStateTone(item.state),
              )}
            >
              {formatTrelloJobState(item.state)}
            </span>
            {hasPlanContent ? (
              <span className="text-[10px] text-muted-foreground">
                Notes added
              </span>
            ) : null}
            {progress.total > 0 ? (
              <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
                <CheckCircle2Icon className="size-3" />
                {progress.complete}/{progress.total}
              </span>
            ) : null}
          </div>
        </span>
      </TooltipTrigger>
      <TooltipPopup side="right" sideOffset={8} className="p-3">
        <StackItemPreview item={item} listName={listName} />
      </TooltipPopup>
    </Tooltip>
  );
}

function SortableStackSidebarItem({
  item,
  selected,
  queuePriority,
  listName,
  onSelect,
}: {
  readonly item: TrelloStackItem;
  readonly selected: boolean;
  readonly queuePriority: number;
  readonly listName: string;
  readonly onSelect: () => void;
}) {
  const {
    attributes,
    listeners,
    setActivatorNodeRef,
    setNodeRef,
    transform,
    transition,
    isDragging,
    isOver,
  } = useSortable({ id: item.jobId });
  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Translate.toString(transform),
        transition,
      }}
      className={cn(
        isDragging ? "relative z-20 opacity-80" : "",
        isOver && !isDragging ? "ring-1 ring-inset ring-primary/40" : "",
      )}
    >
      <StackSidebarItem
        item={item}
        selected={selected}
        queuePriority={queuePriority}
        listName={listName}
        onSelect={onSelect}
        dragHandleProps={{ attributes, listeners, setActivatorNodeRef }}
      />
    </div>
  );
}

function StackPanel({
  snapshot,
  reload,
  initialCardId,
}: {
  readonly snapshot: TrelloWorkflowSnapshot;
  readonly reload: () => Promise<void>;
  readonly initialCardId?: string;
}) {
  const resolveEditingFromCardId = useCallback(
    (cardId: string | undefined): TrelloWorkflowJobId | null => {
      if (!cardId) return null;
      return (
        snapshot.stackItems.find((item) => item.cardId === cardId)?.jobId ??
        null
      );
    },
    [snapshot.stackItems],
  );
  const [editing, setEditing] = useState<TrelloWorkflowJobId | null>(() =>
    resolveEditingFromCardId(initialCardId),
  );
  const [readyOnly, setReadyOnly] = useState(false);
  const [reorderBusy, setReorderBusy] = useState(false);

  useEffect(() => {
    if (!initialCardId) return;
    const jobId = resolveEditingFromCardId(initialCardId);
    if (jobId) setEditing(jobId);
  }, [initialCardId, resolveEditingFromCardId]);
  const [busy, setBusy] = useState(false);
  const active =
    snapshot.stackItems.find((item) => item.jobId === editing) ??
    snapshot.stackItems[0] ??
    null;
  const [plan, setPlan] = useState<TrelloImplementationPlan>(
    active?.plan ?? emptyPlan,
  );
  const listNameById = useMemo(
    () => new Map(snapshot.cache.lists.map((list) => [list.id, list.name])),
    [snapshot.cache.lists],
  );
  const listName =
    active === null ? "" : (listNameById.get(active.cardSnapshot.idList) ?? "");
  const readyCount = useMemo(
    () =>
      snapshot.stackItems.filter((item) => item.state === "ready_for_queue")
        .length,
    [snapshot.stackItems],
  );
  const visibleStackItems = useMemo(() => {
    if (!readyOnly) return snapshot.stackItems;
    return snapshot.stackItems.filter(
      (item) => item.state === "ready_for_queue",
    );
  }, [readyOnly, snapshot.stackItems]);
  const queuePriorityByJobId = useMemo(
    () =>
      new Map(
        snapshot.stackItems.map(
          (item, index) => [item.jobId, index + 1] as const,
        ),
      ),
    [snapshot.stackItems],
  );
  const stackDnDSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
  );

  useEffect(() => {
    setPlan(active?.plan ?? emptyPlan);
  }, [active?.jobId]);

  const save = async (moveToQueue: boolean) => {
    if (!active) return;
    setBusy(true);
    try {
      await getClient().updateStackItem({
        jobId: active.jobId,
        plan,
        state: "ready_for_queue",
      });
      if (moveToQueue) await getClient().moveToQueue({ jobId: active.jobId });
      toastManager.add({
        type: "success",
        title: moveToQueue ? "Moved to Queue" : "Plan saved",
      });
      await reload();
    } catch (cause) {
      notifyError("Failed to update stack item", cause);
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!active) return;
    setBusy(true);
    try {
      await getClient().removeFromStack({ cardId: active.cardId });
      toastManager.add({ type: "success", title: "Removed from Stack" });
      setEditing(null);
      await reload();
    } catch (cause) {
      notifyError("Failed to remove card from Stack", cause);
    } finally {
      setBusy(false);
    }
  };

  const bulkMoveReady = async () => {
    if (readyCount === 0) return;
    setBusy(true);
    try {
      const result = await getClient().bulkMoveReadyToQueue();
      toastManager.add({
        type: "success",
        title:
          result.movedCount === 1
            ? "Moved 1 ready item to queue"
            : `Moved ${result.movedCount} ready items to queue`,
      });
      await reload();
    } catch (cause) {
      notifyError("Failed to move ready items to queue", cause);
    } finally {
      setBusy(false);
    }
  };

  const handleStackDragEnd = async (event: DragEndEvent) => {
    const { active: dragged, over } = event;
    if (!over || dragged.id === over.id) return;
    const oldIndex = snapshot.stackItems.findIndex(
      (item) => item.jobId === dragged.id,
    );
    const newIndex = snapshot.stackItems.findIndex(
      (item) => item.jobId === over.id,
    );
    if (oldIndex === -1 || newIndex === -1) return;
    const reordered = arrayMove([...snapshot.stackItems], oldIndex, newIndex);
    setReorderBusy(true);
    try {
      await getClient().reorderStack({
        jobIds: reordered.map((item) => item.jobId),
      });
      await reload();
    } catch (cause) {
      notifyError("Failed to reorder stack", cause);
    } finally {
      setReorderBusy(false);
    }
  };

  if (snapshot.stackItems.length === 0)
    return <EmptyState text="No stacked Trello tickets yet." />;

  const stackList = (
    <>
      {visibleStackItems.length === 0 ? (
        <div className="px-3 py-4 text-xs text-muted-foreground">
          No ready items in the stack.
        </div>
      ) : readyOnly ? (
        visibleStackItems.map((item) => (
          <StackSidebarItem
            key={item.jobId}
            item={item}
            selected={active?.jobId === item.jobId}
            queuePriority={queuePriorityByJobId.get(item.jobId) ?? 0}
            listName={listNameById.get(item.cardSnapshot.idList) ?? ""}
            onSelect={() => setEditing(item.jobId)}
          />
        ))
      ) : (
        <SortableContext
          items={visibleStackItems.map((item) => item.jobId)}
          strategy={verticalListSortingStrategy}
        >
          {visibleStackItems.map((item) => (
            <SortableStackSidebarItem
              key={item.jobId}
              item={item}
              selected={active?.jobId === item.jobId}
              queuePriority={queuePriorityByJobId.get(item.jobId) ?? 0}
              listName={listNameById.get(item.cardSnapshot.idList) ?? ""}
              onSelect={() => setEditing(item.jobId)}
            />
          ))}
        </SortableContext>
      )}
    </>
  );

  return (
    <div className="flex h-full min-h-0 flex-col md:flex-row">
      <aside className="flex w-full shrink-0 flex-col border-b border-border md:w-80 md:border-b-0 md:border-r">
        <div className="space-y-2 border-b border-border/60 px-3 py-2">
          <div className="flex items-center justify-between gap-2">
            <div className="text-xs font-semibold text-muted-foreground">
              Stack ({snapshot.stackItems.length})
            </div>
            {reorderBusy ? (
              <Loader2Icon className="size-3.5 animate-spin text-muted-foreground" />
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="xs"
              variant={readyOnly ? "default" : "outline"}
              onClick={() => setReadyOnly((value) => !value)}
            >
              <FilterIcon className="size-3" />
              Ready
              {readyCount > 0 ? ` (${readyCount})` : ""}
            </Button>
            <Button
              size="xs"
              variant="outline"
              disabled={busy || readyCount === 0}
              onClick={bulkMoveReady}
            >
              {busy ? <Loader2Icon className="size-3 animate-spin" /> : null}
              Move ready to queue
            </Button>
          </div>
          {!readyOnly ? (
            <p className="text-[10px] text-muted-foreground">
              Drag to reorder queue priority. #1 runs first.
            </p>
          ) : null}
        </div>
        <div className="max-h-48 min-h-0 overflow-y-auto md:max-h-none md:flex-1">
          {readyOnly ? (
            stackList
          ) : (
            <DndContext
              sensors={stackDnDSensors}
              collisionDetection={closestCenter}
              modifiers={[
                restrictToVerticalAxis,
                restrictToFirstScrollableAncestor,
              ]}
              onDragEnd={(event) => {
                void handleStackDragEnd(event);
              }}
            >
              {stackList}
            </DndContext>
          )}
        </div>
      </aside>
      {active ? (
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <header className="shrink-0 border-b border-border px-4 py-3">
            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                {listName ? (
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    {listName}
                  </p>
                ) : null}
                <span
                  className={cn(
                    "inline-flex rounded-sm px-1.5 py-0.5 text-[10px] font-medium capitalize",
                    stackStateTone(active.state),
                  )}
                >
                  {formatTrelloJobState(active.state)}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button size="sm" onClick={() => save(false)} disabled={busy}>
                  {busy ? (
                    <Loader2Icon className="size-3.5 animate-spin" />
                  ) : null}
                  Save plan
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => save(true)}
                  disabled={busy}
                >
                  Move to Queue
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={remove}
                  disabled={busy}
                >
                  Remove from Stack
                </Button>
              </div>
            </div>
          </header>
          <div className="min-h-0 flex-1 overflow-y-auto">
            <section className="border-b border-border/60 p-4">
              <TrelloCardBody
                card={active.cardSnapshot}
                members={snapshot.cache.members}
                showTitle
              />
            </section>
            <section className="bg-muted/10 p-4">
              <div className="mb-4">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  AI planning inputs
                </h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  Add notes and guidance for the agent. These fields are
                  included in the prompt when the job runs from the queue.
                </p>
              </div>
              <PlanEditor plan={plan} onChange={setPlan} />
            </section>
          </div>
        </div>
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
  const [parallelism, setParallelism] = useState(
    String(snapshot.queue.parallelism || 1),
  );
  const projects = useStore(useShallow(selectProjectsAcrossEnvironments));
  const settings = useSettings();
  const [projectId, setProjectId] = useState<ProjectId | "">(
    projects[0]?.id ?? "",
  );
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
          <span className="block text-xs font-medium text-muted-foreground">
            Parallelism
          </span>
          <NativeSelect
            className="w-auto min-w-16"
            value={parallelism}
            onChange={(event) => setParallelism(event.target.value)}
          >
            {[1, 2, 3, 4].map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </NativeSelect>
        </label>
        <label className="min-w-72 space-y-1">
          <span className="block text-xs font-medium text-muted-foreground">
            Project
          </span>
          <NativeSelect
            value={projectId}
            onChange={(event) => setProjectId(event.target.value as ProjectId)}
          >
            {projects.map((project) => (
              <option
                key={`${project.environmentId}:${project.id}`}
                value={project.id}
              >
                {project.name}
              </option>
            ))}
          </NativeSelect>
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
                jobs.map((job) => (
                  <JobRow key={job.jobId} job={job} reload={reload} compact />
                ))
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
  if (snapshot.queue.jobs.length === 0)
    return <EmptyState text="No Trello job runs yet." />;
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
          <h3 className="truncate text-sm font-medium">
            {job.cardSnapshot.name}
          </h3>
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
          <MetaRow
            label="Worktree"
            value={job.worktreePath ?? "Not assigned"}
          />
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
              {[
                ...job.logs,
                ...job.errors.map((error) => `ERROR: ${error}`),
              ].join("\n") || "No logs yet."}
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

const planFieldHints: Readonly<
  Record<
    keyof TrelloImplementationPlan,
    { readonly label: string; readonly hint: string }
  >
> = {
  overview: {
    label: "Overview",
    hint: "Summarize what this ticket is about and the intended outcome.",
  },
  implementationNotes: {
    label: "Implementation notes",
    hint: "Technical approach, files to touch, patterns to follow, or constraints.",
  },
  questions: {
    label: "Questions",
    hint: "Open questions the agent should resolve or flag before proceeding.",
  },
  risks: {
    label: "Risks",
    hint: "Edge cases, regressions, or areas that need extra care.",
  },
  acceptanceCriteria: {
    label: "Acceptance criteria",
    hint: "What must be true for this ticket to be considered done.",
  },
  testInstructions: {
    label: "Test instructions",
    hint: "How to verify the change — commands, flows, or scenarios to run.",
  },
  environmentNotes: {
    label: "Environment notes",
    hint: "Ports, env vars, seed data, or setup the agent should know about.",
  },
};

function PlanEditor({
  plan,
  onChange,
}: {
  readonly plan: TrelloImplementationPlan;
  readonly onChange: (plan: TrelloImplementationPlan) => void;
}) {
  const fields = Object.entries(planFieldHints) as ReadonlyArray<
    [
      keyof TrelloImplementationPlan,
      (typeof planFieldHints)[keyof TrelloImplementationPlan],
    ]
  >;
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {fields.map(([key, { label, hint }]) => (
        <label key={key} className="space-y-1.5">
          <span className="text-xs font-medium text-foreground">{label}</span>
          <span className="block text-[11px] text-muted-foreground">
            {hint}
          </span>
          <Textarea
            value={plan[key]}
            onChange={(event) =>
              onChange({ ...plan, [key]: event.target.value })
            }
            className="min-h-24"
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
  readonly children: ReactNode;
}) {
  return (
    <section>
      <h3 className="mb-2 text-xs font-semibold uppercase text-muted-foreground">
        {title}
      </h3>
      <div className="whitespace-pre-wrap text-sm text-foreground/85">
        {children}
      </div>
    </section>
  );
}

function MetaRow({
  label,
  value,
}: {
  readonly label: string;
  readonly value: string;
}) {
  return (
    <div>
      <div className="text-[11px] font-medium uppercase text-muted-foreground">
        {label}
      </div>
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
