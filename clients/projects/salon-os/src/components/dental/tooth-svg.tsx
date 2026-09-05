"use client";

import type { Tooth } from "@/lib/dental/tooth";
import { TOOTH_COLORS } from "@/lib/dental/color";
import type { DentalToothState } from "@/types/database";
import type { Surface } from "@/lib/dental/catalog";

// ---------------------------------------------------------------------------
// Zone definitions — viewBox 0 0 40 40
//
//   Top    zone = Vestibular (always lip-side)
//   Bottom zone = Palatino (upper arch) | Lingual (lower arch)
//   Center zone = Oclusal (posterior)  | Incisal (anterior)
//   Left   zone = Distal  (side=right) | Mesial (side=left)
//   Right  zone = Mesial  (side=right) | Distal (side=left)
//
// Inner rect corners: (12,12) – (28,28); outer box: (0,0) – (40,40).
// ---------------------------------------------------------------------------

const ZONE_PATHS: Record<string, string> = {
  top:    "0,0 40,0 28,12 12,12",
  bottom: "0,40 40,40 28,28 12,28",
  left:   "0,0 0,40 12,28 12,12",
  right:  "40,0 40,40 28,28 28,12",
  center: "12,12 28,12 28,28 12,28",
};

type Zone = "top" | "bottom" | "left" | "right" | "center";

const ANTERIOR_CLASSES = new Set([
  "incisivo_central", "incisivo_lateral", "canino",
]);

/** Maps SVG zone → anatomical Surface for a given tooth. */
function zoneSurface(tooth: Tooth, zone: Zone): Surface {
  switch (zone) {
    case "top":    return "vestibular";
    case "bottom": return tooth.arch === "upper" ? "palatino" : "lingual";
    case "center": return ANTERIOR_CLASSES.has(tooth.toothClass) ? "incisal" : "oclusal";
    case "left":   return tooth.side === "right" ? "distal"  : "mesial";
    case "right":  return tooth.side === "right" ? "mesial"  : "distal";
  }
}

// ---------------------------------------------------------------------------
// Zone fill logic
// ---------------------------------------------------------------------------

function zoneFill(
  zone: Zone,
  tooth: Tooth,
  state: DentalToothState | undefined,
  affectedSurfaces: string[],
  selectedSurfaces: ReadonlySet<Surface>,
): { fill: string; stroke: string } {
  const surface = zoneSurface(tooth, zone);
  const isSelected = selectedSurfaces.has(surface);

  if (isSelected) {
    // Selection highlight (blue-400 fill, blue-700 stroke)
    return { fill: "#60a5fa", stroke: "#1d4ed8" };
  }

  if (state === undefined) {
    return { fill: TOOTH_COLORS.sano.fill, stroke: TOOTH_COLORS.sano.stroke };
  }

  // Whole-tooth event (surfaces=[]) → color every zone
  const isAffected =
    affectedSurfaces.length === 0 || affectedSurfaces.includes(surface);

  if (isAffected) {
    return { fill: TOOTH_COLORS[state].fill, stroke: TOOTH_COLORS[state].stroke };
  }

  return { fill: TOOTH_COLORS.sano.fill, stroke: TOOTH_COLORS.sano.stroke };
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface ToothSvgProps {
  tooth: Tooth;
  /** Current clinical state (undefined = healthy / no findings). */
  state?: DentalToothState;
  /** Surfaces from the most recent finding. Empty = whole-tooth event. */
  affectedSurfaces?: string[];
  /** Surfaces the user has toggled for the next finding. Only shown in detail mode. */
  selectedSurfaces?: ReadonlySet<Surface>;
  /** Called when user clicks a surface zone. Fires only in detail mode. */
  onSurfaceClick?: (surface: Surface) => void;
  /** Called when user clicks the whole tooth cell (grid mode). */
  onToothClick?: () => void;
  /** "grid" = small 40px thumbnail; "detail" = large 120px interactive view. */
  size?: "grid" | "detail";
  /** If true, the tooth is currently selected in the grid. */
  isSelected?: boolean;
  className?: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const ZONES: Zone[] = ["top", "bottom", "left", "right", "center"];

export function ToothSvg({
  tooth,
  state,
  affectedSurfaces = [],
  selectedSurfaces = new Set(),
  onSurfaceClick,
  onToothClick,
  size = "grid",
  isSelected = false,
  className,
}: ToothSvgProps): React.ReactElement {
  const isDetail = size === "detail";
  const px = isDetail ? 120 : 40;

  const borderColor = isSelected
    ? "#3b82f6"
    : state
    ? TOOTH_COLORS[state].stroke
    : TOOTH_COLORS.sano.stroke;

  const borderWidth = isSelected ? 2.5 : 1;

  return (
    <svg
      viewBox="0 0 40 40"
      width={px}
      height={px}
      aria-label={tooth.label}
      role={onToothClick ? "button" : "img"}
      onClick={onToothClick}
      className={className}
      style={{ cursor: onToothClick ? "pointer" : "default", display: "block", flexShrink: 0 }}
    >
      {/* Background fill */}
      <rect x={0} y={0} width={40} height={40} fill={TOOTH_COLORS.sano.fill} rx={3} />

      {/* Surface zones */}
      {ZONES.map((zone) => {
        const surface = zoneSurface(tooth, zone);
        const { fill, stroke } = zoneFill(
          zone,
          tooth,
          state,
          affectedSurfaces,
          selectedSurfaces,
        );
        const interactive = isDetail && !!onSurfaceClick;

        return (
          <polygon
            key={zone}
            points={ZONE_PATHS[zone]}
            fill={fill}
            stroke={stroke}
            strokeWidth={0.75}
            style={interactive ? { cursor: "pointer" } : undefined}
            aria-label={interactive ? `Superficie ${surface}` : undefined}
            role={interactive ? "button" : undefined}
            tabIndex={interactive ? 0 : undefined}
            onClick={
              interactive
                ? (e) => {
                    e.stopPropagation();
                    onSurfaceClick?.(surface);
                  }
                : undefined
            }
            onKeyDown={
              interactive
                ? (e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      onSurfaceClick?.(surface);
                    }
                  }
                : undefined
            }
          />
        );
      })}

      {/* Outer border ring */}
      <rect
        x={0.75}
        y={0.75}
        width={38.5}
        height={38.5}
        rx={3}
        fill="none"
        stroke={borderColor}
        strokeWidth={borderWidth}
        style={{ pointerEvents: "none" }}
      />

      {/* Ausente: cross-out X */}
      {state === "ausente" && (
        <g style={{ pointerEvents: "none" }}>
          <line x1={9} y1={9}  x2={31} y2={31} stroke="#4b5563" strokeWidth={2.5} strokeLinecap="round" />
          <line x1={31} y1={9} x2={9}  y2={31} stroke="#4b5563" strokeWidth={2.5} strokeLinecap="round" />
        </g>
      )}

      {/* Implante: "I" glyph in center */}
      {state === "implante" && (
        <text
          x={20}
          y={24}
          textAnchor="middle"
          fontSize={14}
          fontWeight="bold"
          fill="#ffffff"
          style={{ pointerEvents: "none", userSelect: "none" }}
        >
          I
        </text>
      )}

      {/* Corona: crown symbol */}
      {state === "corona" && (
        <text
          x={20}
          y={24}
          textAnchor="middle"
          fontSize={12}
          fontWeight="bold"
          fill="#ffffff"
          style={{ pointerEvents: "none", userSelect: "none" }}
        >
          ♛
        </text>
      )}
    </svg>
  );
}
