import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

export const templateId = 'hallows/dinnerswipe/v1';
export const roles = [
  { key: 'director', name: 'Marketing Director', role: 'ceo', budget: 15000, interval: 14400 },
  { key: 'creative', name: 'Creative Lead', role: 'designer', budget: 10000, interval: 14400 },
  { key: 'growth', name: 'Growth Lead', role: 'cmo', budget: 10000, interval: 14400 },
  { key: 'analyst', name: 'Analyst', role: 'researcher', budget: 5000, interval: 86400 },
];

export async function makePlan(model = 'gpt-5.6-sol') {
  if (!model.trim()) throw new Error('Model must not be empty');
  const common = await readFile(new URL('./COMPANY.md', import.meta.url), 'utf8');
  const agents = await Promise.all(roles.map(async (role) => ({
    key: role.key,
    name: role.name,
    title: role.name,
    role: role.role,
    adapterType: 'codex_local',
    adapterConfig: { model, timeoutSec: 1800 },
    instructionsBundle: {
      entryFile: 'AGENTS.md',
      files: {
        'AGENTS.md': `${common}\n\n${await readFile(new URL(`./roles/${role.key}.md`, import.meta.url), 'utf8')}`,
      },
    },
    runtimeConfig: {
      heartbeat: {
        enabled: false,
        wakeOnDemand: false,
        intervalSec: role.interval,
        maxConcurrentRuns: 1,
        skipTimerWhenNoActionableWork: true,
      },
    },
    budgetMonthlyCents: role.budget,
    permissions: { canCreateAgents: false },
    metadata: { hallowsTemplate: templateId, hallowsRole: role.key },
  })));
  return {
    company: {
      name: 'DinnerSwipe',
      description: `DinnerSwipe marketing team. Managed bootstrap: ${templateId}`,
      budgetMonthlyCents: roles.reduce((sum, r) => sum + r.budget, 0),
    },
    agents,
  };
}

export function apiClient(baseUrl, token, request = fetch) {
  const base = new URL(baseUrl);
  if (base.username || base.password || base.search || base.hash || base.pathname !== '/') {
    throw new Error('Use a plain Paperclip origin without credentials, path, query, or fragment');
  }
  if (base.protocol !== 'https:' && !(base.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(base.hostname))) {
    throw new Error('Use HTTPS, or HTTP on loopback only');
  }
  if (!token?.trim()) throw new Error('PAPERCLIP_BOARD_API_KEY is required');
  return async (method, path, body) => {
    const response = await request(new URL(`/api${path}`, base), {
      method,
      redirect: 'error',
      signal: AbortSignal.timeout(30000),
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Origin: base.origin },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    // Do not print server bodies: errors can contain credentials or private data.
    if (!response.ok) throw new Error(`${method} ${path} failed (HTTP ${response.status}); bootstrap stopped. Fix the error and rerun.`);
    return response.json();
  };
}

function unique(items, predicate, label) {
  if (!Array.isArray(items)) throw new Error(`Unexpected ${label} list response`);
  const matches = items.filter(predicate);
  if (matches.length > 1) throw new Error(`Multiple ${label} matches; resolve ambiguity before retrying`);
  return matches[0];
}

// Run one bootstrap at a time. All writes use the supported authenticated API.
// Existing resources are reused, never overwritten or deleted.
export async function bootstrap(api, plan) {
  let company = unique(await api('GET', '/companies'), c => c.name === plan.company.name, 'company');
  if (company && company.description !== plan.company.description) {
    throw new Error('DinnerSwipe already exists outside this bootstrap; refusing to modify it');
  }
  if (!company) {
    company = await api('POST', '/companies', plan.company);
    company = await api('PATCH', `/companies/${company.id}`, { status: 'paused' });
  } else if (company.status !== 'paused') {
    // A lost response after company creation can leave an empty active company.
    // Recover only that empty state; never pause an operating company.
    const existing = await api('GET', `/companies/${company.id}/agents`);
    if (!Array.isArray(existing) || existing.length) throw new Error('Existing company must be paused before bootstrap');
    company = await api('PATCH', `/companies/${company.id}`, { status: 'paused' });
  }
  const prefix = `/companies/${company.id}`;
  const existingAgents = await api('GET', `${prefix}/agents`);
  const created = {};
  for (const { key, ...spec } of plan.agents) {
    let agent = unique(existingAgents, a => a.metadata?.hallowsTemplate === templateId && a.metadata?.hallowsRole === key, 'agent');
    if (!agent) {
      if (existingAgents.some(a => a.name === spec.name)) throw new Error(`Unmanaged agent already uses ${spec.name}`);
      agent = await api('POST', `${prefix}/agents`, { ...spec, reportsTo: key === 'director' ? null : created.director.id });
    } else if ((agent.reportsTo ?? null) !== (key === 'director' ? null : created.director.id)) {
      throw new Error(`Reporting line changed for ${spec.name}; review manually`);
    }
    created[key] = agent;
  }
  const goalTitle = 'DinnerSwipe: measurable shared dinner decisions';
  let goal = unique(await api('GET', `${prefix}/goals`), g => g.title === goalTitle, 'goal');
  if (!goal) goal = await api('POST', `${prefix}/goals`, {
    title: goalTitle,
    description: 'Establish the funnel baseline, then improve activation and retention with reviewed experiments.',
    level: 'company', status: 'active', ownerAgentId: created.director.id,
  });
  const projectName = 'DinnerSwipe marketing launch';
  let project = unique(await api('GET', `${prefix}/projects`), p => p.name === projectName, 'project');
  if (!project) project = await api('POST', `${prefix}/projects`, {
    name: projectName, goalId: goal.id, leadAgentId: created.director.id,
    status: 'planned', description: 'Measurement, positioning, creative, distribution, and experiment reviews.',
  });
  return { companyId: company.id, agentIds: Object.fromEntries(Object.entries(created).map(([key, value]) => [key, value.id])), goalId: goal.id, projectId: project.id, status: 'paused' };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const args = process.argv.slice(2);
    if (args.some(arg => !['--apply', '--dry-run'].includes(arg)) || args.length > 1) throw new Error('Usage: node hallows/dinnerswipe/bootstrap.mjs [--dry-run|--apply]');
    const plan = await makePlan(process.env.DINNERSWIPE_CODEX_MODEL ?? 'gpt-5.6-sol');
    if (args.includes('--apply')) {
      const api = apiClient(process.env.PAPERCLIP_BOOTSTRAP_URL ?? '', process.env.PAPERCLIP_BOARD_API_KEY);
      console.log(JSON.stringify(await bootstrap(api, plan), null, 2));
    } else {
      console.log(JSON.stringify(plan, null, 2));
    }
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
