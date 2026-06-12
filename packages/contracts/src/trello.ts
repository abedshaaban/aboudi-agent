import * as Schema from "effect/Schema";

import {
  IsoDateTime,
  NonNegativeInt,
  PortSchema,
  ProjectId,
  ThreadId,
  TrimmedNonEmptyString,
  TrimmedString,
} from "./baseSchemas.ts";
import { ModelSelection } from "./orchestration.ts";

export const TrelloId = TrimmedNonEmptyString.pipe(Schema.brand("TrelloId"));
export type TrelloId = typeof TrelloId.Type;

export const TrelloWorkflowJobId = TrimmedNonEmptyString.pipe(Schema.brand("TrelloWorkflowJobId"));
export type TrelloWorkflowJobId = typeof TrelloWorkflowJobId.Type;

export const TrelloSettings = Schema.Struct({
  boardRef: TrimmedString,
  hasApiKey: Schema.Boolean,
  hasToken: Schema.Boolean,
  updatedAt: Schema.NullOr(IsoDateTime),
});
export type TrelloSettings = typeof TrelloSettings.Type;

export const TrelloSettingsUpdateInput = Schema.Struct({
  apiKey: Schema.optionalKey(TrimmedString),
  token: Schema.optionalKey(TrimmedString),
  boardRef: TrimmedString,
});
export type TrelloSettingsUpdateInput = typeof TrelloSettingsUpdateInput.Type;

export const TrelloBoardSummary = Schema.Struct({
  id: TrelloId,
  name: Schema.String,
  url: Schema.String,
  closed: Schema.Boolean,
});
export type TrelloBoardSummary = typeof TrelloBoardSummary.Type;

export const TrelloListBoardsResult = Schema.Struct({
  boards: Schema.Array(TrelloBoardSummary),
});
export type TrelloListBoardsResult = typeof TrelloListBoardsResult.Type;

export const TrelloLabel = Schema.Struct({
  id: TrelloId,
  name: Schema.String,
  color: Schema.NullOr(Schema.String),
});
export type TrelloLabel = typeof TrelloLabel.Type;

export const TrelloMember = Schema.Struct({
  id: TrelloId,
  fullName: Schema.String,
  username: Schema.String,
  avatarUrl: Schema.NullOr(Schema.String),
});
export type TrelloMember = typeof TrelloMember.Type;

export const TrelloAttachment = Schema.Struct({
  id: TrelloId,
  name: Schema.String,
  url: Schema.String,
  mimeType: Schema.NullOr(Schema.String),
  bytes: Schema.NullOr(Schema.Number),
  date: Schema.NullOr(IsoDateTime),
});
export type TrelloAttachment = typeof TrelloAttachment.Type;

export const TrelloChecklistItem = Schema.Struct({
  id: TrelloId,
  name: Schema.String,
  state: Schema.Literals(["complete", "incomplete"]),
});
export type TrelloChecklistItem = typeof TrelloChecklistItem.Type;

export const TrelloChecklist = Schema.Struct({
  id: TrelloId,
  name: Schema.String,
  items: Schema.Array(TrelloChecklistItem),
});
export type TrelloChecklist = typeof TrelloChecklist.Type;

export const TrelloComment = Schema.Struct({
  id: TrelloId,
  text: Schema.String,
  date: IsoDateTime,
  memberCreatorId: Schema.NullOr(TrelloId),
  memberCreatorName: Schema.NullOr(Schema.String),
});
export type TrelloComment = typeof TrelloComment.Type;

export const TrelloCard = Schema.Struct({
  id: TrelloId,
  idList: TrelloId,
  name: Schema.String,
  desc: Schema.String,
  url: Schema.String,
  closed: Schema.Boolean,
  labels: Schema.Array(TrelloLabel),
  idMembers: Schema.Array(TrelloId),
  comments: Schema.Array(TrelloComment),
  attachments: Schema.Array(TrelloAttachment),
  checklists: Schema.Array(TrelloChecklist),
  dateLastActivity: Schema.NullOr(IsoDateTime),
});
export type TrelloCard = typeof TrelloCard.Type;

export const TrelloList = Schema.Struct({
  id: TrelloId,
  name: Schema.String,
  closed: Schema.Boolean,
  pos: Schema.Number,
});
export type TrelloList = typeof TrelloList.Type;

export const TrelloBoard = Schema.Struct({
  id: TrelloId,
  name: Schema.String,
  url: Schema.String,
  desc: Schema.String,
});
export type TrelloBoard = typeof TrelloBoard.Type;

export const TrelloBoardCache = Schema.Struct({
  board: Schema.NullOr(TrelloBoard),
  lists: Schema.Array(TrelloList),
  cards: Schema.Array(TrelloCard),
  labels: Schema.Array(TrelloLabel),
  members: Schema.Array(TrelloMember),
  syncedAt: Schema.NullOr(IsoDateTime),
});
export type TrelloBoardCache = typeof TrelloBoardCache.Type;

export const TrelloImplementationPlan = Schema.Struct({
  overview: Schema.String,
  implementationNotes: Schema.String,
  questions: Schema.String,
  risks: Schema.String,
  acceptanceCriteria: Schema.String,
  testInstructions: Schema.String,
  environmentNotes: Schema.String,
});
export type TrelloImplementationPlan = typeof TrelloImplementationPlan.Type;

export const TrelloJobState = Schema.Literals([
  "selected",
  "planning",
  "ready_for_queue",
  "queued",
  "running",
  "waiting_for_user",
  "failed",
  "completed",
  "needs_review",
  "cleaned_up",
]);
export type TrelloJobState = typeof TrelloJobState.Type;

