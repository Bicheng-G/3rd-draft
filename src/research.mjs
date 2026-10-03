import { lookup as dnsLookup } from 'node:dns/promises';
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { isIP } from 'node:net';
import { createHash } from 'node:crypto';

export const SOURCE_LIMITS = Object.freeze({ maxBytes: 512 * 1024, maxExcerpt: 12_000,
  maxRedirects: 3, timeoutMs: 15_000 });

export class ResearchError extends Error {
  constructor(code, message) { super(message); this.name = 'ResearchError'; this.code = code; }
}
const fail = (code, message) => new ResearchError(code, message);
const timeoutError = () => fail('source_timeout', 'Source retrieval exceeded its time limit.');

function sourceUrl(input, base) {
  let url;
  try {
    if (typeof input !== 'string' || input.length > 4096) throw new Error();
    url = new URL(input, base);
  } catch { throw fail('invalid_source_url', 'Enter a valid public HTTP or HTTPS source URL.'); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.port)
    throw fail('invalid_source_url', 'Source URLs must use HTTP or HTTPS on its standard port without credentials.');
  url.hash = '';
  const host = url.hostname.replace(/^\[|\]$/g, '').replace(/\.$/, '').toLowerCase();
  if (!host || (!isIP(host) && (!host.includes('.') || /(?:^|\.)(?:localhost|local|internal|home\.arpa)$/.test(host))))
    throw fail('source_address_blocked', 'Local and private source addresses are not allowed.');
  return { url, host };
}

// Conservative public-destination policy, checked 2026-10-02 against the IANA
// IPv4/IPv6 Special-Purpose Address Registries. Special-purpose exceptions are
// deliberately excluded along with private, reserved, multicast and transition
// addresses; this reader does not need network administration endpoints.
const V4_SPECIAL = [
  [0x00000000, 8], [0x0a000000, 8], [0x64400000, 10], [0x7f000000, 8],
  [0xa9fe0000, 16], [0xac100000, 12], [0xc0000000, 24], [0xc0000200, 24],
  [0xc01fc400, 24], [0xc034c100, 24], [0xc0586300, 24], [0xc0a80000, 16],
  [0xc0af3000, 24], [0xc6120000, 15], [0xc6336400, 24], [0xcb007100, 24],
  [0xe0000000, 4], [0xf0000000, 4],
];
function publicAddress(address) {
  const family = isIP(address);
  if (family === 4) {
    const value = address.split('.').reduce((number, byte) => number * 256 + Number(byte), 0);
    return !V4_SPECIAL.some(([prefix, bits]) => Math.floor(value / 2 ** (32 - bits)) === Math.floor(prefix / 2 ** (32 - bits)));
  }
  if (family !== 6 || address.includes('%') || address.includes('.')) return false;
  const [left, right] = address.toLowerCase().split('::');
  const start = left ? left.split(':') : [], end = right ? right.split(':') : [];
  const words = right === undefined ? start : [...start, ...Array(8 - start.length - end.length).fill('0'), ...end];
  const value = words.reduce((number, word) => (number << 16n) | BigInt(`0x${word}`), 0n);
  const prefix = (hex, bits) => value >> BigInt(128 - bits) === BigInt(`0x${hex}`) >> BigInt(128 - bits);
  return prefix('20000000000000000000000000000000', 3) &&
    !prefix('20010000000000000000000000000000', 23) &&
    !prefix('20010db8000000000000000000000000', 32) &&
    !prefix('20020000000000000000000000000000', 16) &&
    !prefix('2620004f800000000000000000000000', 48) &&
    !prefix('3fff0000000000000000000000000000', 20);
}

