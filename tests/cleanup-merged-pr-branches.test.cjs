'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { cleanMergedBranches } = require('../scripts/cleanup-merged-pr-branches.cjs');

const owner = 'ashiqparapurath', repo = 'treatstory', fullName = owner + '/' + repo;
function pr(number, branch, sha, { merged = true, open = false, fork = false } = {}) {
  return {
    number,
    merged_at: merged ? '2026-11-20T10:00:00Z' : null,
    base: { ref: 'main' },
    head: { ref: branch, sha, repo: { full_name: fork ? 'someone/else' : fullName } },
    state: open ? 'open' : 'closed',
  };
}
function client({ branches, closed, open = [], changed = [] }) {
  const deleted = [];
  const methods = {
    listBranches() {}, listPulls() {},
  };
  const data = {
    [methods.listBranches.name]: branches,
    [methods.listPulls.name]: null,
  };
  const github = {
    paginate: async (method, opts) => method === methods.listBranches ? branches
      : opts.state === 'closed' ? closed : open,
    rest: {
      repos: {
        get: async () => ({ data: { default_branch: 'main' } }),
        listBranches: methods.listBranches,
        getBranch: async ({ branch }) => {
          const target = branches.find(b => b.name === branch);
          if (!target) throw new Error('missing branch');
          return { data: { ...target, commit: { sha: changed.includes(branch) ? 'new-head' : target.commit.sha } } };
        },
      },
      pulls: { list: methods.listPulls },
      git: { deleteRef: async args => { deleted.push(args.ref); } },
    },
  };
  const logs = [];
  const core = {
    info: message => logs.push(message),
    warning: message => logs.push(message),
    setFailed: message => { throw new Error(message); },
  };
  return { github, core, deleted, logs };
}
const branches = [
  { name: 'main', commit: { sha: 'current-main' }, protected: false },
  { name: 'feature/merged', commit: { sha: 'abc' }, protected: false },
  { name: 'feature/changed', commit: { sha: 'xyz' }, protected: false },
  { name: 'feature/active', commit: { sha: '123' }, protected: false },
  { name: 'feature/abandoned', commit: { sha: '456' }, protected: false },
  { name: 'feature/protected', commit: { sha: '789' }, protected: true },
  { name: 'feature/fork-collision', commit: { sha: '000' }, protected: false },
  { name: 'standalone', commit: { sha: '999' }, protected: false },
];
const closed = [
  pr(1, 'feature/merged', 'abc'),
  pr(2, 'feature/changed', 'old-sha'),
  pr(3, 'feature/active', '123'),
  pr(4, 'feature/abandoned', '456', { merged: false }),
  pr(5, 'feature/protected', '789'),
  pr(6, 'feature/fork-collision', '000', { fork: true }),
];
const open = [pr(7, 'feature/active', '123', { merged: false, open: true })];

test('cleanup deletes only unchanged merged PR branches and protects main, open, abandoned and standalone branches', async () => {
  const { github, core, deleted } = client({ branches, closed, open });
  const result = await cleanMergedBranches({ github, core, context: { repo: { owner, repo } } });
  assert.deepEqual(deleted, ['heads/feature/merged']);
  assert.deepEqual(result.deleted, ['feature/merged']);
  assert.equal(result.failed.length, 0);
  assert.ok(result.skipped.includes('main'));
  assert.ok(result.skipped.includes('feature/active'));
  assert.ok(result.skipped.includes('feature/abandoned'));
  assert.ok(result.skipped.includes('standalone'));
});

test('dry run reports matches without deleting', async () => {
  const { github, core, deleted } = client({ branches, closed, open });
  const result = await cleanMergedBranches({ github, core, context: { repo: { owner, repo } }, dryRun: true });
  assert.deepEqual(deleted, []);
  assert.deepEqual(result.eligible, ['feature/merged']);
});

test('fresh ref check preserves a branch updated while the cleanup was running', async () => {
  const { github, core, deleted } = client({ branches, closed, open, changed: ['feature/merged'] });
  const result = await cleanMergedBranches({ github, core, context: { repo: { owner, repo } } });
  assert.deepEqual(deleted, []);
  assert.ok(result.skipped.includes('feature/merged'));
});
