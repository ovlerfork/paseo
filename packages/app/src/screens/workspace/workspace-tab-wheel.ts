// Wheel-to-tab switching for the desktop tab row. Trackpads emit many small deltas per gesture,
// so deltas accumulate until they cross a threshold and a cooldown keeps one flick from skipping
// across several tabs.
export const TAB_WHEEL_DELTA_THRESHOLD = 40;
export const TAB_WHEEL_COOLDOWN_MS = 150;

export interface TabWheelState {
  accumulated: number;
  lastSwitchAt: number;
}

export function createTabWheelState(): TabWheelState {
  return { accumulated: 0, lastSwitchAt: Number.NEGATIVE_INFINITY };
}

/** Returns the tab id to activate, or null when the wheel event should not switch tabs. */
export function resolveWheelTabTarget(input: {
  state: TabWheelState;
  deltaX: number;
  deltaY: number;
  now: number;
  tabIds: string[];
  activeTabId: string | null;
}): string | null {
  const { state, deltaX, deltaY, now, tabIds, activeTabId } = input;
  const delta = Math.abs(deltaY) >= Math.abs(deltaX) ? deltaY : deltaX;
  if (delta === 0 || tabIds.length < 2) return null;

  // A direction change discards progress made in the other direction.
  if (state.accumulated !== 0 && Math.sign(state.accumulated) !== Math.sign(delta)) {
    state.accumulated = 0;
  }
  if (now - state.lastSwitchAt < TAB_WHEEL_COOLDOWN_MS) return null;

  state.accumulated += delta;
  if (Math.abs(state.accumulated) < TAB_WHEEL_DELTA_THRESHOLD) return null;

  const direction = state.accumulated > 0 ? 1 : -1;
  state.accumulated = 0;

  const activeIndex = activeTabId === null ? -1 : tabIds.indexOf(activeTabId);
  const nextIndex = activeIndex === -1 ? 0 : activeIndex + direction;
  if (nextIndex < 0 || nextIndex >= tabIds.length) return null;

  state.lastSwitchAt = now;
  return tabIds[nextIndex] ?? null;
}
