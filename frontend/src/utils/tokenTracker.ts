const KEY = "tokenUsage";

export type TokensUsed = {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
};

const empty: TokensUsed = {
  prompt_tokens: 0,
  completion_tokens: 0,
  total_tokens: 0,
};

export function getTokensUsed(): TokensUsed {
  const raw = localStorage.getItem(KEY);
  if (!raw) return empty;

  try {
    const parsed = JSON.parse(raw);
    return {
      prompt_tokens: Number(parsed?.prompt_tokens || 0),
      completion_tokens: Number(parsed?.completion_tokens || 0),
      total_tokens: Number(parsed?.total_tokens || 0),
    };
  } catch {
    return empty;
  }
}

/** ✅ Set latest tokens (not cumulative) */
export function setTokensUsed(latest: Partial<TokensUsed>): TokensUsed {
  const next: TokensUsed = {
    prompt_tokens: Number(latest.prompt_tokens || 0),
    completion_tokens: Number(latest.completion_tokens || 0),
    total_tokens: Number(latest.total_tokens || 0),
  };

  localStorage.setItem(KEY, JSON.stringify(next));
  return next;
}
