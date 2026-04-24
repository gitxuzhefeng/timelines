import type { AppSwitch } from "../services/tauri";

export type SwimlaneState = "normal" | "weak" | "sparse";
export type SwimlaneRole = "main" | "support" | "interrupt" | "other";

export interface SwimlaneStats {
  appCount: number;
  averageDwellMs: number;
  interruptCount: number;
  loopCount: number;
}

export interface SwimlaneBlock {
  app: string;
  durationMs: number;
  endMs: number;
  role: SwimlaneRole;
  startMs: number;
  switchId: string;
  toApp: string;
}

export interface SwimlaneLane {
  app: string;
  blocks: SwimlaneBlock[];
  count: number;
  role: SwimlaneRole;
  totalDwellMs: number;
}

export interface SwimlaneTransition {
  atMs: number;
  fromApp: string;
  role: SwimlaneRole;
  switchId: string;
  switchType: string;
  toApp: string;
}

export interface SwimlaneModel {
  lanes: SwimlaneLane[];
  mainPair: [string, string] | null;
  recentSwitches: AppSwitch[];
  state: SwimlaneState;
  stats: SwimlaneStats;
  transitions: SwimlaneTransition[];
  windowEndMs: number;
  windowStartMs: number;
}

interface PairStat {
  apps: [string, string];
  count: number;
  lastSeenMs: number;
}

interface NodeStat {
  app: string;
  count: number;
  hasNotification: boolean;
  totalDwellMs: number;
}

const MIN_LOOP_EDGE_COUNT = 2;
const MIN_SWITCH_COUNT = 4;
const MAX_LANES = 4;

function normalizeAppName(name: string | null | undefined): string {
  const trimmed = (name ?? "").trim();
  return trimmed || "—";
}

function pairKey(a: string, b: string): string {
  return [a, b].sort((left, right) => left.localeCompare(right)).join("::");
}

function laneOrder(role: SwimlaneRole): number {
  switch (role) {
    case "main":
      return 0;
    case "support":
      return 1;
    case "interrupt":
      return 2;
    default:
      return 3;
  }
}

function scorePair(forward: number, backward: number): number {
  return 2 * Math.min(forward, backward) + Math.max(forward, backward);
}

function classifyRole(
  app: string,
  stat: NodeStat,
  mainPair: [string, string] | null,
  directed: Map<string, number>,
): SwimlaneRole {
  if (mainPair && (app === mainPair[0] || app === mainPair[1])) {
    return "main";
  }

  if (!mainPair) {
    return stat.hasNotification ? "interrupt" : "other";
  }

  if (stat.hasNotification) {
    return "interrupt";
  }

  const [mainA, mainB] = mainPair;
  const toA = directed.get(`${app}->${mainA}`) ?? 0;
  const fromA = directed.get(`${mainA}->${app}`) ?? 0;
  const toB = directed.get(`${app}->${mainB}`) ?? 0;
  const fromB = directed.get(`${mainB}->${app}`) ?? 0;
  const relatedCount = toA + fromA + toB + fromB;

  if (relatedCount >= 2) {
    return "support";
  }

  return "other";
}

function buildMainPair(switches: AppSwitch[]): [string, string] | null {
  const directed = new Map<string, number>();
  const pairStats = new Map<string, PairStat>();

  for (const switchRow of switches) {
    const fromApp = normalizeAppName(switchRow.fromApp);
    const toApp = normalizeAppName(switchRow.toApp);
    if (fromApp === toApp) continue;

    const directionKey = `${fromApp}->${toApp}`;
    directed.set(directionKey, (directed.get(directionKey) ?? 0) + 1);

    const key = pairKey(fromApp, toApp);
    const pair = pairStats.get(key) ?? {
      apps: [fromApp, toApp].sort((left, right) => left.localeCompare(right)) as [string, string],
      count: 0,
      lastSeenMs: 0,
    };
    pair.count += 1;
    pair.lastSeenMs = Math.max(pair.lastSeenMs, switchRow.timestampMs);
    pairStats.set(key, pair);
  }

  let winner: { apps: [string, string]; score: number; lastSeenMs: number } | null = null;

  for (const pair of pairStats.values()) {
    const [appA, appB] = pair.apps;
    const forward = directed.get(`${appA}->${appB}`) ?? 0;
    const backward = directed.get(`${appB}->${appA}`) ?? 0;
    if (Math.min(forward, backward) < MIN_LOOP_EDGE_COUNT) continue;

    const score = scorePair(forward, backward);
    if (
      !winner ||
      score > winner.score ||
      (score === winner.score && pair.lastSeenMs > winner.lastSeenMs)
    ) {
      winner = {
        apps: pair.apps,
        score,
        lastSeenMs: pair.lastSeenMs,
      };
    }
  }

  return winner?.apps ?? null;
}

