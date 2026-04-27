import { useTranslation } from "react-i18next";
import type { LensViewModel } from "../../lib/lensViewModel";
import { NODE_COLORS, NODE_COORDS } from "../../lib/lensViewModel";
import { LensMapNode } from "./LensMapNode";

// Center of the map coordinate system
const CX = 50;
const CY = 48;

// Pre-compute SVG line data from node coords to center
const SVG_LINES = (
  Object.entries(NODE_COORDS) as [keyof typeof NODE_COORDS, { left: number; top: number }][]
).map(([id, coords]) => ({
  id,
  x1: CX,
  y1: CY,
  x2: coords.left,
  y2: coords.top,
  color: NODE_COLORS[id],
}));

interface Props {
  vm: LensViewModel;
}

export function TimeLensMap({ vm }: Props) {
  const { t } = useTranslation();

  return (
    <div className="lens-map-col">
      {/* Scanning line animation */}
      <div className="lens-map-scan" aria-hidden="true" />

      {/* Legend bar */}
      <div className="lens-map-legend">
        <span className="lens-map-legend__title">{t("todayLens.mapTitle")}</span>
        <span className="lens-map-legend__active">
          {t("todayLens.mapActiveToday", { duration: vm.activeFormatted })}
        </span>
      </div>

      {/* Radial container */}
      <div className="lens-map-radial">
        {/* SVG connecting lines */}
        <svg
          className="lens-map-svg"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <defs>
            {SVG_LINES.map((line) => (
              <linearGradient
                key={`grad-${line.id}`}
                id={`grad-${line.id}`}
                x1={`${line.x1}%`}
                y1={`${line.y1}%`}
                x2={`${line.x2}%`}
                y2={`${line.y2}%`}
                gradientUnits="userSpaceOnUse"
              >
                <stop offset="0%" stopColor={line.color} stopOpacity="0.75" />
                <stop offset="100%" stopColor={line.color} stopOpacity="0.12" />
              </linearGradient>
            ))}
          </defs>

          {/* Orbit ring */}
          <circle
            cx={CX}
            cy={CY}
            r="35.6"
            fill="none"
            stroke="rgba(255,255,255,0.06)"
            strokeWidth="0.5"
            strokeDasharray="3 2"
          />

          {/* Radial lines */}
          {SVG_LINES.map((line) => (
            <line
              key={`line-${line.id}`}
              x1={line.x1}
              y1={line.y1}
              x2={line.x2}
              y2={line.y2}
              stroke={`url(#grad-${line.id})`}
              strokeWidth="0.8"
            />
          ))}

          {/* Node endpoint glow dots */}
          {SVG_LINES.map((line) => (
            <circle
              key={`dot-${line.id}`}
              cx={line.x2}
              cy={line.y2}
              r="1.1"
              fill={line.color}
              opacity="0.7"
            />
          ))}
        </svg>

        {/* Center card */}
        <div className="lens-map-core">
          <div className="lens-map-core__label">{t("todayLens.coreLabel")}</div>
          <div className="lens-map-core__thread">
            {vm.mainThread || t("todayLens.headlineNoThread").replace("TimeLens ", "")}
          </div>
          <div className="lens-map-core__badge">{t("todayLens.coreBadge")}</div>
          {vm.deepWorkFormatted !== "—" && (
            <div className="lens-map-core__time">
              {t("todayLens.coreTime", { duration: vm.deepWorkFormatted })}
            </div>
          )}
        </div>

        {/* Capability nodes */}
        {vm.nodes.map((node, i) => (
          <LensMapNode key={node.id} node={node} delay={i * 0.7} />
        ))}
      </div>
    </div>
  );
}
