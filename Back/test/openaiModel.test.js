import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';
import { buildChatParams, getOpenAiModel } from '../src/utils/openaiModel.js';

const envKeys = ['OPENAI_FIELD_MODEL', 'OPENAI_MODEL'];
let originalEnv;

beforeEach(() => {
  originalEnv = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));
  for (const key of envKeys) delete process.env[key];
});

afterEach(() => {
  for (const key of envKeys) {
    if (originalEnv[key] === undefined) delete process.env[key];
    else process.env[key] = originalEnv[key];
  }
});

test('rejects missing model configuration instead of selecting a hard-coded model', () => {
  assert.throws(getOpenAiModel, /OpenAI model is not configured.*OPENAI_FIELD_MODEL/);
  assert.throws(() => buildChatParams({ messages: [] }), /OpenAI model is not configured/);
});

test('field model takes precedence over the legacy model and trims whitespace', () => {
  process.env.OPENAI_FIELD_MODEL = ' gpt-6-luna ';
  process.env.OPENAI_MODEL = 'gpt-4o-mini';
  assert.equal(getOpenAiModel(), 'gpt-6-luna');
});

test('blank field model falls back to the legacy model', () => {
  process.env.OPENAI_FIELD_MODEL = '  ';
  process.env.OPENAI_MODEL = ' gpt-4o-mini ';
  assert.equal(getOpenAiModel(), 'gpt-4o-mini');
});

test('rejects blank model settings instead of selecting a hard-coded model', () => {
  process.env.OPENAI_FIELD_MODEL = '';
  process.env.OPENAI_MODEL = '  ';
  assert.throws(getOpenAiModel, /OpenAI model is not configured/);
});

test('reads environment configuration at call time rather than import time', () => {
  process.env.OPENAI_FIELD_MODEL = 'gpt-6-luna';
  assert.equal(getOpenAiModel(), 'gpt-6-luna');
  process.env.OPENAI_FIELD_MODEL = 'gpt-4o-mini';
  assert.equal(getOpenAiModel(), 'gpt-4o-mini');
});

const messages = [{ role: 'user', content: 'Generate a listing title.' }];

test('GPT-6 uses the selected model and preserves the visible output budget', () => {
  process.env.OPENAI_FIELD_MODEL = 'gpt-6-luna';
  assert.deepEqual(buildChatParams({ messages, maxTokens: 150, temperature: 0.3 }), {
    model: 'gpt-6-luna',
    messages,
    max_completion_tokens: 150,
    reasoning_effort: 'none',
    temperature: 0.3,
  });
});

test('explicit model overrides still take precedence', () => {
  process.env.OPENAI_FIELD_MODEL = 'gpt-6-luna';
  assert.deepEqual(buildChatParams({ messages, model: 'gpt-4o-mini', maxTokens: 900, temperature: 0 }), {
    model: 'gpt-4o-mini',
    messages,
    max_tokens: 900,
    temperature: 0,
  });
});

for (const model of ['gpt-5', 'gpt-5-mini', 'gpt-5.4-mini', 'o1', 'o3-mini', 'o4-mini']) {
  test(`${model} retains its existing request parameters`, () => {
    assert.deepEqual(buildChatParams({ messages, model, maxTokens: 3000, temperature: 0 }), {
      model,
      messages,
      max_completion_tokens: 3000,
    });
  });
}

test('GPT-6 handles optional request parameters without adding undefined values', () => {
  process.env.OPENAI_FIELD_MODEL = 'gpt-6-luna';
  assert.deepEqual(buildChatParams({ messages }), {
    model: 'gpt-6-luna',
    messages,
    reasoning_effort: 'none',
  });
});

test('invalid token budgets retain the existing omission behavior', () => {
  for (const maxTokens of [0, -1, NaN, Infinity, '150']) {
    const params = buildChatParams({ messages, model: 'gpt-6-luna', maxTokens });
    assert.equal(Object.hasOwn(params, 'max_tokens'), false);
    assert.equal(Object.hasOwn(params, 'max_completion_tokens'), false);
  }
});
