import type { ReactNode } from "react";
import { useId, useState } from "react";
import { createPortal } from "react-dom";

export function ClassicTooltip({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  const id = useId();
  const [position, setPosition] = useState<{
    left: number;
    bottom: number;
  } | null>(null);
  function show(element: HTMLElement) {
    const bounds = element.getBoundingClientRect();
    setPosition({
      left: Math.max(
        90,
        Math.min(globalThis.innerWidth - 90, bounds.x + bounds.width / 2),
      ),
      bottom: globalThis.innerHeight - bounds.top + 8,
    });
  }
  return (
    <>
      <button
        aria-describedby={position === null ? undefined : id}
        aria-label={label}
        className="text-button classic-score-trigger"
        onBlur={() => setPosition(null)}
        onClick={(event) => show(event.currentTarget)}
        onFocus={(event) => show(event.currentTarget)}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.stopPropagation();
            setPosition(null);
          }
        }}
        onMouseEnter={(event) => show(event.currentTarget)}
        onMouseLeave={() => setPosition(null)}
        type="button"
      >
        <i aria-hidden="true" className="fas fa-chart-area green" />
      </button>
      {position !== null
        && createPortal(
          <div
            className="classic-score-tooltip"
            id={id}
            role="tooltip"
            style={position}
          >
            {children}
          </div>,
          document.body,
        )}
    </>
  );
}
