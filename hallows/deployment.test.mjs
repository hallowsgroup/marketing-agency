import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

test('rendered Compose isolates the database and only serves the app through tailnet HTTPS', () => {
  const config = JSON.parse(execFileSync('docker', ['compose', '-f', 'docker-compose.hallows.yml', 'config', '--format', 'json'], {
    cwd: new URL('../', import.meta.url),
    env: { ...process.env, POSTGRES_PASSWORD: 'validation-only', BETTER_AUTH_SECRET: 'validation-only', TS_AUTHKEY: 'validation-only', PAPERCLIP_PUBLIC_URL: 'https://example.tailnet.ts.net' },
    encoding: 'utf8',
  }));
  for (const service of Object.values(config.services)) {
    assert.ok(!service.ports?.length, 'No host-published ports');
    assert.notEqual(service.network_mode, 'host');
  }
  assert.equal(config.networks.database.internal, true);
  assert.deepEqual(Object.keys(config.services.db.networks), ['database']);
  assert.equal(config.services.server.network_mode, 'service:tailscale');
  assert.equal(config.services.server.environment.HOST, '127.0.0.1');
  assert.equal(config.services.server.environment.PAPERCLIP_DEPLOYMENT_MODE, 'authenticated');
  assert.equal(config.services.server.environment.PAPERCLIP_DEPLOYMENT_EXPOSURE, 'private');
  assert.equal(config.services.server.build.target, 'production');
  const serve = JSON.parse(readFileSync(new URL('./tailscale/serve.json', import.meta.url)));
  assert.deepEqual(serve.TCP, { 443: { HTTPS: true } });
  assert.equal(serve.AllowFunnel, undefined);
  assert.equal(serve.Web['${TS_CERT_DOMAIN}:443'].Handlers['/'].Proxy, 'http://127.0.0.1:3100');
});
