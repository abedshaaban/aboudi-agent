import { createFileRoute } from "@tanstack/react-router";

import { TrelloWorkflow } from "../components/trello/TrelloWorkflow";

export const Route = createFileRoute("/trello-board")({
  component: () => <TrelloWorkflow section="board" />,
});
