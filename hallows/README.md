# Hallows marketing agency

This fork starts at Paperclip `c9e3bb7ca40160b2ff80958ec1a8c0254638ad42`
(2026-09-12). Hallows deployment and DinnerSwipe configuration live in `hallows/`
and `docker-compose.hallows.yml`. The root Dockerfile, adapters, database schema,
authorization, and UI remain upstream-owned.

## What was ported

Inspected `hallowsgroup/opensoul` at
`5b8fab0` and its `packages/db/src/seed.ts`, Compose deployment, Serve configuration,
and role checks. The old seed creates six Claude agents with direct database
inserts. Its role names also appear in core authorization code. It is not a safe
drop-in update target.

The useful agency hierarchy, company/goal/project bootstrap, budget concept,
creative production, strategy, distribution, and analytics responsibilities are
adapted here. Four roles replace six: Marketing Director absorbs strategy;
Creative Lead absorbs production; Growth Lead and Analyst remain separate.
The detailed DinnerSwipe instructions are new. The inspected seed did not contain
role prompt files or explicit heartbeat schedules to copy.

The old deployment used a custom socat/tailscaled script and contradictory
Paperclip/OpenSoul exposure variables. This deployment uses Tailscale's normal
container entrypoint and declarative Serve configuration. No old internals,
branding substitutions, role enum changes, or database contents were copied.

The only upstream-file correction is `pnpm-lock.yaml`: refresh the existing
Claude ACP patch hash and include the already-declared `acorn` dependency.
No package version upgrades are required for this correction.

## Coolify setup

1. Create a **new** Git repository resource for `hallowsgroup/marketing-agency`.
   Use `feat/dinnerswipe-marketing` for the review deployment, or the merged commit
   later. Build pack: Docker Compose. Compose path: `/docker-compose.hallows.yml`.
   Use the repository root as the build context. The compose explicitly selects
   upstream's `production` Dockerfile target, not its final `cloud` target.
2. Leave all Coolify domains and port mappings empty. Disable proxy routing for
   this resource. Do not attach the stack to a public proxy network. Do not use
   the upstream quickstart Compose, which publishes an app port.
3. Copy the variable names from `hallows/.env.example` into Coolify. Generate
   independent `POSTGRES_PASSWORD` and `BETTER_AUTH_SECRET` values with
   `openssl rand -hex 32`. Use a hex database password so the PostgreSQL URL needs
   no escaping. Keep all secret values in Coolify, never GitHub.
4. Set `TS_AUTHKEY` to a suitable Tailscale node enrollment key. Set `TS_HOSTNAME`
   to a unique machine name, initially `hallows-marketing`. Enable MagicDNS and
   HTTPS certificates in the tailnet. Ensure its access policy permits intended
   operators to reach this node on TCP 443. Do not enable Funnel.
5. Set `PAPERCLIP_PUBLIC_URL` to the exact HTTPS machine FQDN with no path or port.
   After enrollment, confirm the actual machine name in Tailscale; name collisions
   can add a suffix. Correct the URL and redeploy if necessary.
6. Set `OPENAI_API_KEY`, or configure Codex login through Paperclip's supported
   provider setup after first boot. The `/paperclip` volume retains local provider
   state. Do not copy the Mac's Codex credentials into the repository. All four
   agents use `codex_local` and `gpt-5.6-sol`; other model IDs remain configurable.
7. Pin `TAILSCALE_IMAGE` to the tested tag or digest for production. The example
   defaults to `stable`. PostgreSQL uses the 17-alpine major line. Record the
   resolved image digests at rollout. Change `CLI_TOOLS_CACHE_EPOCH` deliberately
   when refreshing the upstream image's CLI tools; its Codex install uses latest.
8. Deploy. Retain all three new named volumes. The old OpenSoul resource and its
   volumes must remain separate. A source build includes Rust and the full UI;
   allow enough build memory and disk for the upstream image.

### Network behavior

Tailscale has an outbound-capable bridge plus an internal database network.
The app shares Tailscale's network namespace and listens on `127.0.0.1:3100`.
Serve terminates private HTTPS on 443 and proxies to that loopback address.
PostgreSQL joins only the internal database network. No service has `ports`,
host networking, a public domain, or a Docker socket mount. Userspace Tailscale
needs no `/dev/net/tun`, NET_ADMIN, socat, or container SSH server.

`PAPERCLIP_API_URL=http://127.0.0.1:3100` gives local Codex runs an authenticated
callback path independent of the browser-facing HTTPS URL. The deployment mode
remains authenticated/private. Tailscale does not replace Paperclip login.

