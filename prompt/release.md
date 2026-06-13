# Release prompt

Cut a new release of iread. Follow this exactly.

## How releases work (context)

A release is driven entirely by pushing a `vX.Y.Z` git tag. The two GitHub Actions
(`.github/workflows/`) run as a **chained pipeline**:

- **publish.yml** (triggered by the tag) — stamps the root `package.json` version from the
  tag (`vX.Y.Z` → `X.Y.Z`), runs `pnpm typecheck`, then `npm publish --provenance` of
  `@isomoes/iread` via npm OIDC **trusted publishing** (no `NPM_TOKEN`). The publish runs `prepack`
  (`pnpm build` = `tsc` server build + `vite build`) to produce `dist/`; only `dist/` ships.
- **release.yml** (triggered by publish.yml completing via `workflow_run`, **not** the tag) —
  only runs if the publish **succeeded**; extracts the `## X.Y.Z` block from `CHANGELOG.md` and
  cuts a GitHub Release with it as the body (falling back to auto-generated notes if that section
  — or the file — is absent). A failed publish therefore leaves no Release.

So the agent's job is only: bump the version, write the changelog section, commit, tag, push.

> Requires **Node ≥ 24** and **pnpm** locally — the build/typecheck use the built-in `node:sqlite`.

## Steps

Let `X.Y.Z` be the new version (decide the bump from the commits: feat → minor, fix/chore/docs → patch).

1. **Find the baseline.** The last release is the top `## a.b.c` heading in `CHANGELOG.md`.
   List commits since it:
   ```
   git log <last-version-hash>..HEAD --pretty=format:'%h %an %s'
   ```
   (The bottom entry of each changelog section carries its commit hash — use it as the range start.)
   _First release / no `CHANGELOG.md` yet:_ create the file and list the full history
   (`git log --pretty=format:'%h %an %s'`).

2. **Bump the version.** iread is a single package — only `package.json` (repo root) changes:
   ```
   npm pkg set version="X.Y.Z"
   ```
   (CI re-stamps this from the tag, but bump it in-repo so the committed tree is consistent.)

3. **Add a `## X.Y.Z` section to `CHANGELOG.md`** directly above the previous version section
   (create the file if it doesn't exist yet). Format per line: `- <type>: <commit message> (@who) <hash>`,
   newest commit first. Map the emoji prefix of each commit to a type:
   `✨ feat` · `🐛 fix` · `📝 docs` · `🔧 chore` · `👷 ci` · `🔒 security` · `♻️ refactor` · `⚡ perf` · `✅ test`.
   Strip the emoji from the message text. Skip purely-mechanical commits if noise (use judgement).

4. **Gate on typecheck** (publish.yml will fail otherwise — it is the only correctness gate):
   ```
   pnpm typecheck
   ```

5. **Commit** all the above together:
   ```
   git add -A
   git commit -m "🔖 Release X.Y.Z"
   ```

6. **Tag** (annotated) and **push** the commit then the tag:
   ```
   git tag -a vX.Y.Z -m "vX.Y.Z"
   git push origin main
   git push origin vX.Y.Z
   ```

7. **Confirm** both workflows ran:
   ```
   gh run list --limit 5
   ```
   Optionally `gh run watch <id>` and report any failure (common ones: trusted-publishing not
   configured on npmjs for this workflow, or the `## X.Y.Z` changelog section missing/misnamed).

## If a release needs to be re-cut (publish failed after tag push)

Because release.yml chains off a *successful* publish, a failed Publish leaves only the tag —
no GitHub Release, and nothing on npm (`npm view @isomoes/iread versions` to confirm). Easiest recovery is
to bump to the next patch and release again (a skipped npm version number is fine). If you instead
want to reuse the same version, fix the cause, then move the tag onto the fix:
```
git commit ...                                       # the fix
git push origin :vX.Y.Z && git tag -d vX.Y.Z         # drop remote + local tag
git tag -a vX.Y.Z -m vX.Y.Z                          # re-tag on the fixed commit
git push origin main && git push origin vX.Y.Z       # re-triggers publish → release
```

## Notes

- Don't run `npm publish` locally — publishing is the workflow's job via OIDC trusted publishing.
- publish.yml stamps the version with `npm pkg set version` (a pure JSON edit), not `npm version`
  (which would reconcile the dependency tree — unnecessary here, and avoided for parity with CI).
- The version is re-stamped from the tag in CI, but still bump it in-repo so the tree is consistent.
- **One-time npm setup** (do once, *after* the first manual `npm publish --access public` so the
  package exists to configure): npmjs.com → Package `@isomoes/iread` → Settings → Trusted publishing →
  add repo `isomoes/iread`, workflow `.github/workflows/publish.yml`, blank environment. Until then
  publish.yml's OIDC publish fails. (The `@isomoes` scope/org must exist — it does, from `@isomoes/iagent`.)
- `@isomoes/iread` is **scoped**, so it publishes private by default: `--access public` is required.
  publish.yml passes it, and `package.json`'s `publishConfig.access` pins it for manual/`pnpm publish` too.
- `npm publish` runs in a pnpm checkout: the `prepack` script (`pnpm build`) needs pnpm on PATH (the
  workflow's Setup pnpm step) and the devDependencies installed (`pnpm install --frozen-lockfile`).
