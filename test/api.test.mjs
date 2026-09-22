import test from 'node:test';
import assert from 'node:assert/strict';
import * as api from '../src/index.js';
import {runChecks, interactive} from './checks.mjs';

test('the shared behavioural checks pass against the source', async () => {
  const count = await runChecks(api);
  assert.ok(count >= 12, `${count} checks ran`);
});

test('the registries are frozen so a caller cannot corrupt them for everyone else', () => {
  assert.ok(Object.isFrozen(api.AGENT_VARIABLES));
  assert.ok(Object.isFrozen(api.SANDBOX_VARIABLES));
  assert.ok(Object.isFrozen(api.CI_VARIABLES));
});

test('reasons are drawn from a closed set', () => {
  const allowed = new Set(['explicitly-disabled','explicitly-enabled','agent','ci','no-tty','dumb-terminal','interactive']);
  const scenarios = [
    interactive(),
    {env: {CLAUDECODE: '1'}, stdin: {isTTY: true}, stdout: {isTTY: true}},
    {env: {CI: '1'}, stdin: {isTTY: true}, stdout: {isTTY: true}},
    {env: {}, stdin: {isTTY: false}, stdout: {isTTY: false}},
    {env: {TERM: 'dumb'}, stdin: {isTTY: true}, stdout: {isTTY: true}},
    {env: {NO_PROMPT: '1'}, stdin: {isTTY: true}, stdout: {isTTY: true}},
  ];
  for (const s of scenarios) assert.ok(allowed.has(api.describeEnvironment(s).reason));
});

test('every refusal explains itself in a sentence a user could act on', () => {
  const scenarios = [
    {env: {CLAUDECODE: '1'}, stdin: {isTTY: true}, stdout: {isTTY: true}},
    {env: {CI: '1'}, stdin: {isTTY: true}, stdout: {isTTY: true}},
    {env: {}, stdin: {isTTY: false}, stdout: {isTTY: false}},
    {env: {NO_PROMPT: '1'}, stdin: {isTTY: true}, stdout: {isTTY: true}},
  ];
  for (const s of scenarios) {
    const why = api.whyNotPrompt(s);
    assert.ok(why && why.detail.length > 12, JSON.stringify(why));
    assert.ok(!/undefined|\[object/.test(why.detail), why.detail);
  }
});

test('reading the real environment does not throw, whatever it happens to be', () => {
  assert.doesNotThrow(() => api.describeEnvironment());
  assert.equal(typeof api.canPrompt(), 'boolean');
  assert.equal(typeof api.canAnimate(), 'boolean');
});