export function buildSwimlaneModel(
  rawSwitches: AppSwitch[],
  windowMin: number,
  nowMs = Date.now(),
): SwimlaneModel {
  const normalizedSwitches = [...rawSwitches]
    .map((switchRow) => ({
      ...switchRow,
      fromApp: normalizeAppName(switchRow.fromApp),
      toApp: normalizeAppName(switchRow.toApp),
      fromSessionDurationMs: Math.max(switchRow.fromSessionDurationMs ?? 0, 0),
    }))
    .sort((left, right) => left.timestampMs - right.timestampMs);

  const windowEndMs = normalizedSwitches.length > 0
    ? normalizedSwitches[normalizedSwitches.length - 1].timestampMs
    : nowMs;
  const windowStartMs = windowEndMs - windowMin * 60_000;

  if (normalizedSwitches.length < MIN_SWITCH_COUNT) {
    return {
      lanes: [],
      mainPair: null,
      recentSwitches: [...normalizedSwitches].sort((left, right) => right.timestampMs - left.timestampMs),
      state: "sparse",
      stats: {
        appCount: new Set(normalizedSwitches.flatMap((s) => [s.fromApp, s.toApp])).size,
        averageDwellMs: Math.round(
          normalizedSwitches.reduce((sum, row) => sum + row.fromSessionDurationMs, 0) /
            Math.max(normalizedSwitches.length, 1),
        ),
        interruptCount: normalizedSwitches.filter((s) => s.switchType === "notification").length,
        loopCount: 0,
      },
      transitions: [],
      windowEndMs,
      windowStartMs,
    };
  }

  const mainPair = buildMainPair(normalizedSwitches);
  const directed = new Map<string, number>();
  const nodeStats = new Map<string, NodeStat>();

  for (const switchRow of normalizedSwitches) {
    const directionKey = `${switchRow.fromApp}->${switchRow.toApp}`;
    directed.set(directionKey, (directed.get(directionKey) ?? 0) + 1);

    const fromStat = nodeStats.get(switchRow.fromApp) ?? {
      app: switchRow.fromApp,
      count: 0,
      hasNotification: false,
      totalDwellMs: 0,
    };
    fromStat.count += 1;
    fromStat.totalDwellMs += switchRow.fromSessionDurationMs;
    fromStat.hasNotification ||= switchRow.switchType === "notification";
    nodeStats.set(switchRow.fromApp, fromStat);

    const toStat = nodeStats.get(switchRow.toApp) ?? {
      app: switchRow.toApp,
      count: 0,
      hasNotification: false,
      totalDwellMs: 0,
    };
    toStat.count += 1;
    toStat.hasNotification ||= switchRow.switchType === "notification";
    nodeStats.set(switchRow.toApp, toStat);
  }

  const rankedNodes = [...nodeStats.values()]
    .map((stat) => ({
      ...stat,
      role: classifyRole(stat.app, stat, mainPair, directed),
    }))
    .sort((left, right) => {
      const roleDiff = laneOrder(left.role) - laneOrder(right.role);
      if (roleDiff !== 0) return roleDiff;
      if (right.count !== left.count) return right.count - left.count;
      return left.app.localeCompare(right.app);
    });

  const selectedNodes = rankedNodes.slice(0, MAX_LANES);
  const selectedApps = new Set(selectedNodes.map((node) => node.app));
  const roleByApp = new Map<string, SwimlaneRole>();

  for (const node of rankedNodes) {
    roleByApp.set(node.app, selectedApps.has(node.app) ? node.role : "other");
  }

  const blockMap = new Map<string, SwimlaneBlock[]>();
  const transitions: SwimlaneTransition[] = [];

  for (const switchRow of normalizedSwitches) {
    const blockApp = selectedApps.has(switchRow.fromApp) ? switchRow.fromApp : "Other";
    const targetApp = selectedApps.has(switchRow.toApp) ? switchRow.toApp : "Other";
    const blockRole = blockApp === "Other" ? "other" : roleByApp.get(blockApp) ?? "other";

    const block: SwimlaneBlock = {
      app: blockApp,
      durationMs: switchRow.fromSessionDurationMs,
      endMs: switchRow.timestampMs,
      role: blockRole,
      startMs: Math.max(switchRow.timestampMs - switchRow.fromSessionDurationMs, windowStartMs),
      switchId: switchRow.id,
      toApp: targetApp,
    };

    const existing = blockMap.get(blockApp) ?? [];
    existing.push(block);
    blockMap.set(blockApp, existing);

    const fromRole = blockApp === "Other" ? "other" : roleByApp.get(blockApp) ?? "other";
    const toRole = targetApp === "Other" ? "other" : roleByApp.get(targetApp) ?? "other";
    const transitionRole: SwimlaneRole =
      fromRole === "main" && toRole === "main"
        ? "main"
        : switchRow.switchType === "notification" || fromRole === "interrupt" || toRole === "interrupt"
          ? "interrupt"
          : fromRole === "support" || toRole === "support"
            ? "support"
            : "other";

    transitions.push({
      atMs: switchRow.timestampMs,
      fromApp: blockApp,
      role: transitionRole,
      switchId: switchRow.id,
      switchType: switchRow.switchType,
      toApp: targetApp,
    });
  }

  const lanes = selectedNodes.map((node) => ({
    app: node.app,
    blocks: blockMap.get(node.app) ?? [],
    count: node.count,
    role: node.role,
    totalDwellMs: node.totalDwellMs,
  }));

  if (rankedNodes.length > MAX_LANES) {
    const otherBlocks = blockMap.get("Other") ?? [];
    const otherNode = rankedNodes.slice(MAX_LANES);
    lanes.push({
      app: `Other (${otherNode.length})`,
      blocks: otherBlocks,
      count: otherNode.reduce((sum, node) => sum + node.count, 0),
      role: "other",
      totalDwellMs: otherNode.reduce((sum, node) => sum + node.totalDwellMs, 0),
    });
  }

  lanes.sort((left, right) => {
    const roleDiff = laneOrder(left.role) - laneOrder(right.role);
    if (roleDiff !== 0) return roleDiff;
    if (right.count !== left.count) return right.count - left.count;
    return left.app.localeCompare(right.app);
  });

  const [mainA, mainB] = mainPair ?? [null, null];
  const loopCount =
    mainA && mainB
      ? normalizedSwitches.filter(
          (switchRow) =>
            (switchRow.fromApp === mainA && switchRow.toApp === mainB) ||
            (switchRow.fromApp === mainB && switchRow.toApp === mainA),
        ).length
      : 0;

  return {
    lanes,
    mainPair,
    recentSwitches: [...normalizedSwitches].sort((left, right) => right.timestampMs - left.timestampMs),
    state: mainPair ? "normal" : "weak",
    stats: {
      appCount: nodeStats.size,
      averageDwellMs: Math.round(
        normalizedSwitches.reduce((sum, row) => sum + row.fromSessionDurationMs, 0) /
          Math.max(normalizedSwitches.length, 1),
      ),
      interruptCount: normalizedSwitches.filter((switchRow) => switchRow.switchType === "notification").length,
      loopCount,
    },
    transitions,
    windowEndMs,
    windowStartMs,
  };
}