function abortable(promise, signal) {
  if (signal.aborted) return Promise.reject(timeoutError());
  return new Promise((resolve, reject) => {
    const abort = () => reject(timeoutError());
    signal.addEventListener('abort', abort, { once: true });
    Promise.resolve(promise).then(resolve, reject).finally(() => signal.removeEventListener('abort', abort));
  });
}
async function destination(host, resolveHost, signal) {
  let addresses;
  try {
    addresses = isIP(host) ? [{ address: host, family: isIP(host) }] :
      await abortable(resolveHost(host, { all: true, verbatim: true }), signal);
  } catch (error) {
    if (error instanceof ResearchError) throw error;
    throw fail('source_unavailable', 'The source hostname could not be resolved.');
  }
  if (!Array.isArray(addresses) || !addresses.length || addresses.length > 32 ||
      addresses.some(item => !item || typeof item.address !== 'string' ||
        isIP(item.address) !== item.family || !publicAddress(item.address)))
    throw fail('source_address_blocked', 'The source resolves to an unsupported or non-public address.');
  return addresses[0];
}

function download(url, host, pinned, request, signal, maxBytes) {
  return new Promise((resolve, reject) => {
    let completed = false, outgoing, incoming;
    const finish = (error, value) => {
      if (completed) return;
      completed = true; signal.removeEventListener('abort', abort);
      if (error) { incoming?.destroy(); outgoing?.destroy(); reject(error); }
      else resolve(value);
    };
    const abort = () => finish(timeoutError());
    if (signal.aborted) { reject(timeoutError()); return; }
    signal.addEventListener('abort', abort, { once: true });
    try {
      outgoing = request(url, {
        method: 'GET', agent: false, family: pinned.family, autoSelectFamily: false,
        signal, maxHeaderSize: 16 * 1024, rejectUnauthorized: true,
        ...(url.protocol === 'https:' && !isIP(host) ? { servername: host } : {}),
        headers: { Host: url.host, Accept: 'text/html, text/plain', 'Accept-Encoding': 'identity',
          'User-Agent': 'Third-Draft-Source-Reader/1.0' },
        // No second DNS query occurs at connection time. Even an all-addresses
        // lookup request receives only the one previously validated endpoint.
        lookup(_hostname, options, callback) {
          if (options?.all) callback(null, [{ ...pinned }]);
          else callback(null, pinned.address, pinned.family);
        },
      }, response => {
        incoming = response;
        const status = response.statusCode;
        if ([301, 302, 303, 307, 308].includes(status)) {
          if (typeof response.headers.location !== 'string')
            finish(fail('source_unavailable', 'The source returned a redirect without a destination.'));
          else finish(null, { redirect: response.headers.location });
          response.destroy(); return;
        }
        if (status !== 200) { finish(fail('source_unavailable', `The source returned HTTP ${status ?? 'error'}.`)); return; }
        const contentType = typeof response.headers['content-type'] === 'string' ? response.headers['content-type'] : '';
        const mime = contentType.split(';')[0].trim().toLowerCase();
        const charset = /charset\s*=\s*["']?([^;\s"']+)/i.exec(contentType)?.[1].toLowerCase();
        const encoding = String(response.headers['content-encoding'] ?? 'identity').toLowerCase();
        if (!['text/html', 'text/plain'].includes(mime) ||
            (charset && !['utf-8', 'utf8', 'us-ascii'].includes(charset)) || encoding !== 'identity') {
          finish(fail('source_unsupported_content', 'Only uncompressed UTF-8 HTML or plain-text sources are supported.')); return;
        }
        if (Number(response.headers['content-length']) > maxBytes) {
          finish(fail('source_too_large', 'The source exceeds the 512 KiB download limit.')); return;
        }
        const chunks = []; let length = 0;
        response.on('data', chunk => {
          if (completed) return;
          const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
          length += bytes.length;
          if (length > maxBytes) finish(fail('source_too_large', 'The source exceeds the 512 KiB download limit.'));
          else chunks.push(bytes);
        });
        response.on('error', () => finish(fail('source_unavailable', 'The source response was interrupted.')));
        response.on('aborted', () => finish(fail('source_unavailable', 'The source response was interrupted.')));
        response.on('end', () => finish(null, { bytes: Buffer.concat(chunks), mime }));
      });
      outgoing.on('error', () => finish(signal.aborted ? timeoutError() :
        fail('source_unavailable', 'The source could not be retrieved.')));
      outgoing.end();
    } catch { finish(fail('source_unavailable', 'The source could not be retrieved.')); }
  });
}

function entities(text) {
  const named = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
  return text.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi, (match, entity) => {
    if (!entity.startsWith('#')) return named[entity.toLowerCase()];
    const value = entity[1].toLowerCase() === 'x' ? parseInt(entity.slice(2), 16) : Number(entity.slice(1));
    return value > 0 && value <= 0x10ffff && !(value >= 0xd800 && value <= 0xdfff) ? String.fromCodePoint(value) : ' ';
  });
}
const plain = text => entities(text).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '')
  .replace(/[ \t\r]+/g, ' ').replace(/ *\n */g, '\n').replace(/\n{3,}/g, '\n\n').trim();
