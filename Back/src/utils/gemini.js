import OpenAI from 'openai';
import pLimit from 'p-limit';
import { trackApiUsage } from './apiUsageTracker.js';

// One client per API key (default key + any dedicated keys like the precheck key)
const openaiClients = new Map();

// Concurrency limiter for AI requests - OpenAI Tier 2 can handle high concurrency
const AI_CONCURRENT_REQUESTS = parseInt(process.env.OPENAI_CONCURRENT_REQUESTS) || 30;
const aiLimit = pLimit(AI_CONCURRENT_REQUESTS);

console.log(`[OpenAI] 🤖 Initialized with ${AI_CONCURRENT_REQUESTS} concurrent request limit`);

function getOpenAIClient(apiKey) {
  const key = apiKey || process.env.OPENAI_API_KEY;
  if (!openaiClients.has(key)) {
    openaiClients.set(key, new OpenAI({ apiKey: key }));
  }
  return openaiClients.get(key);
}

/**
 * Generate content using OpenAI API with GPT-4o-mini
 * @param {string} prompt - The prompt to send to OpenAI
 * @param {Object} options - Generation options
 * @param {number} options.maxTokens - Maximum tokens to generate (default: 150)
 * @param {string} [options.apiKey] - Optional one-off API key (e.g. OPENAI_PRECHECK_API_KEY)
 * @returns {Promise<string>} - Generated text
 */
export async function generateWithGemini(prompt, options = {}) {
  return aiLimit(async () => {
    const startTime = Date.now();
    const {
      maxTokens = 150,
      asin,
      fieldName,
      fieldType,
      aiRunId,
      aiRunStartedAt,
      templateId,
      sellerId,
      userId,
      ipAddress,
      ipSource,
      forwardedFor,
      userAgent,
      model = 'gpt-4o-mini',
      apiKey
    } = options;

    try {
      const openai = getOpenAIClient(apiKey);
      const completion = await openai.chat.completions.create({
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ],
        model,
        temperature: 0.3,
        max_tokens: maxTokens,
      });
      
      let content = completion.choices[0]?.message?.content?.trim() || '';
      
      // Strip markdown code blocks (```html ... ```, ```javascript ... ```, etc.)
      // This prevents AI from wrapping HTML/code responses in markdown fences
      content = content.replace(/```(?:html|javascript|python|css|json|[a-z]*)?\n?([\s\S]*?)```/g, '$1').trim();

      const usage = completion.usage || {};
      trackApiUsage({
        service: 'OpenAI',
        asin,
        creditsUsed: usage.total_tokens || 1,
        success: true,
        responseTime: Date.now() - startTime,
        extractedFields: fieldName ? [fieldName] : [],
        model,
        promptTokens: usage.prompt_tokens,
        completionTokens: usage.completion_tokens,
        totalTokens: usage.total_tokens,
        fieldName,
        fieldType,
        aiRunId,
        aiRunStartedAt,
        templateId,
        sellerId,
        userId,
        ipAddress,
        ipSource,
        forwardedFor,
        userAgent,
        promptChars: prompt.length,
        completionChars: content.length
      }).catch(err => console.error('[OpenAI Usage Tracker] Failed to track:', err.message));
      
      return content;
    } catch (error) {
      console.error('OpenAI API error:', error);
      trackApiUsage({
        service: 'OpenAI',
        asin,
        creditsUsed: 1,
        success: false,
        errorMessage: error.message,
        responseTime: Date.now() - startTime,
        extractedFields: fieldName ? [fieldName] : [],
        model,
        fieldName,
        fieldType,
        aiRunId,
        aiRunStartedAt,
        templateId,
        sellerId,
        userId,
        ipAddress,
        ipSource,
        forwardedFor,
        userAgent,
        promptChars: prompt.length
      }).catch(err => console.error('[OpenAI Usage Tracker] Failed to track error:', err.message));
      throw new Error('Failed to generate content with OpenAI');
    }
  });
}

/**
 * Replace placeholders in prompt with actual values
 * @param {string} promptTemplate - Template with placeholders like {title}, {brand}
 * @param {Object} data - Data object with values to replace
 * @returns {string} - Processed prompt
 */
export function replacePlaceholders(promptTemplate, data) {
  let processedPrompt = promptTemplate;
  
  // Replace all placeholders
  Object.keys(data).forEach(key => {
    const placeholder = new RegExp(`\\{${key}\\}`, 'gi');
    processedPrompt = processedPrompt.replace(placeholder, data[key] || '');
  });
  
  return processedPrompt;
}