References: [Tailscale Docker parameters](https://tailscale.com/docs/features/containers/docker/docker-params)
and [Serve](https://tailscale.com/docs/features/tailscale-serve).

## First login and DinnerSwipe bootstrap

Open the HTTPS address from a tailnet device. Complete Paperclip's initial admin
claim flow. If an invitation is needed, use the upstream auth bootstrap command
from the server container terminal:

```sh
pnpm paperclipai auth bootstrap-ceo
```

Keep invitation URLs private. Never run bootstrap against the old OpenSoul database.

Preview the exact configuration locally; this needs only Node and makes no calls:

```sh
node hallows/dinnerswipe/bootstrap.mjs --dry-run
```

Use an instance-admin **board** API key for applying the plan. An agent key cannot
create the company. The upstream `paperclipai connect` command supports browser
approval for a board login; `paperclipai token board create --ttl-days 1` creates
a short-lived key once authenticated. Supply its value through the environment
without putting it in shell history or command arguments. The bootstrap itself
does not create or save credentials.

```sh
export PAPERCLIP_BOOTSTRAP_URL=https://YOUR-MACHINE.YOUR-TAILNET.ts.net
# Set PAPERCLIP_BOARD_API_KEY using your secret manager or a hidden shell prompt.
node hallows/dinnerswipe/bootstrap.mjs --apply
unset PAPERCLIP_BOARD_API_KEY
```

Run one bootstrap process at a time. It creates DinnerSwipe, pauses it, creates
four agents with managed instruction bundles, and adds a company goal and launch
project. It uses normal API validation, memberships, and activity logging.
Reruns reuse marked resources without changing operator edits. Ambiguous names,
unmanaged DinnerSwipe companies, changed reporting lines, and active nonempty
companies stop the script. A failed call stops immediately; fix it and rerun.
Do not run concurrent bootstraps: the public company API has no template-level
transaction or uniqueness key. This script is not a general database migration.

| Agent | Paperclip role | Proposed monthly model cap | Proposed timer |
| --- | --- | ---: | --- |
| Marketing Director | ceo | $150 | 4 hours |
| Creative Lead | designer | $100 | 4 hours |
| Growth Lead | cmo | $100 | 4 hours |
| Analyst | researcher | $50 | 24 hours |

The proposed company cap is $400/month. These are editable model budgets, not
permission to spend on ads. The Director uses upstream's `ceo` role for the root
of the org chart; its displayed title is Marketing Director. There are no custom
role enum changes. Each agent has one concurrent run maximum. Both timer and
event wakes start disabled. Timers skip agents with no actionable work.

Set `DINNERSWIPE_CODEX_MODEL` before first bootstrap to choose another available
model. Rerunning does not overwrite existing model selections; change those in
Paperclip. There is no custom fixed model catalog to maintain.

## Acceptance and activation

1. Verify PostgreSQL, Tailscale, and app health checks pass. In the Tailscale
   container, `tailscale serve status` must show HTTPS 443 to localhost:3100 and
   no Funnel exposure. Check the deployment has no published ports.
2. Verify login from a permitted tailnet device and confirm the URL uses HTTPS.
   From outside the tailnet, verify the app is unreachable. Confirm the database
   has no public listener. Check mobile access if it is part of your workflow.
3. Review the four agents, reporting lines, instruction bundles, model, and caps.
   Confirm DinnerSwipe is paused. Configure the provider and test its connection.
4. Activate the company, leaving automatic wakes disabled. Enable on-demand wakes
   for the Director only. Assign a small read-only task: inspect the assigned task,
   return a short plan, and report through the Paperclip API. Manually invoke it.
   Confirm the run completes, callbacks authenticate, the model is Sol, and cost
   appears. Test a small temporary budget cap before broader activation.
5. Create initial tasks for a funnel instrumentation audit (Analyst), positioning
   and experiment priorities (Director), creative variants (Creative), and ASO /
   distribution readiness (Growth). Link them to the launch project and goal.
6. Enable each agent's timer and on-demand settings after its manual run works.
   The proposed intervals are already saved. Add a weekly experiment-review
   routine in Paperclip if desired; weekly wall-clock scheduling is not created
   by this bootstrap. The initial implementation uses queue-driven heartbeats.
7. Add n8n, Postiz, and adport as separate scoped connections. No publishing or ad
   credentials are included. Configure enforceable approval policies before
   enabling write actions. Validate each integration with a draft-only test.

## Backups, cutover, and rollback

Take a logical PostgreSQL dump and back up `/paperclip` together, including the
encrypted secrets master key, workspaces, uploads, and provider state. Protect
Tailscale state as sensitive data. Test restoration into a separate private stack.
A volume is not a backup. Do not copy or mount old OpenSoul volumes into this app:
their schema lineage and runtime assumptions have not been migration-tested.
If old history is needed, inspect an export and test import on a disposable copy.

Keep old OpenSoul paused during final cutover so two agencies cannot publish the
same work. Roll back by stopping the new stack and returning to the unchanged old
resource; retain the new volumes for diagnosis. After schema migrations, rolling
back an image alone may be unsafe: restore the matching pre-upgrade database and
app-data backup into separate volumes.

## Upstream maintenance

Keep the GitHub fork relationship and normal upstream commit history. Add
`https://github.com/paperclipai/paperclip.git` as remote `upstream` in local clones.
Fetch `upstream/master`, merge it on an update branch, run Hallows checks and the
upstream build/tests, and review a PR before deployment. Never force-reset the
Hallows deployment branch. Drop the lockfile repair once upstream carries the
same correction. Keep further customizations in `hallows/` where possible.

```sh
node --import ./cli/node_modules/tsx/dist/loader.mjs --test hallows/dinnerswipe/*.test.mjs
node --test hallows/deployment.test.mjs
docker compose -f docker-compose.hallows.yml config --quiet
pnpm -r typecheck
pnpm test:run
pnpm build
```

Compose validation requires the variables in `.env.example`; use dummy values
for static checks. A successful Compose parse does not prove a live deployment.
