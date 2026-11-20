'use strict';

/**
 * Delete only heads of already-merged PRs whose branch has not changed
 * since the PR was merged. This is intentionally conservative:
 *
 * - main/default, protected, changed-tip, and still-open PR branches stay.
 * - closed but UNMERGED PR branches stay.
 * - manual/standalone branches without merged PRs stay.
 * - forks and other repositories are never touched.
 *
 * Runs only in trusted actions on the repo's main branch.
 */
async function cleanMergedBranches({ github, context, core, dryRun = false }) {
  const { owner, repo } = context.repo;
  const fullName = owner + '/' + repo;
  const info = await github.rest.repos.get({ owner, repo });
  if (info.data.default_branch !== 'main') {
    throw new Error('Unexpected default branch; refusing to clean repository refs.');
  }

  const [branches, closed, open] = await Promise.all([
    github.paginate(github.rest.repos.listBranches, { owner, repo, per_page: 100 }),
    github.paginate(github.rest.pulls.list, { owner, repo, state: 'closed', per_page: 100 }),
    github.paginate(github.rest.pulls.list, { owner, repo, state: 'open', per_page: 100 }),
  ]);

  const activeHeads = new Set(open
    .filter(pr => pr.head?.repo?.full_name === fullName)
    .map(pr => pr.head.ref));

  const mergedHeads = new Map();
  for (const pr of closed) {
    if (!pr.merged_at || pr.base?.ref !== 'main' ||
        pr.head?.repo?.full_name !== fullName || !pr.head.ref || !pr.head.sha) continue;
    const current = mergedHeads.get(pr.head.ref);
    if (!current || new Date(pr.merged_at) > new Date(current.merged_at)) {
      mergedHeads.set(pr.head.ref, { sha: pr.head.sha, merged_at: pr.merged_at, number: pr.number });
    }
  }

  const deleted = [], eligible = [], skipped = [], failed = [];
  for (const branch of branches) {
    const name = branch.name;
    const merged = mergedHeads.get(name);
    if (name === 'main' || !merged || branch.protected || activeHeads.has(name) ||
        branch.commit?.sha !== merged.sha) {
      skipped.push(name);
      continue;
    }
    // Re-read immediately before deleting: a new commit may have been pushed
    // since the initial paginated branch list was retrieved.
    try {
      const fresh = await github.rest.repos.getBranch({ owner, repo, branch: name });
      if (fresh.data.protected || fresh.data.commit?.sha !== merged.sha) {
        skipped.push(name);
        core.info('Preserved modified or protected branch ' + name);
        continue;
      }
      eligible.push(name);
      if (dryRun) {
        core.info('DRY RUN: would delete ' + name + ' (merged PR #' + merged.number + ')');
        continue;
      }
      await github.rest.git.deleteRef({ owner, repo, ref: 'heads/' + name });
      deleted.push(name);
      core.info('Deleted merged PR branch: ' + name + ' (#' + merged.number + ')');
    } catch (error) {
      // Never force-delete, retarget, or retry with a different SHA.
      failed.push(name);
      core.warning('Could not verify/delete branch ' + name + ': ' + (error.message || String(error)));
    }
  }

  core.info((dryRun ? 'Previewed ' : 'Deleted ') + (dryRun ? eligible.length : deleted.length) +
    ' merged branches; preserved ' + skipped.length + '; failed ' + failed.length + '.');
  if (failed.length) core.setFailed('Some branches could not be cleaned safely: ' + failed.join(', '));
  return { eligible, deleted, skipped, failed };
}

module.exports = { cleanMergedBranches };
