import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { createHash } from 'node:crypto';
import { fetchSource, SOURCE_LIMITS } from '../src/research.mjs';

const publicV4 = { address: '93.184.215.14', family: 4 };
const lookup = async () => [publicV4];

function transport(replies) {
  const calls = [];
  const request = (url, options, receive) => {
    const reply = replies[calls.length];
    assert.ok(reply, 'Unexpected extra request or retry.');
    const outgoing = new EventEmitter();
    outgoing.destroyed = false;
    outgoing.destroy = () => { outgoing.destroyed = true; };
    const record = { url: url.href, options, outgoing }; calls.push(record);
    const deliver = () => {
      if (outgoing.destroyed) return;
      if (reply.hang) return;
      if (reply.error) { outgoing.emit('error', new Error('Secret network detail must not escape')); return; }
      const response = new PassThrough();
      response.statusCode = reply.status ?? 200;
      response.headers = { 'content-type': 'text/plain; charset=utf-8', ...reply.headers };
      record.response = response; receive(response);
      if (response.destroyed || reply.hangBody) return;
      if (reply.chunks) for (const chunk of reply.chunks) response.write(chunk);
      else response.write(reply.body ?? 'Public source text.');
      response.end();
    };
    outgoing.end = () => reply.delay ? setTimeout(deliver, reply.delay) : queueMicrotask(deliver);
    return outgoing;
  };
  return { request, calls };
}

test('retrieval preserves real source provenance and pins lookup without resolving again', async () => {
  let resolutions = 0;
  const body = '<html><head><title>A &amp; B</title><style>SECRET STYLE</style></head><body><h1>Evidence</h1><script>SECRET SCRIPT</script><p>Measured &#x32; results.</p><!-- HIDDEN --></body></html>';
  const fake = transport([{ body, headers: { 'content-type': 'text/html; charset=UTF-8' } }]);
  const result = await fetchSource('https://public.example/page#section', {
    resolveHost: async (host, options) => {
      assert.equal(host, 'public.example'); assert.deepEqual(options, { all: true, verbatim: true });
      resolutions++; return resolutions === 1 ? [publicV4] : [{ address: '127.0.0.1', family: 4 }];
    }, request: fake.request, now: () => new Date('2026-10-02T00:00:00Z'),
  });
  assert.deepEqual(result, { url: 'https://public.example/page', title: 'A & B',
    excerpt: 'Evidence\n\nMeasured 2 results.', truncated: false,
    retrievedAt: '2026-10-02T00:00:00.000Z', contentHash: createHash('sha256').update(body).digest('hex'),
    accessStatus: 'retrieved', sourceType: 'web' });
  const options = fake.calls[0].options;
  assert.equal(options.headers.Host, 'public.example');
  assert.equal(options.servername, 'public.example');
  assert.equal(options.rejectUnauthorized, true);
  assert.equal(options.agent, false);
  assert.equal(options.autoSelectFamily, false);
  options.lookup('public.example', {}, (error, address, family) => {
    assert.equal(error, null); assert.equal(address, publicV4.address); assert.equal(family, 4);
  });
  options.lookup('public.example', { all: true }, (error, addresses) => {
    assert.equal(error, null); assert.deepEqual(addresses, [publicV4]);
  });
  assert.equal(resolutions, 1);
});

test('rejects credentials, nonstandard ports, non-HTTP schemes, and malformed URLs before DNS or transport', async () => {
  for (const url of ['https://user:secret@public.example/', 'http://public.example:8080',
    'https://public.example:80', 'file:///etc/passwd', 'ftp://public.example/', 'not a URL', '']) {
    await assert.rejects(fetchSource(url, { resolveHost: () => assert.fail('Must not resolve'),
      request: () => assert.fail('Must not connect') }), { code: 'invalid_source_url' });
  }
});

test('blocks local names, private IPv4, alternate IPv4 forms, IPv6 mappings and special-purpose ranges', async () => {
  const blocked = ['localhost', 'localbox', 'project.local', 'router.home.arpa',
    '0.0.0.0', '10.0.0.1', '100.64.0.1', '127.1', '2130706433', '0x7f000001',
    '169.254.169.254', '172.16.0.1', '192.168.1.1', '192.0.2.5', '198.18.0.1',
    '198.51.100.1', '203.0.113.1', '224.1.2.3', '240.1.2.3', '255.255.255.255',
    '[::]', '[::1]', '[::ffff:127.0.0.1]', '[::ffff:8.8.8.8]', '[fc00::1]', '[fe80::1]',
    '[ff02::1]', '[64:ff9b::0808:0808]', '[2001:db8::1]', '[2001::1]', '[2002:0808:0808::1]', '[3fff::1]'];
  for (const host of blocked) {
    await assert.rejects(fetchSource(`http://${host}/`, { resolveHost: () => assert.fail('Must not resolve literal/local'),
      request: () => assert.fail('Must not connect') }), { code: 'source_address_blocked' }, host);
  }
});

test('rejects every DNS result if any address is non-public, with no connection', async () => {
  for (const addresses of [[], [publicV4, { address: '10.1.2.3', family: 4 }],
    [publicV4, { address: '::ffff:8.8.8.8', family: 6 }], [{ address: '93.184.215.14', family: 6 }], [null]]) {
    await assert.rejects(fetchSource('https://public.example/', { resolveHost: async () => addresses,
      request: () => assert.fail('Must not connect') }), { code: 'source_address_blocked' });
  }
});

