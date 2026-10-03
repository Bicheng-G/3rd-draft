import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdirSync, mkdtempSync, rmSync, readFileSync } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { unzipSync } from 'fflate';
import { startServer } from '../src/server.mjs';
import { Store } from '../src/store.mjs';
import { SkillLibrary } from '../src/skills.mjs';
import { id, hash, AppError } from '../src/common.mjs';

// Every model response in this file is an explicit deterministic test double.
// These tests prove HTTP integration and persistence, never native model quality.
class RuntimeDouble {
  calls = [];
  vision = true;
  async inspect() {
    return { available: true, route: 'explicit-http-test-double', billing: 'subscription', version: 'test-double-v1', usage: null,
      capabilities: { text_generate: { available: true }, structured_output: { available: true }, vision_input: { available: this.vision } } };
  }
  async generate({ prompt, images = [], signal }) {
    const context = JSON.parse(prompt.trim().split('\n').at(-1));
    this.calls.push({ context, images: images.map(image => ({ bytes: image.length, hash: hash(image) })) });
    if (['HOLD_UNTIL_CANCELLED', 'HOLD_LATE_RESULT'].includes(context.goal)) await new Promise((resolve, reject) => {
      const cancel = () => context.goal === 'HOLD_LATE_RESULT' ? resolve() : reject(new AppError('cancelled', 'The explicit test double observed cancellation.'));
      if (signal.aborted) cancel(); else signal.addEventListener('abort', cancel, { once: true });
    });
    let output;
    if (context.taskType === 'extract_brand') output = { title: 'Synthetic observed label', content: 'The fixture label is blue. This is a draft observation.', unknowns: ['Product claims require user confirmation.'] };
    else if (context.taskType === 'review_asset') output = { summary: 'Synthetic reviewer result.', limitations: ['This is a deterministic test double, not visual-quality evidence.'],
      issues: [{ severity: 'blocker', category: 'brand', explanation: 'The synthetic brand detail requires confirmation.', suggestedAction: 'Have the user verify and explicitly resolve this issue.' }] };
    else if (context.taskType === 'synthesize_insights') output = { title: 'Reading insight', audience: 'Readers', content: 'A reading ritual is a useful creative hypothesis.', counterexamples: 'Some readers prefer activity.', hypothesis: true, evidenceIds: context.entries.filter(entry => entry.kind === 'evidence').map(entry => entry.id) };
    else {
      const concept = index => ({ title: `Reading idea ${index + 1}`, insight: 'A quiet page offers a concrete ritual.', theme: 'Reading', angle: `Reading angle ${index + 1}`,
        body: context.language === 'Chinese' ? `留一页安静。你正在读哪本书？${index + 1}` : `A pocket of quiet. Which book is keeping you company? ${index + 1}`,
        visualDirection: 'A book beside a window.', rationale: 'Deterministic fixture using explicitly selected context.', usedContextIds: context.entries.map(entry => entry.id), assumptions: ['Synthetic test content; no quality conclusion.'] });
      output = context.count > 1 ? { concepts: Array.from({ length: context.count }, (_, index) => concept(index)) } : concept(0);
    }
    return { output, usage: null, metadata: { testDouble: true } };
  }
}
async function fixture(t) {
  const root = path.resolve('.workbench/tests'); mkdirSync(root, { recursive: true });
  const directory = mkdtempSync(path.join(root, 'v1-http-')), runtime = new RuntimeDouble();
  const app = await startServer({ dataDir: path.join(directory, 'data'), port: 0, runtime });
  t.after(async () => { await app.close(); assert.ok(path.resolve(directory).startsWith(root + path.sep)); rmSync(directory, { recursive: true, force: true }); });
  const session = await fetch(app.url + '/api/session'), cookie = session.headers.get('set-cookie').split(';')[0], { csrfToken } = await session.json();
  const headers = { Cookie: cookie, 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken };
  const request = (endpoint, body, override = {}) => fetch(app.url + endpoint, { method: body === undefined ? 'GET' : 'POST', headers: { ...headers, ...override }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const json = async (endpoint, body, status = body === undefined ? 200 : 201) => {
    const response = await request(endpoint, body), value = await response.json();
    assert.equal(response.status, status, `${endpoint}: ${JSON.stringify(value)}`); return value;
  };
  const a = await json('/api/projects', { name: 'Synthetic HTTP A' }), b = await json('/api/projects', { name: 'FOREIGN_HTTP_PROJECT' });
  const base = project => `/api/projects/${project.id}`;
  const waitRun = async (project, runId) => {
    for (let i = 0; i < 200; i++) {
      const run = await json(`${base(project)}/runs/${runId}`);
      if (!['running', 'archiving'].includes(run.status)) return run;
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    assert.fail('The explicit test runtime did not finish its HTTP run.');
  };
  const run = async (project, input) => {
    const started = await json(`${base(project)}/runs`, { goal: 'Reading creative task', language: 'English', requestId: id(), ...input }, 202);
    const finished = await waitRun(project, started.id); assert.equal(finished.status, 'succeeded', JSON.stringify(finished.error)); return finished;
  };
  const manual = (project, extra = {}) => json(`${base(project)}/concepts`, { title: 'Reading original', angle: 'Reading ritual', body: 'A pocket of quiet.', visualDirection: 'A book in sunlight.', rationale: 'Manual synthetic fixture.', ...extra });
  const png = await sharp({ create: { width: 8, height: 8, channels: 4, background: '#4287cf' } }).png().toBuffer();
  const image = (project, extra = {}) => json(`${base(project)}/images`, { name: 'Synthetic blue square', source: 'Generated fixture pixels', base64: png.toString('base64'), ...extra });
  return { directory, app, runtime, request, json, a, b, base, run, waitRun, manual, image, headers, png };
}
const upload = (name, text) => ({ path: name, base64: Buffer.from(text).toString('base64') });
const importedSkill = f => f.json('/api/skills', { source: 'Explicit HTTP fixture', declaredVersion: '1', permissions: ['method_text'], requiresCapabilities: ['text_generate'], roles: ['strategy'],
  files: [upload('SKILL.md', '---\nname: Reading method\n---\nPrefer concrete reading rituals.'), upload('scripts/not-executed.cjs', 'throw new Error("DO_NOT_EXECUTE");')] });

test('HTTP with explicit runtime double: evidence, independent insight, six ideas, pinned skill and Paid/Organic reuse', async t => {
  const f = await fixture(t), { json, a, b, base, runtime } = f;
  const brand = await json(`${base(a)}/knowledge`, { kind: 'brand', title: 'Voice', content: 'Clear reading invitations.', source: 'Synthetic brief' });
  const confirmed = await json(`${base(a)}/knowledge/${brand.id}/confirm`, {});
  const evidence = await json(`${base(a)}/evidence`, { title: 'Reading observation', url: 'https://example.com/reading', observation: 'A reader describes a quiet page.', inference: 'A reading ritual may fit.', tags: ['reading'] });
  assert.equal(evidence.sourceType, 'web'); assert.ok(evidence.retrievedAt); assert.equal(evidence.accessStatus, 'user_supplied');
  const synthesis = await f.run(a, { taskType: 'synthesize_insights', evidenceIds: [evidence.id] });
  let state = await json(base(a)); const insight = state.insights.find(item => item.id === synthesis.insightId);
  assert.deepEqual(insight.evidenceIds, [evidence.id]); assert.equal(insight.hypothesis, true); assert.equal(state.concepts.length, 0); assert.equal(state.assets.length, 0);
  const nextInsight = await json(`${base(a)}/insights`, { previousId: insight.id, title: 'Reading insight revised', audience: 'Readers', content: 'Invite a quiet page.', counterexamples: 'Some want active breaks.', hypothesis: true, evidenceIds: [evidence.id] });
  assert.equal(nextInsight.itemId, insight.itemId);
  const skill = await importedSkill(f); await json(`${base(a)}/skills`, { skillId: skill.id, enabled: true }, 200);
  const generated = await f.run(a, { count: 6, language: 'Chinese' });
  assert.equal(generated.conceptIds.length, 6); assert.equal(generated.context.skills[0].id, skill.id); assert.equal(generated.context.skills[0].contentHash, skill.contentHash);
  assert.ok(generated.context.entries.some(entry => entry.id === confirmed.id)); assert.ok(generated.context.entries.some(entry => entry.id === nextInsight.id));
  state = await json(base(a)); assert.equal(state.concepts.length, 6); assert.equal(state.assets.length, 0); assert.equal(state.sets.length, 0);
  assert.equal(state.insights.find(item => item.id === insight.id).content, insight.content);
  const first = state.concepts[0], second = state.concepts[1];
  await json(`${base(a)}/concepts/${first.id}/favorite`, { active: true, reason: 'The concrete reading invitation fits.' }, 200);
  await json(`${base(a)}/concepts/${second.id}/favorite`, { active: true, reason: 'Keep a different angle for later.' }, 200);
  const paid = await json(`${base(a)}/sets`, { name: 'Reading paid', mode: 'paid', conceptIds: [first.id], brief: { goal: 'Introduce a reading ritual.', language: 'Chinese', audience: 'Readers', objective: 'Consideration', offer: '', proof: '', cta: 'Learn more', prohibitedClaims: 'No efficacy claim' } });
  const organic = await json(`${base(a)}/sets`, { name: 'Reading organic', mode: 'organic', conceptIds: [first.id, second.id], brief: { goal: 'Discuss current books.', language: 'English', theme: 'Reading', caption: 'What are you reading?', assetIds: [] } });
  const feedback = await json(`${base(a)}/feedback`, { targetType: 'concept', targetId: first.id, scope: 'concept', content: 'Keep the book invitation.', tags: ['reading'] });
  const developed = await f.run(a, { sourceConceptId: first.id, setId: paid.id, goal: 'Develop this reading direction.' });
  assert.ok(developed.context.entries.some(entry => entry.id === feedback.id));
  state = await json(base(a)); const version = state.concepts.find(item => item.id === developed.conceptId);
  assert.equal(version.parentId, first.id); assert.equal(version.ideaId, first.ideaId); assert.equal(state.concepts.find(item => item.id === first.id).body, first.body);
  assert.ok(state.sets.find(item => item.id === paid.id).conceptIds.includes(version.id)); assert.ok(state.sets.find(item => item.id === organic.id).conceptIds.includes(first.id));
  await json(`${base(a)}/concepts/${first.id}/favorite`, { active: false, reason: 'Used in both sets; retain history.' }, 200);
  await json(`${base(a)}/selections`, { targetType: 'concept', targetId: version.id, decision: 'published', reason: 'Synthetic manual coverage record.' });
  const download = await f.request(`${base(a)}/concepts/${first.id}/export`); assert.equal(download.status, 200); assert.ok((await download.text()).includes('留一页安静'));
  const foreign = await json(base(b)); assert.equal(foreign.concepts.length, 0); assert.equal(foreign.skills.length, 0); assert.equal(foreign.insights.length, 0);
  assert.equal(runtime.calls.length, 3, 'no implicit image or research task ran');
});

test('HTTP with explicit vision double: extraction stays draft, review blocks adoption, caption versions and delivery stay separate', async t => {
  const f = await fixture(t), { json, a, base, runtime } = f;
  const reference = await f.image(a);
  const extraction = await f.run(a, { taskType: 'extract_brand', assetId: reference.id, goal: 'Extract visible label details.' });
  let state = await json(base(a)); const draft = state.knowledge.find(item => item.id === extraction.knowledgeId);
  assert.equal(draft.status, 'draft'); assert.equal(draft.assetId, reference.id); assert.equal(extraction.runtimeMetadata.testDouble, true);
  assert.equal(runtime.calls[0].images.length, 1); assert.equal(extraction.runtimeMetadata.imageDerivations[0].assetId, reference.id);
  const beforeConfirmation = await json(`${base(a)}/context`, { goal: 'Reading task', language: 'English' }, 200);
  assert.equal(beforeConfirmation.entries.some(item => item.id === draft.id), false);
  const confirmed = await json(`${base(a)}/knowledge/${draft.id}/confirm`, {}); assert.notEqual(confirmed.id, draft.id); assert.equal(confirmed.status, 'confirmed');
  const idea = await f.manual(a), set = await json(`${base(a)}/sets`, { name: 'Image set', mode: 'organic', conceptIds: [idea.id], brief: { goal: 'Show a quiet book.', assetIds: [reference.id] } });
  const original = await f.image(a, { setId: set.id, conceptId: idea.id, caption: 'Original caption' });
  const callsBeforeCaption = runtime.calls.length;
  const caption = await json(`${base(a)}/assets/${original.id}/caption`, { caption: '你正在读哪本书？' });
  assert.equal(caption.parentId, original.id); assert.equal(caption.artifactHash, original.artifactHash); assert.equal(runtime.calls.length, callsBeforeCaption);
  const imageFile = await f.request(`${base(a)}/assets/${caption.id}/file`); assert.equal(imageFile.status, 200); assert.equal(hash(Buffer.from(await imageFile.arrayBuffer())), caption.artifactHash);
  const emptyFinal = await json(`${base(a)}/sets/${set.id}/export`, undefined, 400); assert.equal(emptyFinal.error.code, 'empty_export');
  const draftDelivery = await f.request(`${base(a)}/sets/${set.id}/export?draft=1`); assert.equal(draftDelivery.status, 200);
  assert.equal(JSON.parse(Buffer.from(unzipSync(new Uint8Array(await draftDelivery.arrayBuffer()))['manifest.json'])).kind, 'draft_delivery');
  const reviewRun = await f.run(a, { taskType: 'review_asset', assetId: caption.id, goal: 'Review this creative output.' });
  state = await json(base(a)); const review = state.reviews.find(item => item.id === reviewRun.reviewId); assert.equal(review.issues[0].severity, 'blocker');
  const rejected = await json(`${base(a)}/selections`, { targetType: 'asset', targetId: caption.id, decision: 'adopted', reason: 'Try without resolution.' }, 409); assert.equal(rejected.error.code, 'adoption_blocked');
  await json(`${base(a)}/reviews/${review.id}/resolve`, { issueId: review.issues[0].id, reason: 'The operator explicitly verified the synthetic detail.' });
  await json(`${base(a)}/selections`, { targetType: 'asset', targetId: caption.id, decision: 'adopted', reason: 'Synthetic reviewed fixture.' });
  const delivery = await f.request(`${base(a)}/sets/${set.id}/export`); assert.equal(delivery.status, 200);
  const files = unzipSync(new Uint8Array(await delivery.arrayBuffer())), manifest = JSON.parse(Buffer.from(files['manifest.json']));
  assert.equal(manifest.kind, 'final_delivery'); assert.equal(manifest.assets.length, 1); assert.equal(manifest.assets[0].id, caption.id);
  assert.equal(Buffer.from(files[manifest.assets[0].caption]).toString(), '你正在读哪本书？');
  assert.ok(!Buffer.from(files['manifest.json']).toString().includes('context'));
  await json(`${base(a)}/sets/${set.id}/briefs`, { goal: 'Changed reading direction.', assetIds: [reference.id] });
  assert.equal((await json(`${base(a)}/sets/${set.id}/export`, undefined, 409)).error.code, 'stale_delivery');
  const count = runtime.calls.length, imageRuntime = await json('/api/image-runtime');
  assert.equal(imageRuntime.available, false); assert.equal(imageRuntime.capabilities.generate.available, false); assert.equal(imageRuntime.capabilities.edit.available, false); assert.equal(imageRuntime.evidence.liveImageAttempts, 0);
  assert.ok(imageRuntime.blockers.length > 0); assert.equal(runtime.calls.length, count, 'capability inspection must not fabricate image generation');
  runtime.vision = false;
  assert.equal((await json(`${base(a)}/runs`, { taskType: 'review_asset', assetId: caption.id, goal: 'Review without vision.', language: 'English', requestId: id() }, 503)).error.code, 'unsupported_capability');
  assert.equal(runtime.calls.length, count);
});

test('HTTP private backup restore keeps exact project history and files in a new directory while archived projects remain readable', async t => {
  const f = await fixture(t), { json, a, b, base } = f;
  const evidence = await json(`${base(a)}/evidence`, { title: 'Private source', observation: 'Reading insight input.', inference: 'A possible direction.' });
  await json(`${base(a)}/insights`, { title: 'Reading', audience: 'Readers', content: 'Quiet moments.', hypothesis: true, evidenceIds: [evidence.id] });
  const concept = await f.manual(a); await json(`${base(a)}/concepts/${concept.id}/favorite`, { active: true, reason: 'Retain judgment.' }, 200);
  const reference = await f.image(a);
  const set = await json(`${base(a)}/sets`, { name: 'Portable set', mode: 'paid', conceptIds: [concept.id], brief: { goal: 'Portable reading creative.', assetIds: [reference.id] } });
  await f.image(a, { setId: set.id, conceptId: concept.id, caption: 'Portable caption' });
  const skill = await importedSkill(f); await json(`${base(a)}/skills`, { skillId: skill.id, enabled: true }, 200);
  await f.run(a, { sourceConceptId: concept.id, goal: 'Continue the reading direction.' });
  await f.manual(b, { title: 'FOREIGN_CONCEPT_MARKER' }); await f.image(b, { name: 'FOREIGN_IMAGE_MARKER' });
  await json(`${base(a)}/archive`, { archived: true }, 200);
  const original = await json(base(a)); assert.equal(original.project.archived, true);
  assert.equal((await json(`${base(a)}/concepts`, { title: 'Should not write' }, 409)).error.code, 'project_archived');
  const response = await f.request(`${base(a)}/backup`); assert.equal(response.status, 200); assert.ok(response.headers.get('content-disposition').includes('.tdbackup'));
  const archive = Buffer.from(await response.arrayBuffer()), entries = unzipSync(archive), text = Object.values(entries).map(bytes => Buffer.from(bytes).toString()).join('\n');
  for (const foreign of [b.id, 'FOREIGN_HTTP_PROJECT', 'FOREIGN_CONCEPT_MARKER', 'FOREIGN_IMAGE_MARKER']) assert.equal(text.includes(foreign), false);
  const result = await json('/api/restore', { base64: archive.toString('base64') });
  assert.equal(result.projectId, a.id); assert.equal(result.archived, true); assert.ok(result.destinationDir.startsWith(path.join(f.app.store.dataDir, 'restores') + path.sep));
  const restored = new Store(result.destinationDir);
  try {
    const skills = new SkillLibrary(restored);
    assert.deepEqual({ ...restored.snapshot(a.id), skills: skills.bindings(a.id) }, original);
    assert.deepEqual(restored.projects().map(project => project.id), [a.id]);
    for (const file of JSON.parse(Buffer.from(entries['manifest.json'])).files) assert.equal(hash(readFileSync(path.join(result.destinationDir, ...file.path.slice(5).split('/')))), file.hash);
  } finally { restored.close(); }
  const second = await json('/api/restore', { base64: archive.toString('base64') }); assert.notEqual(second.destinationDir, result.destinationDir);
  await json(`${base(a)}/archive`, { archived: false }, 200); await f.manual(a, { title: 'Writable after unarchive' });
});

test('HTTP dispatch pause and best-effort cancel persist without a double submission or provider retry', async t => {
  const f = await fixture(t), { json, a, base, runtime } = f;
  assert.equal((await json('/api/dispatch', { paused: true }, 200)).paused, true);
  assert.equal((await json(`${base(a)}/runs`, { goal: 'Blocked task', language: 'English', requestId: id() }, 409)).error.code, 'paused'); assert.equal(runtime.calls.length, 0);
  await json('/api/dispatch', { paused: false }, 200);
  const request = { goal: 'HOLD_UNTIL_CANCELLED', language: 'English', requestId: id() };
  const started = await json(`${base(a)}/runs`, request, 202);
  const duplicate = await json(`${base(a)}/runs`, request, 202); assert.equal(duplicate.id, started.id); assert.equal(runtime.calls.length, 1);
  assert.equal((await json(`${base(a)}/backup`, undefined, 409)).error.code, 'backup_busy');
  await json(`${base(a)}/runs/${started.id}/cancel`, {}, 200);
  const cancelled = await f.waitRun(a, started.id); assert.equal(cancelled.status, 'cancelled'); assert.ok(cancelled.cancelRequestedAt);
  assert.equal((await json(`${base(a)}/runs`, request, 202)).id, started.id); assert.equal(runtime.calls.length, 1);
  assert.equal((await json(base(a))).concepts.length, 0);
  const lateRequest = { goal: 'HOLD_LATE_RESULT', language: 'English', requestId: id() };
  const late = await json(`${base(a)}/runs`, lateRequest, 202);
  await json(`${base(a)}/runs/${late.id}/cancel`, {}, 200);
  const received = await f.waitRun(a, late.id); assert.equal(received.status, 'succeeded'); assert.ok(received.cancelRequestedAt);
  const state = await json(base(a)); assert.equal(state.concepts.length, 1); assert.equal(state.selections.length, 0); assert.equal(state.assets.length, 0);
  assert.equal((await json(`${base(a)}/runs`, lateRequest, 202)).id, late.id); assert.equal(runtime.calls.length, 2, 'a late result is preserved without adoption, downstream tasks, or retry');
});

test('HTTP new routes reject cross-project references, CSRF and SSRF without reading or writing private state', async t => {
  const f = await fixture(t), { json, request, a, b, base, runtime } = f;
  const foreignIdea = await f.manual(b), foreignImage = await f.image(b), foreignEvidence = await json(`${base(b)}/evidence`, { title: 'Private source', observation: 'Private reading source.' });
  const foreignSet = await json(`${base(b)}/sets`, { name: 'Private set', mode: 'organic', conceptIds: [foreignIdea.id], brief: { goal: 'Other project.' } });
  const foreignReviewRun = await f.run(b, { taskType: 'review_asset', assetId: foreignImage.id, goal: 'Review foreign image.' });
  const foreignReview = (await json(base(b))).reviews.find(review => review.id === foreignReviewRun.reviewId);
  const crossPosts = [
    ['insights', { title: 'Cross', audience: 'Reader', content: 'Cross', hypothesis: false, evidenceIds: [foreignEvidence.id] }],
    ['sets', { name: 'Cross', mode: 'paid', brief: { goal: 'Cross' }, conceptIds: [foreignIdea.id] }],
    ['sets', { name: 'Cross', mode: 'paid', brief: { goal: 'Cross', assetIds: [foreignImage.id] } }],
    [`sets/${foreignSet.id}/briefs`, { goal: 'Cross' }], [`sets/${foreignSet.id}/concepts`, { conceptIds: [foreignIdea.id] }],
    [`assets/${foreignImage.id}/caption`, { caption: 'Cross edit' }],
    [`reviews/${foreignReview.id}/resolve`, { issueId: foreignReview.issues[0].id, reason: 'Cross resolution' }],
    ['selections', { targetType: 'asset', targetId: foreignImage.id, decision: 'adopted', reason: 'Cross adoption' }],
    ['images', { name: 'Cross image', source: 'Fixture', base64: f.png.toString('base64'), setId: foreignSet.id, conceptId: foreignIdea.id }],
    ['context', { goal: 'Cross context', language: 'English', assetId: foreignImage.id }],
    ['runs', { goal: 'Cross synthesis', language: 'English', taskType: 'synthesize_insights', evidenceIds: [foreignEvidence.id], requestId: id() }],
    [`runs/${foreignReviewRun.id}/cancel`, {}],
  ];
  const originalForeign = await json(base(b)), beforeCalls = runtime.calls.length;
  for (const [tail, body] of crossPosts) assert.equal((await json(`${base(a)}/${tail}`, body, 404)).error.code, 'not_found', tail);
  for (const tail of [`assets/${foreignImage.id}/file`, `sets/${foreignSet.id}/export?draft=1`]) assert.equal((await request(`${base(a)}/${tail}`)).status, 404);
  const newMutations = [['/api/skills', {}], ['/api/restore', {}], ['/api/dispatch', { paused: true }], [`${base(a)}/research`, { url: 'http://127.0.0.1/' }], [`${base(a)}/images`, {}], [`${base(a)}/archive`, { archived: true }], [`${base(a)}/evidence`, {}], [`${base(a)}/insights`, {}], [`${base(a)}/sets`, {}], [`${base(a)}/selections`, {}], [`${base(a)}/skills`, {}]];
  for (const [endpoint, body] of newMutations) assert.equal((await request(endpoint, body, { 'X-CSRF-Token': 'wrong' })).status, 403, endpoint);
  assert.equal((await request(`${base(a)}/images`, {}, { Origin: 'https://attacker.invalid' })).status, 403);
  let hits = 0; const trap = http.createServer((req, res) => { hits++; res.end('PRIVATE_SENTINEL'); });
  await new Promise(resolve => trap.listen(0, '127.0.0.1', resolve));
  try {
    assert.equal((await json(`${base(a)}/research`, { url: 'http://127.0.0.1/' }, 422)).error.code, 'source_address_blocked');
    await json(`${base(a)}/research`, { url: `http://127.0.0.1:${trap.address().port}/` }, 422);
    assert.equal(hits, 0, 'blocked research must never reach a loopback source');
  } finally { await new Promise(resolve => trap.close(resolve)); }
  assert.deepEqual(await json(base(b)), originalForeign); assert.equal(runtime.calls.length, beforeCalls);
  const empty = await json(base(a)); assert.equal(empty.assets.length, 0); assert.equal(empty.evidence.length, 0); assert.equal(empty.insights.length, 0); assert.equal(empty.sets.length, 0); assert.equal(empty.runs.length, 0);
});
