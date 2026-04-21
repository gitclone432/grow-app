import OpenAI from 'openai';
import pLimit from 'p-limit';

let openaiClient = null;

// Concurrency limiter for AI requests - OpenAI Tier 2 can handle high concurrency
const AI_CONCURRENT_REQUESTS = parseInt(process.env.OPENAI_CONCURRENT_REQUESTS) || 30;
const aiLimit = pLimit(AI_CONCURRENT_REQUESTS);

console.log(`[OpenAI] 🤖 Initialized with ${AI_CONCURRENT_REQUESTS} concurrent request limit`);

function getOpenAIClient() {
  if (!openaiClient) {
    openaiClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return openaiClient;
}

/**
 * Generate content using OpenAI API with GPT-4o-mini
 * @param {string} prompt - The prompt to send to OpenAI
 * @param {Object} options - Generation options
 * @param {number} options.maxTokens - Maximum tokens to generate (default: 150)
 * @returns {Promise<string>} - Generated text
 */
export async function generateWithGemini(prompt, options = {}) {
  return aiLimit(async () => {
    try {
      const { maxTokens = 150 } = options;
      
      const openai = getOpenAIClient();
      const completion = await openai.chat.completions.create({
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ],
        model: 'gpt-4o-mini',
        temperature: 0.3,
        max_tokens: maxTokens,
      });
      
      let content = completion.choices[0]?.message?.content?.trim() || '';
      
      // Strip markdown code blocks (```html ... ```, ```javascript ... ```, etc.)
      // This prevents AI from wrapping HTML/code responses in markdown fences
      content = content.replace(/```(?:html|javascript|python|css|json|[a-z]*)?\n?([\s\S]*?)```/g, '$1').trim();
      
      return content;
    } catch (error) {
      console.error('OpenAI API error:', error);
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
