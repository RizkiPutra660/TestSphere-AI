// src/utils/tokenBudget.ts
const KEY = "tokenBudget";

export type TokenBudget = {
  remaining: number;
};

const DEFAULT_BUDGET = 500_000;

export function getTokenBudget(): TokenBudget {
  const raw = localStorage.getItem(KEY);
  if (!raw) return { remaining: DEFAULT_BUDGET };

  try {
    const parsed = JSON.parse(raw);
    const remaining = Number(parsed?.remaining);
    return { remaining: Number.isFinite(remaining) ? Math.max(0, remaining) : DEFAULT_BUDGET };
  } catch {
    return { remaining: DEFAULT_BUDGET };
  }
}

export function setTokenBudget(remaining: number): TokenBudget {
  const next = { remaining: Math.max(0, Math.floor(Number(remaining) || 0)) };
  localStorage.setItem(KEY, JSON.stringify(next));
  return next;
}

/** ✅ Subtract tokens used from remaining budget */
export function subtractFromBudget(tokensUsed: number): TokenBudget {
  const current = getTokenBudget().remaining;
  return setTokenBudget(current - (Number(tokensUsed) || 0));
}

/** Optional: reset budget back to 10k */
export function resetBudget(): TokenBudget {
  return setTokenBudget(DEFAULT_BUDGET);
}
