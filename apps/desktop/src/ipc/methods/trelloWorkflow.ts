import {
  TrelloAddToStackInput,
  TrelloBulkMoveReadyToQueueResult,
  TrelloRemoveFromStackInput,
  TrelloListBoardsResult,
  TrelloJobIdInput,
  TrelloMoveToQueueInput,
  TrelloQueueControlInput,
  TrelloQueueJob,
  TrelloQueueStatus,
  TrelloReorderStackInput,
  TrelloSettingsUpdateInput,
  TrelloStackItem,
  TrelloStartQueueInput,
  TrelloSyncResult,
  TrelloTestConnectionResult,
  TrelloUpdateStackItemInput,
  TrelloWorkflowSnapshot,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";

import * as DesktopTrelloWorkflow from "../../trello/DesktopTrelloWorkflow.ts";
import * as IpcChannels from "../channels.ts";
import { makeIpcMethod } from "../DesktopIpc.ts";

export const trelloGetSnapshot = makeIpcMethod({
  channel: IpcChannels.TRELLO_GET_SNAPSHOT_CHANNEL,
  payload: Schema.Void,
  result: TrelloWorkflowSnapshot,
  handler: Effect.fn("desktop.ipc.trello.getSnapshot")(function* () {
    const trello = yield* DesktopTrelloWorkflow.DesktopTrelloWorkflow;
    return yield* trello.getSnapshot();
  }),
});

export const trelloUpdateSettings = makeIpcMethod({
  channel: IpcChannels.TRELLO_UPDATE_SETTINGS_CHANNEL,
  payload: TrelloSettingsUpdateInput,
  result: TrelloWorkflowSnapshot,
  handler: Effect.fn("desktop.ipc.trello.updateSettings")(function* (input) {
    const trello = yield* DesktopTrelloWorkflow.DesktopTrelloWorkflow;
    return yield* trello.updateSettings(input);
  }),
});

export const trelloListBoards = makeIpcMethod({
  channel: IpcChannels.TRELLO_LIST_BOARDS_CHANNEL,
  payload: Schema.Void,
  result: TrelloListBoardsResult,
  handler: Effect.fn("desktop.ipc.trello.listBoards")(function* () {
    const trello = yield* DesktopTrelloWorkflow.DesktopTrelloWorkflow;
    return yield* trello.listBoards();
  }),
});

export const trelloTestConnection = makeIpcMethod({
  channel: IpcChannels.TRELLO_TEST_CONNECTION_CHANNEL,
  payload: Schema.Void,
  result: TrelloTestConnectionResult,
  handler: Effect.fn("desktop.ipc.trello.testConnection")(function* () {
    const trello = yield* DesktopTrelloWorkflow.DesktopTrelloWorkflow;
    return yield* trello.testConnection();
  }),
});

export const trelloSyncBoard = makeIpcMethod({
  channel: IpcChannels.TRELLO_SYNC_BOARD_CHANNEL,
  payload: Schema.Void,
  result: TrelloSyncResult,
  handler: Effect.fn("desktop.ipc.trello.syncBoard")(function* () {
    const trello = yield* DesktopTrelloWorkflow.DesktopTrelloWorkflow;
    return yield* trello.syncBoard();
  }),
});

export const trelloAddToStack = makeIpcMethod({
  channel: IpcChannels.TRELLO_ADD_TO_STACK_CHANNEL,
  payload: TrelloAddToStackInput,
  result: TrelloStackItem,
  handler: Effect.fn("desktop.ipc.trello.addToStack")(function* (input) {
    const trello = yield* DesktopTrelloWorkflow.DesktopTrelloWorkflow;
    return yield* trello.addToStack(input);
  }),
});

export const trelloRemoveFromStack = makeIpcMethod({
  channel: IpcChannels.TRELLO_REMOVE_FROM_STACK_CHANNEL,
  payload: TrelloRemoveFromStackInput,
  result: Schema.Void,
  handler: Effect.fn("desktop.ipc.trello.removeFromStack")(function* (input) {
    const trello = yield* DesktopTrelloWorkflow.DesktopTrelloWorkflow;
    yield* trello.removeFromStack(input);
  }),
});

export const trelloUpdateStackItem = makeIpcMethod({
  channel: IpcChannels.TRELLO_UPDATE_STACK_ITEM_CHANNEL,
  payload: TrelloUpdateStackItemInput,
  result: TrelloStackItem,
  handler: Effect.fn("desktop.ipc.trello.updateStackItem")(function* (input) {
    const trello = yield* DesktopTrelloWorkflow.DesktopTrelloWorkflow;
    return yield* trello.updateStackItem(input);
  }),
});

export const trelloMoveToQueue = makeIpcMethod({
  channel: IpcChannels.TRELLO_MOVE_TO_QUEUE_CHANNEL,
  payload: TrelloMoveToQueueInput,
  result: TrelloQueueJob,
  handler: Effect.fn("desktop.ipc.trello.moveToQueue")(function* (input) {
    const trello = yield* DesktopTrelloWorkflow.DesktopTrelloWorkflow;
    return yield* trello.moveToQueue(input);
  }),
});

export const trelloReorderStack = makeIpcMethod({
  channel: IpcChannels.TRELLO_REORDER_STACK_CHANNEL,
  payload: TrelloReorderStackInput,
  result: Schema.Array(TrelloStackItem),
  handler: Effect.fn("desktop.ipc.trello.reorderStack")(function* (input) {
    const trello = yield* DesktopTrelloWorkflow.DesktopTrelloWorkflow;
    return yield* trello.reorderStack(input);
  }),
});

export const trelloBulkMoveReadyToQueue = makeIpcMethod({
  channel: IpcChannels.TRELLO_BULK_MOVE_READY_TO_QUEUE_CHANNEL,
  payload: Schema.Void,
  result: TrelloBulkMoveReadyToQueueResult,
  handler: Effect.fn("desktop.ipc.trello.bulkMoveReadyToQueue")(function* () {
    const trello = yield* DesktopTrelloWorkflow.DesktopTrelloWorkflow;
    return yield* trello.bulkMoveReadyToQueue();
  }),
});

export const trelloStartQueue = makeIpcMethod({
  channel: IpcChannels.TRELLO_START_QUEUE_CHANNEL,
  payload: TrelloStartQueueInput,
  result: TrelloQueueStatus,
  handler: Effect.fn("desktop.ipc.trello.startQueue")(function* (input) {
    const trello = yield* DesktopTrelloWorkflow.DesktopTrelloWorkflow;
    return yield* trello.startQueue(input);
  }),
});

export const trelloStopQueue = makeIpcMethod({
  channel: IpcChannels.TRELLO_STOP_QUEUE_CHANNEL,
  payload: TrelloQueueControlInput,
  result: TrelloQueueStatus,
  handler: Effect.fn("desktop.ipc.trello.stopQueue")(function* (input) {
    const trello = yield* DesktopTrelloWorkflow.DesktopTrelloWorkflow;
    return yield* trello.stopQueue(input);
  }),
});

export const trelloPauseQueue = makeIpcMethod({
  channel: IpcChannels.TRELLO_PAUSE_QUEUE_CHANNEL,
  payload: TrelloQueueControlInput,
  result: TrelloQueueStatus,
  handler: Effect.fn("desktop.ipc.trello.pauseQueue")(function* (input) {
    const trello = yield* DesktopTrelloWorkflow.DesktopTrelloWorkflow;
    return yield* trello.pauseQueue(input);
  }),
});

export const trelloRetryJob = makeIpcMethod({
  channel: IpcChannels.TRELLO_RETRY_JOB_CHANNEL,
  payload: TrelloJobIdInput,
  result: TrelloQueueJob,
  handler: Effect.fn("desktop.ipc.trello.retryJob")(function* (input) {
    const trello = yield* DesktopTrelloWorkflow.DesktopTrelloWorkflow;
    return yield* trello.retryJob(input);
  }),
});

export const trelloRemoveJob = makeIpcMethod({
  channel: IpcChannels.TRELLO_REMOVE_JOB_CHANNEL,
  payload: TrelloJobIdInput,
  result: Schema.Void,
  handler: Effect.fn("desktop.ipc.trello.removeJob")(function* (input) {
    const trello = yield* DesktopTrelloWorkflow.DesktopTrelloWorkflow;
    yield* trello.removeJob(input);
  }),
});

export const trelloCleanupJob = makeIpcMethod({
  channel: IpcChannels.TRELLO_CLEANUP_JOB_CHANNEL,
  payload: TrelloJobIdInput,
  result: TrelloQueueJob,
  handler: Effect.fn("desktop.ipc.trello.cleanupJob")(function* (input) {
    const trello = yield* DesktopTrelloWorkflow.DesktopTrelloWorkflow;
    return yield* trello.cleanupJob(input);
  }),
});
