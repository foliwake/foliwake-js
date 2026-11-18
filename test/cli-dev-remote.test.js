// `foliwake dev --remote` of @foliwake/cli: route classification, the /media allowlist, Host/Origin checks,
// header allowlists in both directions, credential handling and redaction, configuration and command-line
// parsing, extraction of the remote document, the server's redirect and cancellation boundaries (fake fetch on
// loopback), and a page of a fixture site served in the local shell with this checkout's code.
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, test } from 'node:test';

import { createRequire } from 'node:module';

import Dev from '../packages/cli/dist/commands/dev.js';
import { devProblem, withRemoteValue } from '../packages/cli/dist/dev/flags.js';
import { renderPageShell } from '../packages/cli/dist/dev/html.js';
import {
  RemoteConfigError,
  parseRemoteConfig,
  parseRemoteUrl,
  readRemoteCredential,
  redactor,
  resolveRemoteTarget,
} from '../packages/cli/dist/dev/remote-config.js';
import { createRemoteDevServer, startRemoteDevServer } from '../packages/cli/dist/dev/remote-dev.js';
import { compatibilityProblems, extractRemotePage, remoteText } from '../packages/cli/dist/dev/remote-page.js';
import {
  REMOTE_MEDIA_PATTERN,
  checkLocalRequest,
  classifyRemoteRoute,
  pickRemoteHeaders,
  remoteRequestHeaders,
  remoteUrl,
} from '../packages/cli/dist/dev/remote-routes.js';

import { cliHome, runCli } from './helpers/cli.js';
import { startStubOrigin } from './helpers/stub-origin.js';

// oclif is a dependency of the CLI package, not of the workspace root.
const { Parser } = createRequire(new URL('../packages/cli/package.json', import.meta.url))('@oclif/core');

async function parseDev(argv) {
  const parsed = await Parser.parse(withRemoteValue(argv), { flags: Dev.flags, args: {}, strict: true });
  const problem = devProblem(parsed.flags);
  if (problem) throw new Error(problem);
  return parsed.flags;
}

const HASH = '0123456789abcdef'.repeat(4);

describe('route classification', () => {
  test('local code, media, deployed code, dev and pages', () => {
    assert.deepEqual(classifyRemoteRoute('/styles/styles.css'), {
      kind: 'code',
      prefix: 'styles',
      rest: ['styles.css'],
    });
    assert.deepEqual(classifyRemoteRoute('/scripts/components.js'), {
      kind: 'code',
      prefix: 'scripts',
      rest: ['components.js'],
    });
    assert.deepEqual(classifyRemoteRoute('/components/hero/hero.css'), {
      kind: 'code',
      prefix: 'components',
      rest: ['hero', 'hero.css'],
    });
    assert.deepEqual(classifyRemoteRoute(`/media/${HASH}.webp`), { kind: 'media', path: `/media/${HASH}.webp` });
    assert.deepEqual(classifyRemoteRoute('/code/cd_x/scripts/components.js'), { kind: 'deployed-code' });
    assert.deepEqual(classifyRemoteRoute('/code'), { kind: 'deployed-code' });
    assert.deepEqual(classifyRemoteRoute('/_dev/diagnostics'), { kind: 'dev', path: '/_dev/diagnostics' });
    assert.deepEqual(classifyRemoteRoute('/'), { kind: 'page', path: '/' });
    assert.deepEqual(classifyRemoteRoute('/articles'), { kind: 'page', path: '/articles' });
    assert.deepEqual(classifyRemoteRoute('/es/articles/receta'), { kind: 'page', path: '/es/articles/receta' });
    assert.deepEqual(classifyRemoteRoute('/articles/'), { kind: 'page', path: '/articles/' });
    assert.deepEqual(classifyRemoteRoute('/es/art%C3%ADculos'), { kind: 'page', path: '/es/art%C3%ADculos' });
  });

  test('unsafe paths are not-found and never forwarded', () => {
    for (const p of [
      '',
      'articles',
      '//evil.example/x',
      '/a//b',
      '/../x',
      '/a/../b',
      '/a/./b',
      '/a%2fb',
      '/a%2F..',
      '/a%5cb',
      '/a\\b',
      '/a%00',
      '/%E0%A4%A',
      '/.git/config',
      '/a/.env',
      `/${'x'.repeat(2100)}`,
    ]) {
      assert.deepEqual(classifyRemoteRoute(p), { kind: 'not-found' }, p);
    }
  });

  test('the /media allowlist: 64 lowercase hex and an image extension only', () => {
    for (const ext of ['jpg', 'jpeg', 'png', 'gif', 'webp', 'avif'])
      assert.ok(REMOTE_MEDIA_PATTERN.test(`/media/${HASH}.${ext}`), ext);
    for (const p of [
      `/media/${HASH}.svg`,
      `/media/${HASH}.html`,
      `/media/${HASH.toUpperCase()}.png`,
      `/media/${HASH.slice(1)}.png`,
      `/media/${HASH}0.png`,
      `/media/${HASH}.png/x`,
      `/media/x/${HASH}.png`,
      '/media/images/a.jpg',
      `/media/${HASH}.PNG`,
      `/media/${HASH}`,
    ]) {
      assert.equal(REMOTE_MEDIA_PATTERN.test(p), false, p);
      assert.deepEqual(classifyRemoteRoute(p), { kind: 'not-found' }, p);
    }
  });

  test('remote URLs stay on the configured origin and keep the query', () => {
    const origin = 'https://preview.example.org';
    assert.equal(
      remoteUrl(origin, '/articles', 'page=2&q=a%20b')?.href,
      'https://preview.example.org/articles?page=2&q=a%20b',
    );
    assert.equal(remoteUrl(origin, '/es/articles', '')?.href, 'https://preview.example.org/es/articles');
    assert.equal(remoteUrl(origin, '//evil.example/x', ''), null);
    assert.equal(remoteUrl(origin, '/a', 'x#y'), null);
    assert.equal(remoteUrl(origin, '/a', 'x'.repeat(3000)), null);
  });
});

