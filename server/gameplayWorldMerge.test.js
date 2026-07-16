import assert from "node:assert/strict";
import { test } from "node:test";
import {
  mergeLiveActions,
  mergeLiveRegionOwnership,
  mergeLiveWorldState,
} from "../src/Game/AI/gameplayWorldMerge.js";
import { normalizeActions, normalizeWorldState } from "../src/runtime/gameState.js";

test("mergeLiveRegionOwnership preserves captures made after the AI snapshot and keeps simulation transfers", () => {
  const baseWorld = {
    notes: "snapshot",
    regionOwnershipOverrides: {
      "AI.1_1": "OLD",
      "CAP.1_1": "DEF",
    },
  };
  const simulatedWorld = {
    ...baseWorld,
    notes: "simulated",
    regionOwnershipOverrides: {
      ...baseWorld.regionOwnershipOverrides,
      "AI.1_1": "AI",
    },
  };
  const liveWorld = {
    ...baseWorld,
    regionOwnershipOverrides: {
      ...baseWorld.regionOwnershipOverrides,
      "CAP.1_1": "PLAYER",
    },
  };

  assert.deepEqual(
    mergeLiveRegionOwnership({ baseWorld, liveWorld, simulatedWorld }),
    {
      ...simulatedWorld,
      regionOwnershipOverrides: {
        "AI.1_1": "AI",
        "CAP.1_1": "PLAYER",
      },
    },
  );
});

test("mergeLiveRegionOwnership gives a concurrent live capture precedence on the same region", () => {
  const baseWorld = { regionOwnershipOverrides: { "BORDER.1_1": "DEF" } };
  const simulatedWorld = { regionOwnershipOverrides: { "BORDER.1_1": "AI" } };
  const liveWorld = { regionOwnershipOverrides: { "BORDER.1_1": "PLAYER" } };

  assert.deepEqual(
    mergeLiveRegionOwnership({ baseWorld, liveWorld, simulatedWorld }).regionOwnershipOverrides,
    { "BORDER.1_1": "PLAYER" },
  );
});

test("mergeLiveWorldState preserves concurrent army movement, deployment and routed-unit removal", () => {
  const baseArmy = {
    id: "army-1",
    ownerCode: "PLAYER",
    regionId: "HOME.1_1",
    status: "idle",
    strength: 500,
  };
  const routedDefender = {
    id: "defender-1",
    ownerCode: "DEF",
    regionId: "BORDER.1_1",
    status: "idle",
    strength: 100,
  };
  const aiSpawn = { id: "ai-new", ownerCode: "AI", regionId: "AI.1_1", strength: 80 };
  const playerSpawn = { id: "player-new", ownerCode: "PLAYER", regionId: "HOME.2_1", strength: 60 };
  const baseWorld = { units: [baseArmy, routedDefender] };
  const simulatedWorld = {
    units: [{ ...baseArmy, strength: 450 }, routedDefender, aiSpawn],
  };
  const liveArmy = {
    ...baseArmy,
    lat: 47.6,
    lng: 19.1,
    regionId: "BORDER.1_1",
    status: "engaged",
    strength: 407,
  };
  const liveWorld = { units: [liveArmy, playerSpawn] };

  assert.deepEqual(
    mergeLiveWorldState({ baseWorld, liveWorld, simulatedWorld }).units,
    [liveArmy, aiSpawn, playerSpawn],
  );
});

test("mergeLiveWorldState ignores synthesized timestamp churn on unchanged legacy units", () => {
  const baseArmy = {
    id: "legacy-army",
    ownerCode: "PLAYER",
    regionId: "HOME.1_1",
    status: "idle",
    strength: 500,
    createdAt: "2026-07-16T00:00:00.000Z",
    updatedAt: "2026-07-16T00:00:00.000Z",
  };
  const simulatedArmy = {
    ...baseArmy,
    status: "moving",
    strength: 450,
    updatedAt: "2026-07-16T00:05:00.000Z",
  };
  const liveArmy = {
    ...baseArmy,
    createdAt: "2026-07-16T00:10:00.000Z",
    updatedAt: "2026-07-16T00:10:00.000Z",
  };

  assert.deepEqual(
    mergeLiveWorldState({
      baseWorld: { units: [baseArmy] },
      liveWorld: { units: [liveArmy] },
      simulatedWorld: { units: [simulatedArmy] },
    }).units,
    [simulatedArmy],
  );
});

test("mergeLiveActions resolves snapshot orders while retaining orders queued during generation", () => {
  const baseOrder = {
    createdAt: "2026-07-16T00:00:00.000Z",
    id: "base-order",
    source: "manual",
    status: "planned",
    text: "Prepare the offensive",
  };
  const resolvedOrder = { ...baseOrder, status: "resolved" };
  const timestampOnlyLiveOrder = {
    ...baseOrder,
    createdAt: "2026-07-16T00:10:00.000Z",
  };
  const concurrentArmyOrder = {
    createdAt: "2026-07-16T00:11:00.000Z",
    id: "army-order",
    source: "order",
    status: "planned",
    text: "Move 1st Army into the frontier",
  };

  assert.deepEqual(
    mergeLiveActions({
      baseActions: [baseOrder],
      liveActions: [timestampOnlyLiveOrder, concurrentArmyOrder],
      simulatedActions: [resolvedOrder],
    }),
    [resolvedOrder, concurrentArmyOrder],
  );
});

test("legacy actions and units without ids receive deterministic merge identities", () => {
  const legacyActions = [{ status: "planned", text: "Hold the frontier" }];
  const legacyWorld = {
    units: [{ lat: 47.5, lng: 19, ownerCode: "PLY", strength: 100, type: "infantry" }],
  };

  assert.equal(normalizeActions(legacyActions)[0].id, normalizeActions(legacyActions)[0].id);
  assert.equal(
    normalizeWorldState(legacyWorld).units[0].id,
    normalizeWorldState(legacyWorld).units[0].id,
  );
});
