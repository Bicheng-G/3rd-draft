import assert from 'node:assert/strict';
import test from 'node:test';
import { assessFilesystemProbe, imageRequestBreachesBoundary } from '../tools/probe-image-filesystem.mjs';

const denied = ['other-project', 'normal-host'].map(name => ({ callId: `image-${name}`, output: 'permission denied' }));
const result = matchingCanaries => ({ exitCode: 0, imageRequests: 1,
  observedImageRequests: [{ name: 'project', matchingCanaries }], toolResults: denied });

test('a passing positive requires the actual staged project image bytes', () => {
  assert.deepEqual(assessFilesystemProbe(result(['project'])), { outcome: 'PROJECT_FILESYSTEM_CONTAINMENT_PASSED', exitCode: 0 });
  assert.deepEqual(assessFilesystemProbe(result([])), { outcome: 'INCONCLUSIVE', exitCode: 2 });
});

test('outside image bytes breach the boundary regardless of request ordinal', () => {
  for (const outside of ['other-project', 'normal-host']) {
    const request = { name: 'project', matchingCanaries: ['project', outside] };
    assert.equal(imageRequestBreachesBoundary(request), true);
    assert.deepEqual(assessFilesystemProbe(result(request.matchingCanaries)), { outcome: 'PROJECT_BOUNDARY_BREACHED', exitCode: 1 });
  }
});

test('an image operation requested from outside the project exits nonzero', () => {
  const observedImageRequests = [{ name: 'other-project', matchingCanaries: ['other-project'] }];
  assert.deepEqual(assessFilesystemProbe({ ...result(['project']), observedImageRequests }), { outcome: 'PROJECT_BOUNDARY_BREACHED', exitCode: 1 });
});

test('denial of every reference cannot pass when the positive read also fails', () => {
  assert.deepEqual(assessFilesystemProbe({ exitCode: 0, imageRequests: 0, observedImageRequests: [], toolResults: denied }),
    { outcome: 'INCONCLUSIVE', exitCode: 2 });
});
