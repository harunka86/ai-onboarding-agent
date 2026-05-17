// Pricing per million tokens
const PRICE_INPUT_PER_M = 3.0;
const PRICE_OUTPUT_PER_M = 15.0;

const state = {
  calls: [],
  totalInputTokens: 0,
  totalOutputTokens: 0,
  totalLatencyMs: 0,
};

export function recordApiCall({ inputTokens, outputTokens, latencyMs }) {
  state.calls.push({ inputTokens, outputTokens, latencyMs, timestamp: Date.now() });
  state.totalInputTokens += inputTokens;
  state.totalOutputTokens += outputTokens;
  state.totalLatencyMs += latencyMs;
}

export function getTotalCost() {
  const inputCost = (state.totalInputTokens / 1_000_000) * PRICE_INPUT_PER_M;
  const outputCost = (state.totalOutputTokens / 1_000_000) * PRICE_OUTPUT_PER_M;
  return {
    totalCostUsd: inputCost + outputCost,
    totalInputTokens: state.totalInputTokens,
    totalOutputTokens: state.totalOutputTokens,
    totalCalls: state.calls.length,
    avgLatencyMs: state.calls.length
      ? Math.round(state.totalLatencyMs / state.calls.length)
      : 0,
  };
}

export function estimateCallCost(inputTokens, outputTokens) {
  const inputCost = (inputTokens / 1_000_000) * PRICE_INPUT_PER_M;
  const outputCost = (outputTokens / 1_000_000) * PRICE_OUTPUT_PER_M;
  return +(inputCost + outputCost).toFixed(6);
}