function sourceText(text, mime, fallbackTitle) {
  if (mime === 'text/plain') return { title: plain(text).split('\n')[0].slice(0, 160), text: plain(text) };
  const inert = text.replace(/<!--[\s\S]*?(?:-->|$)/g, '')
    .replace(/<(script|style|noscript|template)\b[^<>]*>[\s\S]*?(?:<\/\1\s*>|$)/gi, ' ');
  // Excluding '<' inside a tag avoids quadratic scans on malformed tag runs.
  const title = plain((/<title\b[^<>]*>([\s\S]*?)<\/title\s*>/i.exec(inert)?.[1] ?? fallbackTitle).replace(/<[^<>]*>/g, ' ')).slice(0, 160);
  const content = inert.replace(/<head\b[^<>]*>[\s\S]*?(?:<\/head\s*>|$)/gi, ' ')
    .replace(/<\/?(?:p|div|br|li|h[1-6]|tr|section|article)\b[^<>]*>/gi, '\n').replace(/<[^<>]*>/g, ' ');
  return { title, text: plain(content) };
}

// Explicit one-URL evidence retrieval only. Returned text remains untrusted
// source material: this function never executes content, crawls, or asks a model.
// Injection points are for local transport tests; HTTP handlers must not expose them.
export async function fetchSource(input, { resolveHost = dnsLookup, request,
  timeoutMs = SOURCE_LIMITS.timeoutMs, maxBytes = SOURCE_LIMITS.maxBytes, now = () => new Date() } = {}) {
  timeoutMs = Math.min(SOURCE_LIMITS.timeoutMs, Math.max(1, Number(timeoutMs) || SOURCE_LIMITS.timeoutMs));
  maxBytes = Math.min(SOURCE_LIMITS.maxBytes, Math.max(1, Number(maxBytes) || SOURCE_LIMITS.maxBytes));
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    let target = sourceUrl(input), result;
    for (let redirects = 0; ; redirects++) {
      const pinned = await destination(target.host, resolveHost, controller.signal);
      const transport = request ?? (target.url.protocol === 'https:' ? httpsRequest : httpRequest);
      result = await download(target.url, target.host, pinned, transport, controller.signal, maxBytes);
      if (!result.redirect) break;
      if (redirects >= SOURCE_LIMITS.maxRedirects)
        throw fail('source_redirect_limit', 'The source exceeded the three-redirect limit.');
      target = sourceUrl(result.redirect, target.url);
    }
    let decoded;
    try { decoded = new TextDecoder('utf-8', { fatal: true }).decode(result.bytes); }
    catch { throw fail('source_invalid_encoding', 'The source is not valid UTF-8 text.'); }
    const content = sourceText(decoded, result.mime, target.host);
    if (!content.text) throw fail('source_empty', 'The source contains no readable text.');
    return { url: target.url.href, title: content.title || target.host,
      excerpt: content.text.slice(0, SOURCE_LIMITS.maxExcerpt),
      truncated: content.text.length > SOURCE_LIMITS.maxExcerpt,
      retrievedAt: now().toISOString(), contentHash: createHash('sha256').update(result.bytes).digest('hex'),
      accessStatus: 'retrieved', sourceType: 'web' };
  } finally { clearTimeout(timer); }
}
