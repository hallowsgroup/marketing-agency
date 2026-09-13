// Run with the workspace tsx loader to check real upstream API validators.
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createAgentSchema } from '../../packages/shared/src/validators/agent.ts';
import { createCompanySchema } from '../../packages/shared/src/validators/company.ts';
import { createGoalSchema } from '../../packages/shared/src/validators/goal.ts';
import { createProjectSchema } from '../../packages/shared/src/validators/project.ts';
import { bootstrap, makePlan } from './bootstrap.mjs';

test('all bootstrap writes match current upstream contracts', async () => {
  const schemas = { companies: createCompanySchema, agents: createAgentSchema, goals: createGoalSchema, projects: createProjectSchema };
  const plan = await makePlan();
  const api = async (method, path, body) => {
    if (method === 'GET') return [];
    if (method === 'PATCH') return { id: path.split('/')[2], ...body };
    const schema = schemas[path.split('/').at(-1)];
    const parsed = schema.parse(body);
    for (const key of Object.keys(body)) assert.ok(key in parsed, `Unexpected stripped key ${key}`);
    return { id: randomUUID(), ...parsed };
  };
  const result = await bootstrap(api, plan);
  assert.equal(Object.keys(result.agentIds).length, 4);
});
