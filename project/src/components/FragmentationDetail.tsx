import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { buildSwimlaneModel, type SwimlaneModel, type SwimlaneRole } from "../lib/fragmentationSwimlane";
import { useAppStore } from "../stores/appStore";

const SVG_WIDTH = 560;
const LANE_HEIGHT = 44;
const LABEL_WIDTH = 112;
const TRACK_WIDTH = 420;
const TRACK_HEIGHT = 32;
const BLOCK_HEIGHT = 12;
const TRACK_X = LABEL_WIDTH + 10;
const TRACK_Y = 10;
const TRACK_RADIUS = 10;
const LANE_GAP = 10;
const TIME_MARKS = 5;

function fmtTime(ms: number): string {
  return new Date(ms).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function fmtAxisTime(ms: number): string {
  return new Date(ms).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDurationShort(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${Math.round(ms / 1000)}s`;
  const totalSec = Math.round(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return sec === 0 ? `${min}m` : `${min}m${sec}s`;
}

function appLabel(name: string): string {
  const trimmed = name.trim();
  if (!trimmed || trimmed === "—") return "—";
  if (/Other/.test(trimmed)) return "OT";
  if (/[一-鿿]/.test(trimmed)) return trimmed.slice(0, 1);
  return trimmed.replace(/[^a-zA-Z0-9]/g, "").slice(0, 2).toUpperCase() || trimmed.slice(0, 2);
}

function laneColor(role: SwimlaneRole): string {
  switch (role) {
    case "main":
      return "var(--tl-cyan)";
    case "support":
      return "var(--tl-purple)";
    case "interrupt":
      return "var(--tl-status-warn)";
    default:
      return "rgba(255,255,255,0.22)";
  }
}

function laneBg(role: SwimlaneRole): string {
  switch (role) {
    case "main":
      return "rgba(0,245,212,0.12)";
    case "support":
      return "rgba(155,126,217,0.12)";
    case "interrupt":
      return "rgba(251,191,36,0.12)";
    default:
      return "rgba(255,255,255,0.08)";
  }
}

function transitionStroke(role: SwimlaneRole): string {
  switch (role) {
    case "main":
      return "rgba(0,245,212,0.56)";
    case "support":
      return "rgba(155,126,217,0.5)";
    case "interrupt":
      return "rgba(251,191,36,0.5)";
    default:
      return "rgba(255,255,255,0.18)";
  }
}

function transitionWidth(role: SwimlaneRole): number {
  switch (role) {
    case "main":
      return 1.8;
    case "support":
      return 1.4;
    case "interrupt":
      return 1.2;
    default:
      return 1;
  }
}

function laneY(index: number): number {
  return TRACK_Y + index * (LANE_HEIGHT + LANE_GAP);
}

function blockX(startMs: number, windowStartMs: number, windowEndMs: number): number {
  const range = Math.max(windowEndMs - windowStartMs, 1);
  return TRACK_X + ((startMs - windowStartMs) / range) * TRACK_WIDTH;
}

function blockWidth(startMs: number, endMs: number, windowStartMs: number, windowEndMs: number): number {
  const range = Math.max(windowEndMs - windowStartMs, 1);
  return Math.max(((endMs - startMs) / range) * TRACK_WIDTH, 12);
}

function metricLabelClass(role: "primary" | "secondary" | "warn" | "normal"): string {
  switch (role) {
    case "primary":
      return "text-[var(--tl-cyan)]";
    case "secondary":
      return "text-[var(--tl-purple)]";
    case "warn":
      return "text-[var(--tl-status-warn)]";
    default:
      return "text-[var(--tl-ink)]";
  }
}

function SummaryCard({ label, value, tone = "normal" }: { label: string; value: string; tone?: "primary" | "secondary" | "warn" | "normal" }) {
  return (
    <div className="min-h-[72px] rounded-xl border border-white/[0.06] bg-white/[0.03] px-3 py-3">
      <p className="text-[0.58rem] uppercase tracking-[0.1em] text-[var(--tl-muted)]">{label}</p>
      <p className={`mt-2 font-mono text-[1.02rem] font-bold ${metricLabelClass(tone)}`}>{value}</p>
    </div>
  );
}

function SwimlaneSvg({ model }: { model: SwimlaneModel }) {
  const laneIndex = new Map<string, number>();
  model.lanes.forEach((lane, index) => laneIndex.set(lane.app, index));
  const svgHeight = TRACK_Y + model.lanes.length * (LANE_HEIGHT + LANE_GAP) - LANE_GAP + 8;

  return (
    <div className="overflow-x-auto px-4 py-4">
      <svg
        viewBox={`0 0 ${SVG_WIDTH} ${svgHeight + 28}`}
        className="w-full min-w-[620px]"
        style={{ height: svgHeight + 28 }}
      >
        {Array.from({ length: TIME_MARKS }).map((_, index) => {
          const ratio = index / (TIME_MARKS - 1);
          const x = TRACK_X + ratio * TRACK_WIDTH;
          const time = model.windowStartMs + ratio * (model.windowEndMs - model.windowStartMs);
          return (
            <g key={index}>
              <text
                x={x}
                y={12}
                textAnchor={index === 0 ? "start" : index === TIME_MARKS - 1 ? "end" : "middle"}
                fontSize={9}
                fill="var(--tl-muted)"
                style={{ fontFamily: 'ui-monospace, SFMono-Regular, monospace' }}
              >
                {fmtAxisTime(time)}
              </text>
            </g>
          );
        })}

        {model.transitions.map((transition) => {
          const fromIndex = laneIndex.get(transition.fromApp);
          const toIndex = laneIndex.get(transition.toApp);
          if (fromIndex == null || toIndex == null || fromIndex === toIndex) return null;
          if (transition.role === "other") return null;

          const x = blockX(transition.atMs, model.windowStartMs, model.windowEndMs);
          const y1 = laneY(fromIndex) + TRACK_HEIGHT / 2;
          const y2 = laneY(toIndex) + TRACK_HEIGHT / 2;
          const mid = x + 8;
          return (
            <path
              key={transition.switchId}
              d={`M ${x} ${y1} C ${mid} ${y1}, ${mid} ${y2}, ${x + 16} ${y2}`}
              fill="none"
              stroke={transitionStroke(transition.role)}
              strokeDasharray={transition.role === "interrupt" ? "4 4" : undefined}
              strokeWidth={transitionWidth(transition.role)}
            >
              <title>{`${transition.fromApp} → ${transition.toApp}`}</title>
            </path>
          );
        })}

        {model.lanes.map((lane, index) => {
          const y = laneY(index);
          const chipBg = laneBg(lane.role);
          const chipColor = laneColor(lane.role);
          return (
            <g key={lane.app}>
              <rect
                x={TRACK_X}
                y={y}
                width={TRACK_WIDTH}
                height={TRACK_HEIGHT}
                rx={TRACK_RADIUS}
                fill="rgba(255,255,255,0.02)"
                stroke="rgba(255,255,255,0.05)"
              />
              {[0.25, 0.5, 0.75].map((frac) => {
                const guideX = TRACK_X + TRACK_WIDTH * frac;
                return (
                  <line
                    key={frac}
                    x1={guideX}
                    y1={y + 4}
                    x2={guideX}
                    y2={y + TRACK_HEIGHT - 4}
                    stroke="rgba(255,255,255,0.05)"
                    strokeWidth={0.8}
                  />
                );
              })}
              <rect
                x={0}
                y={y + 4}
                width={34}
                height={24}
                rx={8}
                fill={chipBg}
                stroke="rgba(255,255,255,0.05)"
              />
              <text
                x={17}
                y={y + 20}
                textAnchor="middle"
                fontSize={11}
                fontWeight={700}
                fill={chipColor}
                style={{ fontFamily: 'ui-monospace, SFMono-Regular, monospace' }}
              >
                {appLabel(lane.app)}
              </text>
              <text
                x={46}
                y={y + 20}
                fontSize={11}
                fontWeight={600}
                fill="var(--tl-ink)"
              >
                {lane.app}
              </text>
              <text
                x={46}
                y={y + 31}
                fontSize={9}
                fill="var(--tl-muted)"
                style={{ fontFamily: 'ui-monospace, SFMono-Regular, monospace' }}
              >
                {lane.count}
              </text>
              {lane.blocks.map((block) => {
                const x = blockX(block.startMs, model.windowStartMs, model.windowEndMs);
                const width = blockWidth(block.startMs, block.endMs, model.windowStartMs, model.windowEndMs);
                return (
                  <rect
                    key={block.switchId}
                    x={x}
                    y={y + (TRACK_HEIGHT - BLOCK_HEIGHT) / 2}
                    width={width}
                    height={BLOCK_HEIGHT}
                    rx={BLOCK_HEIGHT / 2}
                    fill={laneBg(block.role)}
                    stroke={laneColor(block.role)}
                    strokeWidth={0.7}
                  >
                    <title>{`${lane.app} · ${fmtTime(block.startMs)} - ${fmtTime(block.endMs)} · ${formatDurationShort(block.durationMs)} · ${block.toApp}`}</title>
                  </rect>
                );
              })}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function RecentSwitches({ model }: { model: SwimlaneModel }) {
  return (
    <div className="space-y-1 px-2 py-2">
      {model.recentSwitches.slice(0, 6).map((switchRow) => (
        <div
          key={switchRow.id}
          className="grid grid-cols-[58px_1fr_46px] items-center gap-2 rounded-lg px-2 py-2 text-[0.72rem] hover:bg-white/[0.03]"
        >
          <span className="font-mono text-[0.62rem] text-[var(--tl-muted)]">{fmtTime(switchRow.timestampMs)}</span>
          <span className="truncate font-medium text-[var(--tl-ink)]">
            {switchRow.fromApp}
            <span className="mx-1 text-[var(--tl-muted)]">→</span>
            {switchRow.toApp}
          </span>
          <span className="text-right font-mono text-[0.62rem] text-[var(--tl-muted)]">
            {formatDurationShort(switchRow.fromSessionDurationMs)}
          </span>
        </div>
      ))}
    </div>
  );
}

function SummaryPanel({ model }: { model: SwimlaneModel }) {
  const { t } = useTranslation();
  const supportLane = model.lanes.find((lane) => lane.role === "support");
  const interruptLane = model.lanes.find((lane) => lane.role === "interrupt");
  const [mainA, mainB] = model.mainPair ?? [null, null];

  return (
    <div className="grid gap-3 px-3 py-3">
      <div className="rounded-xl border border-white/[0.06] bg-white/[0.025] p-3">
        <p className="text-[0.6rem] uppercase tracking-[0.08em] text-[var(--tl-muted)]">
          {t("fragmentation.summaryMain")}
        </p>
        <p className="mt-2 font-mono text-[0.78rem] font-semibold text-[var(--tl-purple)]">
          {mainA && mainB ? `${mainA} ↔ ${mainB}` : t("fragmentation.noStableLoop")}
        </p>
      </div>
      <div className="rounded-xl border border-white/[0.06] bg-white/[0.025] p-3">
        <p className="text-[0.6rem] uppercase tracking-[0.08em] text-[var(--tl-muted)]">
          {t("fragmentation.summarySupport")}
        </p>
        <p className="mt-2 font-mono text-[0.78rem] font-semibold text-[var(--tl-cyan)]">
          {supportLane ? supportLane.app : t("fragmentation.none")}
        </p>
      </div>
      <div className="rounded-xl border border-white/[0.06] bg-white/[0.025] p-3">
        <p className="text-[0.6rem] uppercase tracking-[0.08em] text-[var(--tl-muted)]">
          {t("fragmentation.summaryInsert")}
        </p>
        <p className="mt-2 font-mono text-[0.78rem] font-semibold text-[var(--tl-status-warn)]">
          {interruptLane ? interruptLane.app : t("fragmentation.none")}
        </p>
      </div>
    </div>
  );
}

export default function FragmentationDetail() {
  const { t } = useTranslation();
  const alert = useAppStore((s) => s.fragmentationAlert);
  const clear = useAppStore((s) => s.setFragmentationAlert);
  const setProtectUntil = useAppStore((s) => s.setFragmentationProtectUntilMs);

  const model = useMemo(() => {
    if (!alert) return null;
    return buildSwimlaneModel(alert.switches, alert.windowMin);
  }, [alert]);

  if (!alert || !model) return null;

  const mainPairLabel = model.mainPair ? `${model.mainPair[0]} ↔ ${model.mainPair[1]}` : t("fragmentation.noStableLoop");

  const protectLoop = () => {
    setProtectUntil(Date.now() + 15 * 60_000);
    clear(null);
  };

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-[var(--tl-overlay-strong)] p-4"
      role="dialog"
      aria-modal="true"
      aria-label={t("fragmentation.workLoopTitle")}
    >
      <div
        className="relative flex max-h-[90vh] w-full max-w-[760px] flex-col overflow-hidden rounded-2xl border border-[var(--tl-line)] bg-[var(--tl-sheet-bg)] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-[var(--tl-line)] bg-[linear-gradient(180deg,rgba(255,255,255,0.02),transparent)] px-5 py-4">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-base font-semibold text-[var(--tl-ink)]">{t("fragmentation.workLoopTitle")}</h2>
              <span className="rounded-full border border-[var(--tl-line)] bg-[var(--tl-surface)] px-2 py-0.5 text-[0.58rem] font-semibold uppercase tracking-[0.08em] text-[var(--tl-cyan)]">
                {t("fragmentation.recentWindow", { minutes: alert.windowMin })}
              </span>
            </div>
            <div className="mt-2 inline-flex items-center gap-2 rounded-lg border border-white/[0.06] bg-white/[0.03] px-3 py-1.5 text-[0.76rem] text-[var(--tl-ink)]">
              <span className="text-[var(--tl-muted)]">{t("fragmentation.currentMainLoop")}</span>
              <span className="font-mono font-semibold text-[var(--tl-cyan)]">{mainPairLabel}</span>
            </div>
          </div>
          <button
            type="button"
            className="rounded-lg px-2 py-1 text-xl leading-none text-[var(--tl-muted)] hover:bg-white/[0.04] hover:text-[var(--tl-ink)]"
            onClick={() => clear(null)}
          >
            ×
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
            <SummaryCard label={t("fragmentation.mainLoopCount")} value={String(model.stats.loopCount)} tone="primary" />
            <SummaryCard label={t("fragmentation.avgDwell")} value={formatDurationShort(model.stats.averageDwellMs)} tone="secondary" />
            <SummaryCard label={t("fragmentation.insertions")} value={String(model.stats.interruptCount)} tone="warn" />
            <SummaryCard label={t("fragmentation.apps")} value={String(model.stats.appCount)} />
          </div>

          <div className="mt-4 overflow-hidden rounded-2xl border border-white/[0.06] bg-white/[0.02]">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/[0.06] px-4 py-3">
              <p className="text-[0.62rem] font-semibold uppercase tracking-[0.1em] text-[var(--tl-muted)]">
                {t("fragmentation.structure")}
              </p>
              <div className="flex flex-wrap items-center gap-3 text-[0.62rem] text-[var(--tl-muted)]">
                <span className="inline-flex items-center gap-1.5"><span className="h-[2px] w-4 rounded bg-[var(--tl-cyan)]" />{t("fragmentation.legendMain")}</span>
                <span className="inline-flex items-center gap-1.5"><span className="h-[2px] w-4 rounded bg-[var(--tl-purple)]" />{t("fragmentation.legendSupport")}</span>
                <span className="inline-flex items-center gap-1.5"><span className="h-0 w-4 border-t-2 border-dashed border-[var(--tl-status-warn)]" />{t("fragmentation.legendInsert")}</span>
              </div>
            </div>
            {model.state === "sparse" ? (
              <div className="px-4 py-10 text-center text-sm text-[var(--tl-muted)]">
                {t("fragmentation.sparseState")}
              </div>
            ) : (
              <>
                {model.state === "weak" && (
                  <div className="border-b border-white/[0.06] px-4 py-2 text-[0.7rem] text-[var(--tl-muted)]">
                    {t("fragmentation.weakState")}
                  </div>
                )}
                <SwimlaneSvg model={model} />
              </>
            )}
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
            <div className="overflow-hidden rounded-2xl border border-white/[0.06] bg-white/[0.02]">
              <div className="border-b border-white/[0.06] px-4 py-3">
                <p className="text-[0.62rem] font-semibold uppercase tracking-[0.1em] text-[var(--tl-muted)]">
                  {t("fragmentation.recentSwitches")}
                </p>
              </div>
              <RecentSwitches model={model} />
            </div>
            <div className="overflow-hidden rounded-2xl border border-white/[0.06] bg-white/[0.02]">
              <div className="border-b border-white/[0.06] px-4 py-3">
                <p className="text-[0.62rem] font-semibold uppercase tracking-[0.1em] text-[var(--tl-muted)]">
                  {t("fragmentation.summary")}
                </p>
              </div>
              <SummaryPanel model={model} />
            </div>
          </div>
        </div>

        <div className="flex flex-col items-stretch justify-between gap-3 border-t border-[var(--tl-line)] px-5 py-4 md:flex-row md:items-center">
          <p className="text-[0.68rem] text-[var(--tl-muted)]">{t("fragmentation.footerHint")}</p>
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              className="rounded-lg border border-white/[0.06] bg-white/[0.04] px-4 py-2 text-[0.78rem] font-semibold text-[var(--tl-muted)] hover:bg-white/[0.06]"
              onClick={() => clear(null)}
            >
              {t("fragmentation.dismiss")}
            </button>
            <button
              type="button"
              className="rounded-lg bg-[var(--tl-cyan)] px-4 py-2 text-[0.78rem] font-semibold text-[#07110f] shadow-[0_10px_24px_rgba(0,245,212,0.16)] hover:opacity-90"
              onClick={protectLoop}
            >
              {t("fragmentation.protectLoop")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
