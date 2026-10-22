/**
 * Single place that decides which OpenAI model we call and how request params
 * must be shaped for it.
 *
 * GPT-5/6 and the o-series use `max_completion_tokens`. Preserve the existing
 * GPT-5/o-series temperature behavior; GPT-6 uses reasoning_effort: 'none'
 * so small field budgets remain available for visible output.
 */

/** Models that use completion-token budgets rather than max_tokens. */
function isReasoningModel(model) {
  const name = String(model || '').toLowerCase();
  return /^gpt-[56]/.test(name) || /^o[134](-|$)/.test(name);
}

export function getOpenAiModel() {
  const model = String(process.env.OPENAI_FIELD_MODEL || '').trim()
    || String(process.env.OPENAI_MODEL || '').trim();
  if (!model) {
    throw new Error('OpenAI model is not configured. Set OPENAI_FIELD_MODEL (or legacy OPENAI_MODEL).');
  }
  return model;
}

/** Dedicated fitment key if set; otherwise the main OpenAI key. */
export function getFitmentApiKey() {
  const dedicated = String(process.env.OPENAI_FITMENT_API_KEY || '').trim();
  if (dedicated) return dedicated;
  return String(process.env.OPENAI_API_KEY || '').trim() || undefined;
}

/**
 * Build chat.completions.create params for the configured model.
 *
 * @param {Object} params
 * @param {Array} params.messages
 * @param {string} [params.model] Defaults to OPENAI_FIELD_MODEL, then OPENAI_MODEL; throws if neither is configured.
 * @param {number} [params.maxTokens] Output budget; mapped to the field the model expects.
 * @param {number} [params.temperature] Dropped for models that only allow the default.
 */
export function buildChatParams({ messages, model, maxTokens, temperature } = {}) {
  const resolvedModel = model || getOpenAiModel();
  const params = { model: resolvedModel, messages };
  const isGpt6 = /^gpt-6(?:[.-]|$)/i.test(resolvedModel);

  if (isGpt6) {
    params.reasoning_effort = 'none';
  }

  if (Number.isFinite(maxTokens) && maxTokens > 0) {
    if (isReasoningModel(resolvedModel)) {
      params.max_completion_tokens = maxTokens;
    } else {
      params.max_tokens = maxTokens;
    }
  }

  if (temperature != null && (isGpt6 || !isReasoningModel(resolvedModel))) {
    params.temperature = temperature;
  }

  return params;
}
