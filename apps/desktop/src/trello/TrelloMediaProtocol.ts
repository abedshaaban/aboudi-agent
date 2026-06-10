import * as Context from "effect/Context";
import * as Data from "effect/Data";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Scope from "effect/Scope";

import {
  appendTrelloAuthParams,
  buildTrelloAssetFetchTargets,
  buildTrelloMembersAvatarFetchTargets,
  parseTrelloMediaRequestUrl,
  TRELLO_MEDIA_SCHEME,
  type TrelloMediaFetchTarget,
  type TrelloMediaRequest,
} from "@t3tools/shared/trelloMediaUrl";
import * as Electron from "electron";

import * as DesktopTrelloWorkflow from "./DesktopTrelloWorkflow.ts";

export class TrelloMediaProtocolRegistrationError extends Data.TaggedError(
  "TrelloMediaProtocolRegistrationError",
)<{
  readonly cause: unknown;
}> {
  override get message() {
    return "Failed to register Trello media protocol.";
  }
}

export interface TrelloMediaProtocolShape {
  readonly register: Effect.Effect<void, TrelloMediaProtocolRegistrationError, Scope.Scope>;
}

export class TrelloMediaProtocol extends Context.Service<
  TrelloMediaProtocol,
  TrelloMediaProtocolShape
>()("@t3tools/desktop/trello/TrelloMediaProtocol") {}

const registerSchemePrivileges = Effect.sync(() => {
  Electron.protocol.registerSchemesAsPrivileged([
    {
      scheme: TRELLO_MEDIA_SCHEME,
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        corsEnabled: true,
        stream: true,
      },
    },
  ]);
}).pipe(Effect.withSpan("desktop.trello.protocol.registerSchemePrivileges"));

export const layerSchemePrivileges = Layer.effectDiscard(registerSchemePrivileges);

async function fetchFirstOk(targets: readonly TrelloMediaFetchTarget[]) {
  let lastResponse: Response | null = null;
  for (const target of targets) {
    const response = await Electron.net.fetch(target.url, {
      ...(target.headers ? { headers: target.headers } : {}),
      redirect: "follow",
    });
    lastResponse = response;
    if (response.ok) return response;
  }
  return lastResponse ?? new Response("Failed to fetch Trello media", { status: 502 });
}

async function resolveMediaFetchTargets(
  mediaRequest: TrelloMediaRequest,
  apiKey: string,
  token: string,
): Promise<readonly TrelloMediaFetchTarget[]> {
  if (mediaRequest.kind === "member-avatar") {
    const targets = [
      ...buildTrelloMembersAvatarFetchTargets({ memberId: mediaRequest.memberId, apiKey, token }),
    ];
    try {
      const memberResponse = await Electron.net.fetch(
        appendTrelloAuthParams(
          `https://api.trello.com/1/members/${mediaRequest.memberId}?fields=avatarHash,nonPublic`,
          apiKey,
          token,
        ),
      );
      if (memberResponse.ok) {
        const member = (await memberResponse.json()) as {
          avatarHash?: string | null;
          nonPublic?: { avatarHash?: string | null } | null;
        };
        const avatarHash = member.nonPublic?.avatarHash ?? member.avatarHash ?? null;
        for (const target of buildTrelloMembersAvatarFetchTargets({
          memberId: mediaRequest.memberId,
          avatarHash,
          apiKey,
          token,
        })) {
          if (!targets.some((candidate) => candidate.url === target.url)) {
            targets.push(target);
          }
        }
      }
    } catch {
      // Fall back to the member avatar API route.
    }
    return targets;
  }

  return buildTrelloAssetFetchTargets(mediaRequest.sourceUrl, apiKey, token);
}

const make = Effect.gen(function* () {
  const trello = yield* DesktopTrelloWorkflow.DesktopTrelloWorkflow;
  const runtimeContext = yield* Effect.context<never>();
  const runPromise = Effect.runPromiseWith(runtimeContext);

  const register = Effect.acquireRelease(
    Effect.try({
      try: () => {
        Electron.protocol.handle(TRELLO_MEDIA_SCHEME, async (request) => {
          const mediaRequest = parseTrelloMediaRequestUrl(request.url);
          if (!mediaRequest) {
            return new Response("Invalid Trello media URL", { status: 400 });
          }

          try {
            const { apiKey, token } = await runPromise(trello.getCredentials());
            if (!apiKey || !token) {
              return new Response("Trello credentials are not configured", { status: 401 });
            }

            const fetchTargets = await resolveMediaFetchTargets(mediaRequest, apiKey, token);
            const response = await fetchFirstOk(fetchTargets);
            const contentType = response.headers.get("content-type") ?? "application/octet-stream";
            return new Response(response.body, {
              status: response.status,
              headers: {
                "Content-Type": contentType,
                "Cache-Control": "private, max-age=3600",
              },
            });
          } catch {
            return new Response("Failed to fetch Trello media", { status: 502 });
          }
        });
      },
      catch: (cause) => new TrelloMediaProtocolRegistrationError({ cause }),
    }),
    () =>
      Effect.sync(() => {
        Electron.protocol.unhandle(TRELLO_MEDIA_SCHEME);
      }),
  );

  return TrelloMediaProtocol.of({ register });
});

export const layer = Layer.effect(TrelloMediaProtocol, make);
