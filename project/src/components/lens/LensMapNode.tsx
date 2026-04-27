import { useTranslation } from "react-i18next";
import type { LensNodeData, LensNodeId } from "../../lib/lensViewModel";
import { NODE_COORDS } from "../../lib/lensViewModel";

// Icon map per node id
const NODE_ICONS: Record<LensNodeId, string> = {
  window:  "⊞",
  ocr:     "◇",
  switch:  "⇄",
  local:   "◉",
  session: "▣",
};

interface Props {
  node: LensNodeData;
  /** Animation delay in seconds */
  delay?: number;
}

export function LensMapNode({ node, delay = 0 }: Props) {
  const { t } = useTranslation();
  const coords = NODE_COORDS[node.id];

  const value = node.valueParams && Object.keys(node.valueParams).length > 0
    ? t(node.valueKey, node.valueParams)
    : t(node.valueKey);

  const sub = node.subParams && Object.keys(node.subParams).length > 0
    ? t(node.subKey, node.subParams)
    : t(node.subKey);

  return (
    <div
      className="lens-map-node"
      style={{
        position: "absolute",
        left: `${coords.left}%`,
        top: `${coords.top}%`,
        transform: "translate(-50%, -50%)",
        animationDelay: `${delay}s`,
        borderTopColor: node.colorHex,
      }}
    >
      <div className="lens-map-node__header">
        <span
          className="lens-map-node__icon"
          style={{ color: node.colorHex, background: `${node.colorHex}18` }}
        >
          {NODE_ICONS[node.id]}
        </span>
        <span className="lens-map-node__name">{t(node.nameKey)}</span>
      </div>
      <div
        className="lens-map-node__value"
        style={{ color: node.colorHex }}
      >
        {value}
      </div>
      <div className="lens-map-node__sub">{sub}</div>
    </div>
  );
}