export const TrelloEnvAllocation = Schema.Struct({
  appPort: PortSchema,
  apiPort: PortSchema,
  databaseName: TrimmedNonEmptyString,
  databaseUrl: TrimmedNonEmptyString,
  envFilePath: TrimmedNonEmptyString,
  worktreePath: TrimmedNonEmptyString,
  allocatedAt: IsoDateTime,
});
export type TrelloEnvAllocation = typeof TrelloEnvAllocation.Type;

export const TrelloStackItem = Schema.Struct({
  jobId: TrelloWorkflowJobId,
  cardId: TrelloId,
  cardSnapshot: TrelloCard,
  plan: TrelloImplementationPlan,
  state: TrelloJobState,
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
});
export type TrelloStackItem = typeof TrelloStackItem.Type;

export const TrelloQueueJob = Schema.Struct({
  jobId: TrelloWorkflowJobId,
  stackItemId: TrelloWorkflowJobId,
  cardId: TrelloId,
  cardSnapshot: TrelloCard,
  plan: TrelloImplementationPlan,
  state: TrelloJobState,
  branchName: Schema.NullOr(Schema.String),
  worktreePath: Schema.NullOr(Schema.String),
  threadId: Schema.NullOr(ThreadId),
  envAllocation: Schema.NullOr(TrelloEnvAllocation),
  logs: Schema.Array(Schema.String),
  errors: Schema.Array(Schema.String),
  finalSummary: Schema.NullOr(Schema.String),
  changedFiles: Schema.Array(Schema.String),
  commandsRun: Schema.Array(Schema.String),
  blockers: Schema.Array(Schema.String),
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
  startedAt: Schema.NullOr(IsoDateTime),
  finishedAt: Schema.NullOr(IsoDateTime),
});
export type TrelloQueueJob = typeof TrelloQueueJob.Type;

export const TrelloQueueStatus = Schema.Struct({
  parallelism: NonNegativeInt,
  running: Schema.Boolean,
  jobs: Schema.Array(TrelloQueueJob),
});
export type TrelloQueueStatus = typeof TrelloQueueStatus.Type;

export const TrelloWorkflowSnapshot = Schema.Struct({
  settings: TrelloSettings,
  cache: TrelloBoardCache,
  stackItems: Schema.Array(TrelloStackItem),
  queue: TrelloQueueStatus,
});
export type TrelloWorkflowSnapshot = typeof TrelloWorkflowSnapshot.Type;

export const TrelloAddToStackInput = Schema.Struct({
  cardId: TrelloId,
});
export type TrelloAddToStackInput = typeof TrelloAddToStackInput.Type;

export const TrelloRemoveFromStackInput = Schema.Struct({
  cardId: TrelloId,
});
export type TrelloRemoveFromStackInput = typeof TrelloRemoveFromStackInput.Type;

export const TrelloUpdateStackItemInput = Schema.Struct({
  jobId: TrelloWorkflowJobId,
  plan: TrelloImplementationPlan,
  state: Schema.optionalKey(TrelloJobState),
});
export type TrelloUpdateStackItemInput = typeof TrelloUpdateStackItemInput.Type;

export const TrelloMoveToQueueInput = Schema.Struct({
  jobId: TrelloWorkflowJobId,
});
export type TrelloMoveToQueueInput = typeof TrelloMoveToQueueInput.Type;

export const TrelloReorderStackInput = Schema.Struct({
  jobIds: Schema.Array(TrelloWorkflowJobId),
});
export type TrelloReorderStackInput = typeof TrelloReorderStackInput.Type;

export const TrelloBulkMoveReadyToQueueResult = Schema.Struct({
  movedCount: NonNegativeInt,
});
export type TrelloBulkMoveReadyToQueueResult = typeof TrelloBulkMoveReadyToQueueResult.Type;

export const TrelloQueueControlInput = Schema.Struct({
  parallelism: Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 4 })),
});
export type TrelloQueueControlInput = typeof TrelloQueueControlInput.Type;

export const TrelloStartQueueInput = Schema.Struct({
  parallelism: Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 4 })),
  projectId: ProjectId,
  projectCwd: TrimmedNonEmptyString,
  baseBranch: TrimmedNonEmptyString,
  modelSelection: ModelSelection,
});
export type TrelloStartQueueInput = typeof TrelloStartQueueInput.Type;

export const TrelloJobIdInput = Schema.Struct({
  jobId: TrelloWorkflowJobId,
});
export type TrelloJobIdInput = typeof TrelloJobIdInput.Type;

export const TrelloTestConnectionResult = Schema.Struct({
  ok: Schema.Boolean,
  message: Schema.String,
});
export type TrelloTestConnectionResult = typeof TrelloTestConnectionResult.Type;

export const TrelloSyncResult = Schema.Struct({
  syncedAt: IsoDateTime,
  cardCount: NonNegativeInt,
  listCount: NonNegativeInt,
});
export type TrelloSyncResult = typeof TrelloSyncResult.Type;

export class TrelloWorkflowError extends Schema.TaggedErrorClass<TrelloWorkflowError>()(
  "TrelloWorkflowError",
  {
    reason: Schema.Literals([
      "invalid-settings",
      "trello-request-failed",
      "not-found",
      "persistence-failed",
      "queue-failed",
      "worktree-failed",
      "agent-start-failed",
      "env-allocation-failed",
      "invalid-state",
    ]),
    message: Schema.String,
  },
) {}
