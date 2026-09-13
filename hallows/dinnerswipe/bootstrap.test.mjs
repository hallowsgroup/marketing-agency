import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { apiClient, bootstrap, makePlan } from './bootstrap.mjs';

function fixture() {
  const state = { companies: [], agents: [], goals: [], projects: [] };
  const writes = [];
  const api = async (method, path, body) => {
    const parts = path.split('/').filter(Boolean);
    const collection = parts.length === 1 ? 'companies' : parts[2];
    if (method === 'GET') return structuredClone(state[collection]);
    writes.push({ method, path, body });
    if (method === 'PATCH') {
      Object.assign(state.companies.find(c => c.id === parts[1]), body);
      return structuredClone(state.companies.find(c => c.id === parts[1]));
    }
    if (collection !== 'companies') assert.equal(state.companies[0].status, 'paused');
    const result = { id: randomUUID(), status: 'active', ...body };
    state[collection].push(result);
    return structuredClone(result);
  };
  return { api, state, writes };
}

test('creates four agents under one director, then reuses all resources without writes', async () => {
  const { api, state, writes } = fixture();
  const plan = await makePlan();
  const first = await bootstrap(api, plan);
  const count = writes.length;
  assert.deepEqual(await bootstrap(api, plan), first);
  assert.equal(writes.length, count);
  assert.equal(state.agents.length, 4);
  assert.equal(state.companies[0].status, 'paused');
  assert.equal(state.agents[0].reportsTo, null);
  for (const agent of state.agents) {
    assert.equal(agent.adapterConfig.model, 'gpt-5.6-sol');
    assert.equal(agent.runtimeConfig.heartbeat.enabled, false);
    assert.equal(agent.runtimeConfig.heartbeat.wakeOnDemand, false);
    assert.ok(agent.instructionsBundle.files['AGENTS.md'].includes('DinnerSwipe'));
    if (agent !== state.agents[0]) assert.equal(agent.reportsTo, state.agents[0].id);
  }
});

test('recovers after an agent was created but its response was lost', async () => {
  const { api, state } = fixture();
  let fail = true;
  const unreliable = async (...args) => {
    const result = await api(...args);
    if (fail && args[0] === 'POST' && args[1].endsWith('/agents')) {
      fail = false;
      throw new Error('Connection lost');
    }
    return result;
  };
  const plan = await makePlan();
  await assert.rejects(bootstrap(unreliable, plan), /Connection lost/);
  await bootstrap(api, plan);
  assert.equal(state.agents.length, 4);
});

test('rejects unrelated, ambiguous, or operating companies without writes', async () => {
  for (const scenario of ['unmanaged', 'duplicate', 'active']) {
    const { api, state, writes } = fixture();
    const plan = await makePlan();
    state.companies.push({ id: randomUUID(), ...plan.company, status: 'paused' });
    if (scenario === 'unmanaged') state.companies[0].description = 'User managed';
    if (scenario === 'duplicate') state.companies.push({ ...state.companies[0], id: randomUUID() });
    if (scenario === 'active') {
      state.companies[0].status = 'active';
      state.agents.push({ id: randomUUID() });
    }
    await assert.rejects(bootstrap(api, plan));
    assert.equal(writes.length, 0);
  }
});

test('rejects name collisions and changed reporting lines without overwriting them', async () => {
  const { api, state } = fixture();
  const plan = await makePlan();
  await bootstrap(api, plan);
  state.agents[1].reportsTo = randomUUID();
  await assert.rejects(bootstrap(api, plan), /Reporting line changed/);
  state.agents[1].reportsTo = state.agents[0].id;
  state.agents[1].metadata = {};
  await assert.rejects(bootstrap(api, plan), /Unmanaged agent/);
});

test('model override is explicit and does not use a fixed catalog', async () => {
  const plan = await makePlan('gpt-5.6-terra');
  assert.ok(plan.agents.every(a => a.adapterConfig.model === 'gpt-5.6-terra'));
  await assert.rejects(makePlan(' '));
});

test('client refuses insecure remote origins and credentials in URLs', () => {
  for (const url of ['http://example.com', 'https://user:pass@example.com', 'https://example.com/api', 'https://example.com/?token=x']) {
    assert.throws(() => apiClient(url, 'secret'));
  }
  assert.throws(() => apiClient('https://example.com', ''));
});

test('client disables redirects and does not expose server error bodies', async () => {
  const api = apiClient('https://example.com', 'secret', async (_url, options) => {
    assert.equal(options.redirect, 'error');
    assert.equal(options.headers.Authorization, 'Bearer secret');
    return new Response('secret database credentials', { status: 403 });
  });
  await assert.rejects(api('POST', '/companies', {}), error => error.message.includes('HTTP 403') && !error.message.includes('secret'));
});
