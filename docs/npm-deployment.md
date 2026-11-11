# npm build warnings on Vercel

TreatStory uses the Node.js 24 engine, npm's lockfile, and the Next.js build script.

## Install scripts

Recent npm releases report dependencies that have install scripts but are not listed in `allowScripts`. TreatStory explicitly approves only the **exact locked versions** of the three packages identified in the deployment warning: `@firebase/util`, `esbuild`, and `protobufjs`. The optional `fsevents` dependency is not approved on Linux; it is not installed there.

Review changed scripts and update the corresponding version-pinned entries deliberately when upgrading dependencies. Do **not** use `--dangerously-allow-all-scripts`, `--ignore-scripts`, or blanket approval as a warning workaround. You can inspect pending scripts with `npm install-scripts ls` on a current npm release.

## Unknown npm cache-dir setting

There is no repository `.npmrc` containing `cache-dir`. The warning reflects an obsolete npm configuration variable from the build environment. The Vercel `installCommand` and `buildCommand` in `vercel.json` unset **only** `npm_config_cache_dir` and `NPM_CONFIG_CACHE_DIR` before launching npm. They leave npm's supported `cache` setting and all normal Next.js build behavior intact.

If the warning still appears **before these custom commands execute**, check the Vercel Project → Settings → Environment Variables for `npm_config_cache_dir` or `NPM_CONFIG_CACHE_DIR` and remove that deprecated entry. Platform-generated warnings before custom commands cannot be controlled by app source files.

Vercel uses `npm ci` for a reproducible install, followed by the unchanged `npm run build` task.

The informational “packages are looking for funding” line is not a warning or a build error.
