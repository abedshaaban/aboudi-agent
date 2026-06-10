import { assert, describe, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";

import * as NetService from "@t3tools/shared/Net";

import { resolveDesktopBackendPort } from "./DesktopApp.ts";

const netLayer = (
  canListenOnHost: NetService.NetServiceShape["canListenOnHost"],
): Layer.Layer<NetService.NetService> =>
  Layer.succeed(NetService.NetService, {
    canListenOnHost,
    isPortAvailableOnLoopback: () => Effect.die("unexpected loopback availability check"),
    reserveLoopbackPort: () => Effect.die("unexpected loopback port reservation"),
    findAvailablePort: () => Effect.die("unexpected available port lookup"),
  });

describe("DesktopApp", () => {
  it.effect("uses a configured backend port only when every desktop bind host is available", () =>
    Effect.gen(function* () {
      const checkedHosts: Array<string> = [];

      const selection = yield* resolveDesktopBackendPort(Option.some(13_773)).pipe(
        Effect.provide(
          netLayer((_port, host) =>
            Effect.sync(() => {
              checkedHosts.push(host);
              return true;
            }),
          ),
        ),
      );

      assert.deepEqual(selection, {
        port: 13_773,
        selectedByScan: false,
      });
      assert.deepEqual(checkedHosts, ["127.0.0.1", "0.0.0.0", "::"]);
    }),
  );

  it.effect("fails before spawning when the configured backend port is already occupied", () =>
    Effect.gen(function* () {
      const error = yield* resolveDesktopBackendPort(Option.some(13_773)).pipe(
        Effect.provide(netLayer((_port, host) => Effect.succeed(host !== "0.0.0.0"))),
        Effect.flip,
      );

      assert.equal(error._tag, "ConfiguredDesktopBackendPortUnavailableError");
      if (error._tag !== "ConfiguredDesktopBackendPortUnavailableError") {
        throw new Error(`Unexpected backend port error: ${error._tag}`);
      }
      assert.equal(error.port, 13_773);
      assert.deepEqual(error.hosts, ["127.0.0.1", "0.0.0.0", "::"]);
    }),
  );

  it.effect("scans from the default backend port when no port is configured", () =>
    Effect.gen(function* () {
      const checked: Array<readonly [number, string]> = [];

      const selection = yield* resolveDesktopBackendPort(Option.none()).pipe(
        Effect.provide(
          netLayer((port, host) =>
            Effect.sync(() => {
              checked.push([port, host]);
              return port === 3_774;
            }),
          ),
        ),
      );

      assert.deepEqual(selection, {
        port: 3_774,
        selectedByScan: true,
      });
      assert.deepEqual(checked, [
        [3_773, "127.0.0.1"],
        [3_774, "127.0.0.1"],
        [3_774, "0.0.0.0"],
        [3_774, "::"],
      ]);
    }),
  );
});
