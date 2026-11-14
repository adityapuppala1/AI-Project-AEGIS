// Finds the element a tour step points at. Targets are data-tour attributes, never CSS paths. Only an element that is
// actually displayed counts, so a control hidden by role, viewport width or a closed panel makes its step skip itself.
const selector = (target: string) => `[data-tour="${target}"]`;
export function findTourTarget(target: string): HTMLElement | null {
  for (const element of Array.from(document.querySelectorAll<HTMLElement>(selector(target)))) {
    const shown = typeof element.checkVisibility === "function" ? element.checkVisibility() : element.getClientRects().length > 0;
    if (shown) return element;
  }
  return null;
}
