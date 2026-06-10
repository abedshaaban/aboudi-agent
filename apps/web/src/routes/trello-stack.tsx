import { createFileRoute } from "@tanstack/react-router";

import { TrelloWorkflow } from "../components/trello/TrelloWorkflow";

function parseTrelloStackRouteSearch(search: Record<string, unknown>) {
  const cardId =
    typeof search.cardId === "string" && search.cardId.trim().length > 0
      ? search.cardId.trim()
      : undefined;
  return cardId ? { cardId } : {};
}

function TrelloStackRoute() {
  const { cardId } = Route.useSearch();
  return <TrelloWorkflow section="stack" {...(cardId ? { stackCardId: cardId } : {})} />;
}

export const Route = createFileRoute("/trello-stack")({
  validateSearch: parseTrelloStackRouteSearch,
  component: TrelloStackRoute,
});