describe('local request checks', () => {
  test('Host must be a loopback name with the listening port', () => {
    assert.deepEqual(checkLocalRequest({ host: '127.0.0.1:3001' }, 3001), { ok: true });
    assert.deepEqual(checkLocalRequest({ host: 'localhost:3001' }, 3001), { ok: true });
    assert.deepEqual(checkLocalRequest({ host: '[::1]:3001' }, 3001), { ok: true });
    assert.deepEqual(checkLocalRequest({ host: 'site.localhost:3001' }, 3001), { ok: true });
    for (const host of [
      undefined,
      '',
      '127.0.0.1',
      '127.0.0.1:3002',
      'evil.example:3001',
      'evil.example',
      '127.0.0.1.nip.io:3001',
      'localhost:3001:1',
    ]) {
      const result = checkLocalRequest({ host }, 3001);
      assert.equal(result.ok, false, String(host));
      assert.equal(result.status, 421, String(host));
    }
  });

  test('a foreign Origin is refused with 403; the same origin is fine', () => {
    assert.deepEqual(checkLocalRequest({ host: '127.0.0.1:3001', origin: 'http://127.0.0.1:3001' }, 3001), {
      ok: true,
    });
    assert.deepEqual(checkLocalRequest({ host: 'localhost:3001', origin: 'http://localhost:3001' }, 3001), {
      ok: true,
    });
    for (const origin of [
      'http://evil.example',
      'null',
      'http://localhost:3001',
      'https://127.0.0.1:3001',
      'http://127.0.0.1:3002',
    ]) {
      const result = checkLocalRequest({ host: '127.0.0.1:3001', origin }, 3001);
      assert.equal(result.status, 403, origin);
    }
  });
});