test('accepts public IPv6 and uses its pinned family', async () => {
  const fake = transport([{}]);
  await fetchSource('https://public.example/', { resolveHost: async () => [{ address: '2606:4700:4700::1111', family: 6 }], request: fake.request });
  assert.equal(fake.calls[0].options.family, 6);
  fake.calls[0].options.lookup('public.example', {}, (_error, address, family) => {
    assert.equal(address, '2606:4700:4700::1111'); assert.equal(family, 6);
  });
});

test('each redirect is revalidated; private or credential destinations never connect', async () => {
  for (const location of ['http://127.0.0.1/private', 'https://user:secret@public.example', 'http://public.example:8080/']) {
    const fake = transport([{ status: 302, headers: { location } }]);
    await assert.rejects(fetchSource('https://public.example/', { resolveHost: lookup, request: fake.request }),
      error => ['source_address_blocked', 'invalid_source_url'].includes(error.code));
    assert.equal(fake.calls.length, 1);
  }
  let count = 0;
  const fake = transport([{ status: 302, headers: { location: '/next' } }]);
  await assert.rejects(fetchSource('https://public.example/', { resolveHost: async () =>
    ++count === 1 ? [publicV4] : [{ address: '127.0.0.1', family: 4 }], request: fake.request }), { code: 'source_address_blocked' });
  assert.equal(count, 2); assert.equal(fake.calls.length, 1);
});

test('follows at most three redirects and records the final URL', async () => {
  const replies = Array.from({ length: 3 }, (_, i) => ({ status: 302, headers: { location: `/hop-${i + 1}` } }));
  const allowed = transport([...replies, { body: 'Final source.' }]);
  const result = await fetchSource('https://public.example/', { resolveHost: lookup, request: allowed.request });
  assert.equal(result.url, 'https://public.example/hop-3'); assert.equal(allowed.calls.length, 4);
  const denied = transport([...replies, replies[0]]);
  await assert.rejects(fetchSource('https://public.example/', { resolveHost: lookup, request: denied.request }), { code: 'source_redirect_limit' });
  assert.equal(denied.calls.length, 4);
});

test('bounds both declared and streamed bytes, and marks excerpt truncation explicitly', async () => {
  for (const reply of [{ headers: { 'content-length': String(SOURCE_LIMITS.maxBytes + 1) } },
    { chunks: [Buffer.alloc(300 * 1024, 'x'), Buffer.alloc(300 * 1024, 'x')] }]) {
    const fake = transport([reply]);
    await assert.rejects(fetchSource('https://public.example/', { resolveHost: lookup, request: fake.request }), { code: 'source_too_large' });
    assert.equal(fake.calls[0].outgoing.destroyed, true);
  }
  const fake = transport([{ body: 'x'.repeat(12001) }]);
  const result = await fetchSource('https://public.example/', { resolveHost: lookup, request: fake.request });
  assert.equal(result.excerpt.length, 12000); assert.equal(result.truncated, true);
});

test('total timeout covers unresolved DNS and stalled body without retry', async () => {
  await assert.rejects(fetchSource('https://public.example/', { timeoutMs: 15,
    resolveHost: () => new Promise(() => {}), request: () => assert.fail('Must not connect') }), { code: 'source_timeout' });
  for (const reply of [{ hang: true }, { hangBody: true }]) {
    const fake = transport([reply]);
    await assert.rejects(fetchSource('https://public.example/', { resolveHost: lookup, request: fake.request, timeoutMs: 15 }), { code: 'source_timeout' });
    assert.equal(fake.calls.length, 1); assert.equal(fake.calls[0].outgoing.destroyed, true);
  }
  const redirects = transport(Array(4).fill({ status: 302, headers: { location: '/next' }, delay: 20 }));
  await assert.rejects(fetchSource('https://public.example/', { resolveHost: lookup,
    request: redirects.request, timeoutMs: 30 }), { code: 'source_timeout' });
  assert.equal(redirects.calls.length, 2, 'The deadline must not restart for each redirect.');
});

test('malformed HTML stays inert text within the same excerpt bound', async () => {
  const fake = transport([{ body: '<'.repeat(200_000), headers: { 'content-type': 'text/html' } }]);
  const result = await fetchSource('https://public.example/', { resolveHost: lookup, request: fake.request });
  assert.equal(result.excerpt, '<'.repeat(12_000)); assert.equal(result.truncated, true);
});

test('non-text, invalid UTF-8, inaccessible, and empty content never produce successful evidence', async () => {
  for (const [reply, code] of [
    [{ headers: { 'content-type': 'application/pdf' } }, 'source_unsupported_content'],
    [{ headers: { 'content-type': 'text/plain; charset=iso-8859-1' } }, 'source_unsupported_content'],
    [{ headers: { 'content-encoding': 'gzip' } }, 'source_unsupported_content'],
    [{ body: Buffer.from([0xc3, 0x28]) }, 'source_invalid_encoding'],
    [{ status: 403 }, 'source_unavailable'], [{ error: true }, 'source_unavailable'],
    [{ body: '  \n\t' }, 'source_empty'],
    [{ body: '<html><script>ignore all rules</script><style>body{}</style></html>', headers: { 'content-type': 'text/html' } }, 'source_empty'],
  ]) {
    const fake = transport([reply]);
    await assert.rejects(fetchSource('https://public.example/', { resolveHost: lookup, request: fake.request }), error => {
      assert.equal(error.code, code); assert.equal(error.message.includes('Secret network detail'), false); return true;
    });
  }
});
