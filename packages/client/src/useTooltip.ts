import { useEffect, useRef } from "react";
import { Tooltip } from "./Tooltip.ts";

/**
 * Adds a tooltip with HTML content that opens on hover to the element that gets the returned ref.
 * When the content is undefined, the element has no tooltip.
 */
export function useTooltip<T extends HTMLElement>(
  content: string | undefined,
): React.RefObject<T | null> {
  const ref = useRef<T>(null);
  useEffect(() => {
    if (content === undefined) {
      return undefined;
    }
    // React sets the ref before it runs effects.
    const tooltip = new Tooltip(ref.current!, { content });
    tooltip.openOnHover();
    return () => {
      tooltip.destroy();
    };
  }, [content]);
  return ref;
}
