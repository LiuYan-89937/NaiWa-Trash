export function fartDurationMs(items, policy) {
  return Math.min(policy.max_ms,
    policy.base_ms + Math.max(0, items - 1) * policy.per_extra_item_ms);
}