describe('header allowlists', () => {
  test('requests to the remote site: fixed headers, validated Accept-Language, configured Authorization', () => {
    assert.deepEqual(
      remoteRequestHeaders({ kind: 'page', acceptLanguage: 'es-ES,es;q=0.9', authorization: 'Basic abc' }),
      {
        Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.1',
        'User-Agent': 'foliwake-dev',
        'Cache-Control': 'no-cache',
        'Accept-Language': 'es-ES,es;q=0.9',
        Authorization: 'Basic abc',
      },
    );
    assert.deepEqual(remoteRequestHeaders({ kind: 'media', acceptLanguage: 'x\r\nCookie: a=b', authorization: null }), {
      Accept: 'image/avif,image/webp,image/*;q=0.8',
      'User-Agent': 'foliwake-dev',
    });
    assert.equal(
      remoteRequestHeaders({ kind: 'page', acceptLanguage: ['en', 'es'], authorization: null })['Accept-Language'],
      undefined,
    );
  });

  test('responses from the remote site: only validated release IDs pass', () => {
    const headers = new Headers({
      'Set-Cookie': 'sid=1',
      'WWW-Authenticate': 'Basic realm="x"',
      'Proxy-Authenticate': 'Basic',
      Connection: 'keep-alive',
      'Keep-Alive': 'timeout=5',
      'Transfer-Encoding': 'chunked',
      'Strict-Transport-Security': 'max-age=1',
      'Cache-Control': 'public, max-age=31536000, immutable',
      'Access-Control-Allow-Origin': '*',
      Location: 'https://evil.example/',
      'X-Preview-Release': `sr_${'a'.repeat(32)}`,
      'X-Code-Release': `cd_${'b'.repeat(32)}`,
    });
    assert.deepEqual(pickRemoteHeaders(headers), {
      'X-Preview-Release': `sr_${'a'.repeat(32)}`,
      'X-Code-Release': `cd_${'b'.repeat(32)}`,
    });
    assert.deepEqual(pickRemoteHeaders(new Headers({ 'X-Code-Release': 'cd_x; Set-Cookie: a' })), {});
    assert.deepEqual(pickRemoteHeaders(new Headers({ 'X-Code-Release': '<script>' })), {});
  });
});

describe('credentials', () => {
  const tgt = {
    channel: 'preview',
    origin: 'https://preview.example.org',
    auth: { type: 'basic', username: 'owner', passwordEnv: 'DEMO_PW' },
    from: 'foliwake.remote.json',
  };

  test('read from the named variable; missing or empty refuses with the NAME only', () => {
    const credential = readRemoteCredential(tgt, { DEMO_PW: 's3cr3t:pw' });
    assert.equal(credential.authorization, `Basic ${Buffer.from('owner:s3cr3t:pw').toString('base64')}`);
    for (const env of [{}, { DEMO_PW: '' }]) {
      assert.throws(
        () => readRemoteCredential(tgt, env),
        (error) => error instanceof RemoteConfigError && /DEMO_PW is not set/.test(error.message),
      );
    }
    assert.deepEqual(readRemoteCredential({ ...tgt, auth: null }, {}), { authorization: null, secrets: [] });
  });

  test('redaction removes the password and its encodings', () => {
    const credential = readRemoteCredential(tgt, { DEMO_PW: 'p@ss word!' });
    const redact = redactor(credential.secrets);
    const encoded = Buffer.from('owner:p@ss word!').toString('base64');
    const text = redact(`a p@ss word! b ${encoded} c p%40ss%20word! d Basic ${encoded}`);
    assert.equal(text, 'a [redacted] b [redacted] c [redacted] d Basic [redacted]');
    assert.equal(redactor([])('nothing'), 'nothing');
  });
});

