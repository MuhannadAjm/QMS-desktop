# Git Versioning Strategy — QMS Desktop

## Repository

```
Remote: https://github.com/MuhannadAjm/QMS-desktop.git
Default branch: main
```

---

## Branch Strategy

| Branch | Purpose | Merge target |
|---|---|---|
| `main` | Stable, release-ready code only | — |
| `phase/NNA-description` | Phase implementation work | `main` (PR or direct merge after validation) |
| `fix/short-description` | Isolated bug fixes | `main` |
| `chore/short-description` | Tooling, docs, config changes | `main` |

**Rules:**
- Never commit directly to `main` for feature work — use a phase branch.
- `main` is always buildable (`npm run tauri build` must succeed).
- Force-push to `main` is never allowed.

---

## Commit Message Rules

Format: `<type>: <short summary (≤72 chars)>`

| Type | Use for |
|---|---|
| `feat` | New user-facing functionality |
| `fix` | Bug fix |
| `chore` | Build scripts, config, docs, tooling |
| `refactor` | Code restructure without behavior change |
| `test` | Test additions or changes |
| `perf` | Performance improvement |
| `security` | Security hardening |

Examples:
```
feat: username-based login and profile dropdown (Phase 11A)
fix: backup menu items disabled before login
chore: baseline QMS Desktop after Phase 11A
security: require current password before own password change
```

**Do not:**
- Reference issue numbers or phase names in the subject line (put those in the body).
- Commit merge commits unless squash-merging a branch.
- Amend published commits on `main`.

---

## Tag Naming

Format: `v<MAJOR>.<MINOR>.<PATCH>-<phase-slug>`

| Example tag | Meaning |
|---|---|
| `v1.0.0-phase11a-auth-users` | Version 1.0.0 at end of Phase 11A |
| `v1.0.0-phase11b-ui-polish` | Version 1.0.0 at end of Phase 11B |
| `v1.0.0` | Final clean release (no phase suffix) |

**Tagging commands:**
```sh
# Create annotated tag
git tag -a v1.0.0-phase11a-auth-users -m "Phase 11A: Auth, Users, Profile, and Menu Context Cleanup"

# Push the tag
git push origin v1.0.0-phase11a-auth-users

# List all tags
git tag -l
```

---

## Release Artifact Policy

- **Do NOT commit installer binaries** (`.msi`, `.exe`) to git. They are excluded by `.gitignore`.
- Release artifacts are distributed via **GitHub Releases** only.
- `test-builds/` directory contains test artifacts on the developer's machine; it is git-ignored.

**Release process (manual for now):**
1. Run `npm run tauri build` on the build machine.
2. Collect `*.msi` and `*-setup.exe` from `src-tauri/target/release/bundle/`.
3. Create a GitHub Release for the matching tag.
4. Upload both installers as release assets.

---

## Secret Handling

**Files that must NEVER be committed:**

| File | Reason |
|---|---|
| `license_private_key.pem` | RSA-2048 signing key — only in the signer's environment |
| `license_public_key.pem` | Public half compiled into `rsa_public_key.rs`; redundant and could confuse key rotation |
| `license_hash_secret.txt` | HMAC secret from dev era |
| `.env.local` (root) | Local environment overrides |
| `license-admin/.env.local` | Supabase URL + anon key for admin portal |
| `supabase/.temp/` | Supabase CLI state including project-ref and pooler URL |

**These are all covered by `.gitignore`.** To verify nothing leaked, run:
```sh
git ls-files | Select-String "\.pem$|\.key$|\.env|hash_secret"
```
Expected output: nothing.

**If a secret is accidentally committed:**
1. Rotate the secret immediately (generate a new key or reset the credential).
2. Use `git filter-branch` or `git-filter-repo` to remove it from history.
3. Force-push the cleaned branch (coordinate with all collaborators).
4. Notify any collaborators who cloned the repo.

---

## Rollback Instructions

### Undo last commit (not yet pushed)
```sh
git reset --soft HEAD~1   # keeps changes staged
git reset --mixed HEAD~1  # keeps changes unstaged
```

### Undo last commit (already pushed) — create a revert commit
```sh
git revert HEAD
git push origin main
```

### Return to a specific tag
```sh
# Inspect the tag's tree without changing current branch
git show v1.0.0-phase11a-auth-users

# Create a branch from a tag for hotfix work
git checkout -b fix/hotfix-name v1.0.0-phase11a-auth-users
```

### Emergency rollback of production installer
1. Identify the last known-good tag (e.g., `v1.0.0-phase11a-auth-users`).
2. Check out that tag to a branch: `git checkout -b rollback v1.0.0-phase11a-auth-users`.
3. Run `npm run tauri build` to produce a clean installer from that commit.
4. Distribute the rolled-back installer via the same channel as normal releases.

---

## Common Workflows

### Start a new phase
```sh
git checkout main
git pull origin main
git checkout -b phase/11b-ui-polish
```

### Finish a phase and merge
```sh
git checkout main
git merge --squash phase/11b-ui-polish
git commit -m "feat: Phase 11B — UI/UX polish and route guards"
git tag -a v1.0.0-phase11b-ui-polish -m "Phase 11B complete"
git push origin main
git push origin v1.0.0-phase11b-ui-polish
```

### Check what is and is not tracked
```sh
git status                     # working tree state
git ls-files                   # all tracked files
git ls-files --others --exclude-standard  # untracked files not in .gitignore
```

---

## First Push Checklist

Before `git push origin main` for the first time:

- [ ] `git ls-files | Select-String "\.pem$|\.key$|\.env|hash_secret"` returns nothing
- [ ] `git status` shows no unexpected files staged
- [ ] `npm run build` passes (TypeScript)
- [ ] `cargo check` passes (Rust)
- [ ] `docs/GIT_VERSIONING.md` committed
- [ ] `.gitignore` committed
- [ ] No `node_modules/`, `dist/`, `src-tauri/target/`, `test-builds/` in `git ls-files`
