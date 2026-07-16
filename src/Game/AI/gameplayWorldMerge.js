const ownershipOverrides = (world) => {
  const value = world?.regionOwnershipOverrides;
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
};

const hasOwn = (value, key) => Object.prototype.hasOwnProperty.call(value, key);

// The simulation starts from baseWorld and may run for minutes. Preserve its
// ownership changes, then replay newer live changes (such as an army capture)
// so the stale snapshot cannot overwrite them when the turn is finally saved.
export const mergeLiveRegionOwnership = ({ baseWorld, liveWorld, simulatedWorld }) => {
  const baseOverrides = ownershipOverrides(baseWorld);
  const liveOverrides = ownershipOverrides(liveWorld);
  const mergedOverrides = { ...ownershipOverrides(simulatedWorld) };
  const liveRegionIds = new Set([
    ...Object.keys(baseOverrides),
    ...Object.keys(liveOverrides),
  ]);

  for (const regionId of liveRegionIds) {
    const baseHasRegion = hasOwn(baseOverrides, regionId);
    const liveHasRegion = hasOwn(liveOverrides, regionId);
    const changedSinceSnapshot = baseHasRegion !== liveHasRegion ||
      (liveHasRegion && liveOverrides[regionId] !== baseOverrides[regionId]);
    if (!changedSinceSnapshot) continue;

    if (liveHasRegion) {
      mergedOverrides[regionId] = liveOverrides[regionId];
    } else {
      delete mergedOverrides[regionId];
    }
  }

  return {
    ...simulatedWorld,
    regionOwnershipOverrides: mergedOverrides,
  };
};

const unitList = (world) => (Array.isArray(world?.units) ? world.units : []);
const unitId = (unit) => String(unit?.id ?? "").trim();
const comparableUnit = (unit) => {
  const { createdAt: _createdAt, updatedAt: _updatedAt, ...gameplayState } = unit ?? {};
  return gameplayState;
};
const sameUnit = (left, right) =>
  JSON.stringify(comparableUnit(left)) === JSON.stringify(comparableUnit(right));

const mergeLiveUnits = ({ baseWorld, liveWorld, simulatedWorld }) => {
  const baseUnits = unitList(baseWorld);
  const liveUnits = unitList(liveWorld);
  const simulatedUnits = unitList(simulatedWorld);
  const baseById = new Map(baseUnits.map((unit) => [unitId(unit), unit]).filter(([id]) => id));
  const liveById = new Map(liveUnits.map((unit) => [unitId(unit), unit]).filter(([id]) => id));
  const changedLiveIds = new Set();

  for (const id of new Set([...baseById.keys(), ...liveById.keys()])) {
    if (!baseById.has(id) || !liveById.has(id) || !sameUnit(baseById.get(id), liveById.get(id))) {
      changedLiveIds.add(id);
    }
  }

  const emittedLiveIds = new Set();
  const mergedUnits = simulatedUnits.flatMap((unit) => {
    const id = unitId(unit);
    if (!id || !changedLiveIds.has(id)) return [unit];
    if (!liveById.has(id)) return [];
    emittedLiveIds.add(id);
    return [liveById.get(id)];
  });

  for (const unit of liveUnits) {
    const id = unitId(unit);
    if (id && changedLiveIds.has(id) && !emittedLiveIds.has(id)) {
      mergedUnits.push(unit);
      emittedLiveIds.add(id);
    }
  }

  return mergedUnits;
};

export const mergeLiveWorldState = ({ baseWorld, liveWorld, simulatedWorld }) => {
  const regionMergedWorld = mergeLiveRegionOwnership({ baseWorld, liveWorld, simulatedWorld });
  return {
    ...regionMergedWorld,
    units: mergeLiveUnits({ baseWorld, liveWorld, simulatedWorld }),
  };
};

const actionList = (actions) => (Array.isArray(actions) ? actions : []);
const actionId = (action) => String(action?.id ?? "").trim();
const comparableAction = (action) => {
  const { createdAt: _createdAt, updatedAt: _updatedAt, ...gameplayState } = action ?? {};
  return gameplayState;
};
const sameAction = (left, right) =>
  JSON.stringify(comparableAction(left)) === JSON.stringify(comparableAction(right));

// The simulation resolves only the actions present in its starting snapshot.
// Preserve actions queued, edited or deleted while the model was generating,
// while retaining the simulation's resolved status for untouched base actions.
export const mergeLiveActions = ({ baseActions, liveActions, simulatedActions }) => {
  const base = actionList(baseActions);
  const live = actionList(liveActions);
  const simulated = actionList(simulatedActions);
  const baseById = new Map(base.map((action) => [actionId(action), action]).filter(([id]) => id));
  const liveById = new Map(live.map((action) => [actionId(action), action]).filter(([id]) => id));
  const changedLiveIds = new Set();

  for (const id of new Set([...baseById.keys(), ...liveById.keys()])) {
    if (!baseById.has(id) || !liveById.has(id) || !sameAction(baseById.get(id), liveById.get(id))) {
      changedLiveIds.add(id);
    }
  }

  const emittedLiveIds = new Set();
  const merged = simulated.flatMap((action) => {
    const id = actionId(action);
    if (!id || !changedLiveIds.has(id)) return [action];
    if (!liveById.has(id)) return [];
    emittedLiveIds.add(id);
    return [liveById.get(id)];
  });

  for (const action of live) {
    const id = actionId(action);
    if (id && changedLiveIds.has(id) && !emittedLiveIds.has(id)) {
      merged.push(action);
      emittedLiveIds.add(id);
    }
  }

  return merged;
};
