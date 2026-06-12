import { useCallback, useMemo } from "react";
import * as Schema from "effect/Schema";

import { useLocalStorage } from "./hooks/useLocalStorage";

export const TRELLO_BOARD_UI_STATE_STORAGE_KEY = "t3code:trello-board-ui:v1";

const TrelloBoardUiStateSchema = Schema.Struct({
  collapsedListIdsByBoardId: Schema.Record(Schema.String, Schema.Array(Schema.String)),
});

type TrelloBoardUiState = typeof TrelloBoardUiStateSchema.Type;

const emptyState: TrelloBoardUiState = {
  collapsedListIdsByBoardId: {},
};

export function useTrelloBoardCollapsedLists(boardId: string | null) {
  const [state, setState] = useLocalStorage(
    TRELLO_BOARD_UI_STATE_STORAGE_KEY,
    emptyState,
    TrelloBoardUiStateSchema,
  );

  const collapsedListIds = useMemo(() => {
    if (!boardId) return new Set<string>();
    return new Set(state.collapsedListIdsByBoardId[boardId] ?? []);
  }, [boardId, state.collapsedListIdsByBoardId]);

  const isListCollapsed = useCallback(
    (listId: string) => collapsedListIds.has(listId),
    [collapsedListIds],
  );

  const setListCollapsed = useCallback(
    (listId: string, collapsed: boolean) => {
      if (!boardId) return;
      setState((prev) => {
        const current = new Set(prev.collapsedListIdsByBoardId[boardId] ?? []);
        if (collapsed) {
          current.add(listId);
        } else {
          current.delete(listId);
        }
        const nextIds = [...current];
        const nextByBoard = { ...prev.collapsedListIdsByBoardId };
        if (nextIds.length === 0) {
          delete nextByBoard[boardId];
        } else {
          nextByBoard[boardId] = nextIds;
        }
        return { collapsedListIdsByBoardId: nextByBoard };
      });
    },
    [boardId, setState],
  );

  const toggleListCollapsed = useCallback(
    (listId: string) => {
      setListCollapsed(listId, !collapsedListIds.has(listId));
    },
    [collapsedListIds, setListCollapsed],
  );

  return { collapsedListIds, isListCollapsed, setListCollapsed, toggleListCollapsed };
}
