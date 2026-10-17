import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULTS, normalizeConfig, parseHost } from '../src/config.js';

test('the defaults: risky commands off, hashed token, 10 s, French', () => {
  const config = normalizeConfig({});
  assert.equal(config.allowUnlock, false);
  assert.equal(config.allowPull, false);
  assert.equal(config.tokenMode, 'hashed');
  assert.equal(config.pollInterval, 10);
  assert.equal(config.language, 'fr');
  assert.equal(config.bridge, undefined);
  assert.equal(DEFAULTS.allow_unlock, false);
  assert.equal(DEFAULTS.allow_pull, false);
});

test('checkboxes from a form, bounds of the interval, unknown values', () => {
  const config = normalizeConfig({
    allow_unlock: 'true',
    allow_pull: '1',
    poll_interval: '1',
    token_mode: 'PLAIN',
    language: 'de',
    api_token: '  abc  ',
  });
  assert.equal(config.allowUnlock, true);
  assert.equal(config.allowPull, true);
  assert.equal(config.pollInterval, 5);
  assert.equal(config.tokenMode, 'plain');
  assert.equal(config.language, 'fr');
  assert.equal(config.token, 'abc');
  assert.equal(normalizeConfig({ poll_interval: 9999 }).pollInterval, 300);
  assert.equal(normalizeConfig({ poll_interval: 'x' }).pollInterval, 10);
  assert.equal(normalizeConfig({ token_mode: 'other' }).tokenMode, 'hashed');
  assert.equal(normalizeConfig({ allow_unlock: 'false' }).allowUnlock, false);
});

test('the bridge address names a host, nothing else', () => {
  assert.deepEqual(parseHost('192.168.1.50'), { host: '192.168.1.50', port: 80 });
  assert.deepEqual(parseHost(' http://192.168.1.50/ '), { host: '192.168.1.50', port: 80 });
  assert.deepEqual(parseHost('Tedee-Bridge.local:8080'), {
    host: 'tedee-bridge.local',
    port: 8080,
  });
  assert.deepEqual(parseHost('[fe80::1]'), { host: '[fe80::1]', port: 80 });
  for (const bad of [
    '',
    'https://192.168.1.50',
    '192.168.1.50/v1.0',
    'user@192.168.1.50',
    '192.168.1.50?x=1',
    '192.168.1.50:0',
    '192.168.1.50:70000',
    'a b',
    '[zz::1]',
    '-bad.local',
  ]) {
    assert.equal(parseHost(bad), undefined, bad);
  }
});
