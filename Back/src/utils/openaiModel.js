/**
 * Single place that decides which OpenAI model we call and how request params
 * must be shaped for it.
 *
 * The gpt-5 family and the o-series reject `max_tokens` (they require
 * `max_completion_tokens`) and reject any `temperature` other than the default
 * 1. Older chat models like gpt-4o-mini accept both. Every call site goes
 * through buildChatParams so switching OPENAI_MODEL can never produce a 400.
 */

export const DEFAULT_OPENAI_MODEL = 'gpt-5.4-mini';

/** Reasoning-family models: gpt-5*, o1/o3/o4*. */
function isReasoningModel(model) {
  const name = String(model || '').toLowerCase();
  return /^gpt-5/.test(name) || /^o[134](-|$)/.test(name);
}

export function getOpenAiModel() {
  return String(process.env.OPENAI_MODEL || '').trim() || DEFAULT_OPENAI_MODEL;
}

/**
 * Build chat.completions.create params for the configured model.
 *
 * @param {Object} params
 * @param {Array} params.messages
 * @param {string} [params.model] Defaults to OPENAI_MODEL / DEFAULT_OPENAI_MODEL.
 * @param {number} [params.maxTokens] Output budget; mapped to the field the model expects.
 * @param {number} [params.temperature] Dropped for models that only allow the default.
 */
export function buildChatParams({ messages, model, maxTokens, temperature } = {}) {
  const resolvedModel = model || getOpenAiModel();
  const params = { model: resolvedModel, messages };

  if (Number.isFinite(maxTokens) && maxTokens > 0) {
    if (isReasoningModel(resolvedModel)) {
      // Budget covers reasoning + visible output. reasoning_effort is left
      // unset so it stays at the model default ('none' on gpt-5.x mini/nano)
      // and no output budget is spent on hidden reasoning tokens.
      params.max_completion_tokens = maxTokens;
    } else {
      params.max_tokens = maxTokens;
    }
  }

  if (temperature != null && !isReasoningModel(resolvedModel)) {
    params.temperature = temperature;
  }

  return params;
}