describe('remote configuration', () => {
  const file = (preview, live) =>
    JSON.stringify({ version: 2, site: 'demo', ...(preview ? { preview } : {}), ...(live ? { live } : {}) });
  const auth = { type: 'basic', username: 'owner', passwordEnv: 'FOLIWAKE_DEMO_PASSWORD' };

  test('preview and live endpoints with env var names', () => {
    const text = file(
      { url: 'https://preview.foliwake.example', auth },
      { url: 'https://demo.foliwake.example/', auth },
    );
    assert.deepEqual(parseRemoteConfig(text, 'preview'), { origin: 'https://preview.foliwake.example', auth });
    assert.deepEqual(parseRemoteConfig(text, 'live'), { origin: 'https://demo.foliwake.example', auth });
    assert.deepEqual(parseRemoteConfig(file({ url: 'http://127.0.0.1:18681' }), 'preview'), {
      origin: 'http://127.0.0.1:18681',
      auth: null,
    });
  });

  test('a service-token endpoint is for app servers: dev --remote refuses it and still reads a basic one', () => {
    const serviceToken = {
      type: 'service-token',
      issuer: 'demo-app',
      kid: 'demo-2026-11',
      privateKeyEnv: 'FOLIWAKE_DEMO_SIGNING_KEY',
    };
    const preview = { url: 'https://preview.foliwake.example', auth };
    const text = file(preview, { url: 'https://demo.worker.example', auth: serviceToken });
    const refusal = /"basic" auth only; "service-token" is for an app server/;
    const refusedForDev = (error) => error instanceof RemoteConfigError && refusal.test(error.message);
    assert.throws(() => parseRemoteConfig(text, 'live'), refusedForDev);
    assert.deepEqual(parseRemoteConfig(text, 'preview'), { origin: 'https://preview.foliwake.example', auth });
  });

  test('live is never replaced by preview (and vice versa)', () => {
    assert.throws(
      () => parseRemoteConfig(file({ url: 'https://p.example' }), 'live'),
      /no "live" endpoint\. Live is never replaced by preview/,
    );
    assert.throws(
      () => parseRemoteConfig(file(null, { url: 'https://l.example' }), 'preview'),
      /no "preview" endpoint/,
    );
  });

  test('secrets, unknown keys and bad values are refused', () => {
    const cases = [
      [file({ url: 'https://p.example', auth: { ...auth, password: 'x' } }), /looks like a stored secret/],
      [
        JSON.stringify({ version: 2, site: 'demo', token: 'x', preview: { url: 'https://p.example' } }),
        /looks like a stored secret/,
      ],
      [
        file({ url: 'https://p.example', auth: { ...auth, passwordEnv: 'hunter2 value' } }),
        /NAME of an environment variable/,
      ],
      [file({ url: 'https://p.example', auth: { ...auth, type: 'bearer' } }), /"basic" or "service-token"/],
      [file({ url: 'https://p.example', extra: 1 }), /unknown key "extra"/],
      [file({ url: 'http://preview.example.org' }), /plain http; use https/],
      [file({ url: 'https://owner:pw@preview.example.org' }), /must not contain a user name or password/],
      [file({ url: 'https://p.example/sub' }), /origin only/],
      [file({ url: 'https://p.example/?a=1' }), /origin only/],
      [file({ url: 'ftp://p.example' }), /only https/],
      [JSON.stringify({ version: 1, preview: { url: 'https://p.example' } }), /unsupported "version" 1/],
      [
        JSON.stringify({ version: 3, site: 'demo', preview: { url: 'https://p.example' } }),
        /unsupported "version" 3; it must be 2/,
      ],
      [JSON.stringify({ version: 2, preview: { url: 'https://p.example' } }), /"site"/],
      ['{', /not valid JSON/],
    ];
    for (const [text, pattern] of cases) assert.throws(() => parseRemoteConfig(text, 'preview'), pattern, text);
  });

  test('http only for loopback hosts', () => {
    for (const url of [
      'http://127.0.0.1:1',
      'http://localhost:2',
      'http://a.localhost',
      'http://[::1]:3',
      'http://127.1.2.3',
    ])
      assert.ok(parseRemoteUrl(url, 'x'), url);
    for (const url of ['http://10.0.0.1', 'http://example.org', 'http://127.0.0.1.nip.io'])
      assert.throws(() => parseRemoteUrl(url, 'x'), /use https/, url);
  });

  test('the file is read from the working directory only without --remote-url', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'foliwake-remote-'));
    try {
      await assert.rejects(resolveRemoteTarget({ channel: 'preview' }, dir), /No foliwake\.remote\.json in/);
      await writeFile(
        path.join(dir, 'foliwake.remote.json'),
        file({ url: 'https://preview.foliwake.example', auth }, { url: 'https://demo.foliwake.example', auth }),
      );
      assert.deepEqual(await resolveRemoteTarget({ channel: 'preview' }, dir), {
        channel: 'preview',
        origin: 'https://preview.foliwake.example',
        auth,
        from: 'foliwake.remote.json',
      });
      assert.equal((await resolveRemoteTarget({ channel: 'live' }, dir)).origin, 'https://demo.foliwake.example');
      await writeFile(path.join(dir, 'local.remote.json'), file({ url: 'http://127.0.0.1:18791' }));
      assert.deepEqual(await resolveRemoteTarget({ channel: 'preview', configFile: 'local.remote.json' }, dir), {
        channel: 'preview',
        origin: 'http://127.0.0.1:18791',
        auth: null,
        from: 'local.remote.json',
      });
      await assert.rejects(
        resolveRemoteTarget({ channel: 'preview', configFile: 'nope.json' }, dir),
        /--remote-config: .*nope\.json does not exist/,
      );
      const byUrl = await resolveRemoteTarget({ channel: 'live', url: 'https://other.example.org' }, dir);
      assert.deepEqual(byUrl, {
        channel: 'live',
        origin: 'https://other.example.org',
        auth: null,
        from: '--remote-url',
      });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe('command line', () => {
  test('--remote defaults to preview; live only when named', async () => {
    assert.equal((await parseDev(['--remote'])).remote, 'preview');
    assert.equal((await parseDev(['--remote', '--watch'])).remote, 'preview');
    assert.equal((await parseDev(['--remote', '--watch'])).watch, true);
    assert.equal((await parseDev(['--watch', '--remote'])).remote, 'preview');
    assert.equal((await parseDev(['--remote', 'preview'])).remote, 'preview');
    assert.equal((await parseDev(['--remote', 'live', '--port', '3001'])).remote, 'live');
    assert.equal((await parseDev(['--remote=live'])).remote, 'live');
    assert.equal((await parseDev([])).remote, undefined);
  });

  test('invalid combinations are usage errors', async () => {
    await assert.rejects(parseDev(['--remote', 'staging']), /Unknown remote target "staging"/);
    await assert.rejects(parseDev(['--remote', '--content', 'x']), /Nonexistent flag/);
    await assert.rejects(parseDev(['--remote-auth-env', 'X']), /applies with --remote-url/);
    await assert.rejects(
      parseDev(['--remote', '--remote-auth-env', 'X', '--remote-auth-user', 'u']),
      /apply with --remote-url/,
    );
    await assert.rejects(
      parseDev(['--remote-url', 'https://p.example', '--remote-auth-env', 'X']),
      /must be given together/,
    );
    await assert.rejects(parseDev(['--remote-config', 'x.json']), /--remote-config applies with --remote/);
    await assert.rejects(
      parseDev(['--remote', '--remote-config', 'x.json', '--remote-url', 'https://p.example']),
      /either --remote-config or --remote-url/,
    );
    assert.equal((await parseDev(['--remote', 'live', '--remote-config', 'x.json']))['remote-config'], 'x.json');
    const parsed = await parseDev([
      '--remote-url',
      'https://p.example',
      '--remote-auth-env',
      'X',
      '--remote-auth-user',
      'u',
    ]);
    assert.equal(parsed['remote-url'], 'https://p.example');
    assert.match((await runCli(['dev', '--help'])).stdout, /--remote=\[preview\|live\]/);
  });
});

describe('the remote document', () => {
  const doc = `<!doctype html>
<html lang="es" data-env="preview" data-html-contract="1">
<head>
<meta charset="utf-8"><title>Recetas &amp; más</title>
<meta name="DESCRIPTION" content="Una &quot;descripción&quot;">
<link rel="stylesheet" href="/code/cd_abc/styles/styles.css">
<script type="module" src="/code/cd_abc/scripts/components.js"></script>
</head>
<body>
<header><a href="/code/cd_abc/x">deployed</a></header>
<main class="x">
<!-- comment -->
<h1 id="t">Hola</h1><img src="/media/${HASH}.jpg" srcset="/media/${HASH}.jpg 1x" alt="">
<section data-component="hero"><p>a</p></section><div data-component="accordion"><div data-component="hero"></div></div>
<template><div data-component="question"></div></template>
</main>
</body>
</html>`;

  test('keeps the children of <main>, title, description, lang and contract only', () => {
    const page = extractRemotePage(doc);
    assert.equal(page.lang, 'es');
    assert.equal(page.htmlContract, '1');
    assert.equal(page.title, 'Recetas & más');
    assert.equal(page.description, 'Una "descripción"');
    assert.deepEqual(page.components, ['hero', 'accordion', 'question']);
    assert.match(page.body, /<h1 id="t">Hola<\/h1>/);
    assert.match(page.body, new RegExp(`<img src="/media/${HASH}.jpg" srcset="/media/${HASH}.jpg 1x" alt="">`));
    assert.doesNotMatch(page.body, /\/code\/|<header|<main/);
    const shell = renderPageShell({ page, lang: page.lang, htmlContract: 1 });
    assert.doesNotMatch(shell, /\/code\//);
    assert.match(shell, /<title>Recetas &amp; más<\/title>/);
    assert.match(shell, /content="Una &quot;descripción&quot;"/);
  });

  test('no <main> → null; the visible text of error pages', () => {
    assert.equal(extractRemotePage('<p>hello</p>'), null);
    assert.equal(
      remoteText(
        '<html><head><style>x{}</style></head><body><h1>Oops</h1><p>Line ' +
          '<b>two</b></p><script>bad()</script></body></html>',
      ),
      'Oops\nLine two',
    );
  });

  test('compatibility: contract, undeclared components, descriptor errors of used components', () => {
    const page = {
      lang: 'en',
      htmlContract: '2',
      title: '',
      description: null,
      body: '',
      components: ['hero', 'carousel'],
    };
    const descriptor = { htmlContract: 1, components: { hero: { css: true, js: false } } };
    const diagnostics = [
      {
        code: 'CODE_ASSET_MISSING',
        severity: 'error',
        file: 'components/hero/hero.css',
        line: 1,
        column: 1,
        component: 'hero',
        field: null,
        message: 'missing',
        fix: null,
      },
      {
        code: 'CODE_ASSET_MISSING',
        severity: 'error',
        file: 'components/other/other.js',
        line: 1,
        column: 1,
        component: 'other',
        field: null,
        message: 'missing',
        fix: null,
      },
      {
        code: 'CODE_ASSET_UNDECLARED',
        severity: 'warning',
        file: 'components/hero/hero.js',
        line: 1,
        column: 1,
        component: 'hero',
        field: null,
        message: 'warn',
        fix: null,
      },
    ];
    const problems = compatibilityProblems({ page, descriptor, descriptorDiagnostics: diagnostics, engineContract: 1 });
    assert.deepEqual(
      problems.map((p) => p.code),
      ['REMOTE_CONTRACT_MISMATCH', 'REMOTE_CONTRACT_MISMATCH', 'CODE_COMPONENT_NOT_DECLARED', 'CODE_ASSET_MISSING'],
    );
    assert.match(problems[0].message, /contract 2, this CLI's frontend checks use contract 1/);
    assert.match(problems[1].message, /htmlContract 1, the remote page uses 2/);
    assert.match(problems[2].message, /"carousel"/);
    assert.deepEqual(
      compatibilityProblems({
        page: { ...page, htmlContract: '1', components: ['hero'] },
        descriptor,
        descriptorDiagnostics: [],
        engineContract: 1,
      }),
      [],
    );
    assert.equal(
      compatibilityProblems({
        page: { ...page, htmlContract: null, components: [] },
        descriptor,
        descriptorDiagnostics: [],
        engineContract: 1,
      })[0].code,
      'REMOTE_CONTRACT_MISSING',
    );
  });
});

describe('server boundaries (fake fetch, loopback only)', () => {
  const ORIGIN = 'https://preview.example.test';
  const tgt = { channel: 'preview', origin: ORIGIN, auth: null, from: 'test' };

  // A server whose upstream is `respond(url, init)`; every fetch init is recorded.
  async function startServer(respond) {
    const calls = [];
    const server = createRemoteDevServer({
      cwd: os.tmpdir(),
      target: tgt,
      authorization: null,
      log: () => {},
      timeoutMs: 5000,
      fetch: async (url, init) => {
        calls.push({ url, init });
        return respond(url, init);
      },
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const port = server.address().port;
    return {
      server,
      calls,
      port,
      get: (pathname) => fetch(`http://127.0.0.1:${port}${pathname}`, { redirect: 'manual' }),
      close: async () => {
        server.closeAllConnections();
        await new Promise((resolve) => server.close(resolve));
      },
    };
  }

  const waitFor = async (predicate) => {
    for (let i = 0; i < 200 && !predicate(); i++) await new Promise((resolve) => setTimeout(resolve, 10));
    assert.ok(predicate(), 'condition not reached');
  };

  // A request that never completes (the client may destroy it); errors are expected.
  function openRequest(port, pathname) {
    const request = http.get({ host: '127.0.0.1', port, path: pathname });
    request.on('error', () => {});
    request.on('response', (res) => res.resume());
    return request;
  }

  // A fetch that waits until its signal aborts (and never otherwise answers).
  const hangUntilAborted = (_url, init) =>
    new Promise((_resolve, reject) => {
      init.signal.addEventListener('abort', () => reject(init.signal.reason), { once: true });
    });

  // Headers arrive, then one chunk; the rest of the body only ends when the signal aborts.
  const stallBody = (contentType) => (_url, init) => {
    const body = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('<!doctype html><html><body><main>'));
        init.signal.addEventListener('abort', () => controller.error(init.signal.reason), { once: true });
      },
    });
    return new Response(body, { status: 200, headers: { 'Content-Type': contentType } });
  };

  test('redirects whose path would leave the local origin are refused (page and media)', async () => {
    const locations = [
      `${ORIGIN}//external.example/path`,
      `${ORIGIN}/\\external.example/path`,
      `${ORIGIN}/\\/external.example/path`,
      '//preview.example.test//external.example/path',
      '/\\external.example/path',
    ];
    for (const location of locations) {
      const dev = await startServer(() => new Response(null, { status: 302, headers: { Location: location } }));
      try {
        for (const pathname of ['/redirect', `/media/${HASH}.png`]) {
          const res = await dev.get(pathname);
          const text = await res.text();
          const where = `${pathname} → ${location}`;
          assert.equal(res.status, 502, where);
          assert.equal(res.headers.get('location'), null, where);
          assert.ok(!text.includes('Redirect to //'), where);
        }
      } finally {
        await dev.close();
      }
    }
  });

  test('same-origin redirects stay local paths on this origin (page and media)', async () => {
    const dev = await startServer((url) =>
      url.pathname === '/old'
        ? new Response(null, { status: 301, headers: { Location: `${ORIGIN}/new/page?x=1` } })
        : new Response(null, { status: 302, headers: { Location: `/media/${'b'.repeat(64)}.png` } }),
    );
    try {
      const page = await dev.get('/old');
      assert.equal(page.status, 302);
      assert.equal(page.headers.get('location'), '/new/page?x=1');
      const media = await dev.get(`/media/${HASH}.png`);
      assert.equal(media.status, 302);
      assert.equal(media.headers.get('location'), `/media/${'b'.repeat(64)}.png`);
      for (const res of [page, media])
        assert.equal(
          new URL(res.headers.get('location'), `http://127.0.0.1:${dev.port}`).origin,
          `http://127.0.0.1:${dev.port}`,
        );
    } finally {
      await dev.close();
    }
  });

  test('a client disconnect before the remote answers aborts the upstream request (page and media)', async () => {
    for (const pathname of ['/slow', `/media/${HASH}.png`]) {
      const dev = await startServer(hangUntilAborted);
      try {
        const request = openRequest(dev.port, pathname);
        await waitFor(() => dev.calls.length === 1);
        assert.equal(dev.calls[0].init.signal.aborted, false, pathname);
        request.destroy();
        await waitFor(() => dev.calls[0].init.signal.aborted);
      } finally {
        await dev.close();
      }
    }
  });

  test('a client disconnect while the remote body is read aborts the upstream request (page and media)', async () => {
    for (const [pathname, type] of [
      ['/slow-body', 'text/html; charset=utf-8'],
      [`/media/${HASH}.png`, 'image/png'],
    ]) {
      let bodyStarted = false;
      const dev = await startServer((url, init) => {
        bodyStarted = true;
        return stallBody(type)(url, init);
      });
      try {
        const request = openRequest(dev.port, pathname);
        await waitFor(() => bodyStarted);
        await new Promise((resolve) => setTimeout(resolve, 20));
        assert.equal(dev.calls[0].init.signal.aborted, false, pathname);
        request.destroy();
        await waitFor(() => dev.calls[0].init.signal.aborted);
      } finally {
        await dev.close();
      }
    }
  });

  test('stopping the server aborts active upstream requests', async () => {
    const dev = await startServer(hangUntilAborted);
    const request = openRequest(dev.port, '/slow');
    try {
      await waitFor(() => dev.calls.length === 1);
      const closed = new Promise((resolve) => dev.server.close(resolve));
      await waitFor(() => dev.calls[0].init.signal.aborted);
      await closed;
    } finally {
      request.destroy();
      dev.server.closeAllConnections();
    }
  });

  test('a completed request leaves its upstream signal unaborted', async () => {
    const dev = await startServer(
      () =>
        new Response(
          '<!doctype html><html ' +
            'data-html-contract="1"><head><title>t</title></head><body><main><p>x</p></main></body></html>',
          { status: 200, headers: { 'Content-Type': 'text/html' } },
        ),
    );
    try {
      const res = await dev.get('/done');
      assert.equal(res.status, 200);
      await res.text();
      await new Promise((resolve) => setTimeout(resolve, 50));
      assert.equal(dev.calls[0].init.signal.aborted, false);
    } finally {
      await dev.close();
    }
  });
});

describe('a fixture site served with this checkout’s code', () => {
  const PAGE = [
    '<!doctype html>',
    '<html lang="es" data-html-contract="2">',
    '<head><title>Inicio</title><link rel="stylesheet" href="/code/cd_x/styles/styles.css"></head>',
    '<body><header>remote chrome</header>',
    '<main><h1>Hola</h1><section data-component="hero"><p>a</p></section></main>',
    '<footer>remote footer</footer></body></html>',
  ].join('\n');
  let origin;
  let checkout;
  let server;
  let base;

  async function writeCheckout(dir) {
    const files = {
      'components/hero/hero.css': '.hero{}',
      'components/hero/hero.js': 'export default function hero() {}',
      'scripts/components.js': "import '@foliwake/block-kit';",
      'styles/styles.css': 'body{}',
    };
    for (const [file, text] of Object.entries(files)) {
      await mkdir(path.dirname(path.join(dir, file)), { recursive: true });
      await writeFile(path.join(dir, file), text);
    }
  }

  before(async () => {
    origin = await startStubOrigin({
      '/': { headers: { 'Content-Type': 'text/html; charset=utf-8' }, body: PAGE },
    });
    checkout = await mkdtemp(path.join(os.tmpdir(), 'foliwake-dev-remote-'));
    await writeCheckout(checkout);
    const target = { channel: 'preview', origin: origin.origin, auth: null, from: '--remote-url' };
    server = await startRemoteDevServer({ cwd: checkout, port: 0, target, authorization: null, log: () => {} });
    base = `http://127.0.0.1:${server.address().port}`;
  });

  after(async () => {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    await origin.close();
    await rm(checkout, { recursive: true, force: true });
  });

  test('the remote page: only <main>, <title> and lang kept, in the local shell with the import map', async () => {
    const response = await fetch(`${base}/`);
    assert.equal(response.status, 200);
    const html = await response.text();
    assert.match(html, /<html lang="es" data-env="local" data-html-contract="2">/);
    assert.match(html, /<title>Inicio<\/title>/);
    assert.match(html, /<h1>Hola<\/h1>/);
    assert.doesNotMatch(html, /remote chrome|remote footer|\/code\/cd_x/);
    const map = '<script type="importmap">{"imports":{"@foliwake/block-kit":"/_foliwake/block-kit.js"}}</script>';
    assert.ok(html.includes(map), 'the kit is mapped to this server');
    assert.match(html, /<link rel="stylesheet" href="\/styles\/styles.css">/);
    assert.match(html, /<script type="module" src="\/scripts\/components.js"><\/script>/);
    assert.equal(origin.requests[0].headers['user-agent'], 'foliwake-dev');
  });

  test('local components, scripts and styles, and the installed block kit', async () => {
    assert.equal(await (await fetch(`${base}/components/hero/hero.css`)).text(), '.hero{}');
    assert.equal(await (await fetch(`${base}/scripts/components.js`)).text(), "import '@foliwake/block-kit';");
    const kit = await fetch(`${base}/_foliwake/block-kit.js`);
    assert.equal(kit.status, 200);
    assert.match(kit.headers.get('content-type'), /^text\/javascript/);
    assert.ok((await kit.text()).length > 100);
    assert.equal((await fetch(`${base}/_foliwake/lit-html.js`)).status, 200);
    assert.equal((await fetch(`${base}/code/cd_x/scripts/components.js`)).status, 404);
  });

  test('the block catalog is an honest stub: it needs the engine or the open block renderer', async () => {
    for (const pathname of ['/_dev/blocks', '/_foliwake/blocks', '/_foliwake/blocks/hero']) {
      const response = await fetch(`${base}${pathname}`);
      assert.equal(response.status, 501, pathname);
      assert.match(await response.text(), /needs the Foliwake engine/);
    }
  });
});

describe('the dev command without the engine', () => {
  let home;
  before(async () => {
    home = await cliHome();
  });
  after(() => home.cleanup());

  test('without --remote: exit 2, it needs the engine', async () => {
    const run = await runCli(['dev'], home);
    assert.equal(run.code, 2);
    assert.match(run.stderr.replace(/\s+›\s+/g, ' '), /needs the Foliwake engine/);
  });

  test('--remote without foliwake.remote.json: exit 2 with what to do', async () => {
    const run = await runCli(['dev', '--remote'], home);
    assert.equal(run.code, 2);
    assert.match(run.stderr, /No foliwake\.remote\.json in/);
  });

  test('a missing password variable stops before anything listens; the value is never needed in a file', async () => {
    const args = [
      'dev',
      '--remote-url',
      'https://p.example',
      '--remote-auth-user',
      'u',
      '--remote-auth-env',
      'NOPE_PW',
    ];
    const run = await runCli(args, home);
    assert.equal(run.code, 2);
    assert.match(run.stderr, /NOPE_PW is not set/);
  });
});
