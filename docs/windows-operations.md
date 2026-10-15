# Valve — Production operating model

## Source of truth and machine installation

- Canonical source: private GitHub repository `MasonRCampbell/guardian-valve`, branch `main`.
- Titan source checkout: `C:\GuardianControl\ValveSource`.
- Titan executable scripts: `C:\GuardianControl\Valve\bin`.
- Registered projects: `C:\GuardianControl\Valve\projects.json` (machine-local policy, not a copy in each project).
- Queue: `C:\ProgramData\ValvePipeline\approved`; failure register: `C:\ProgramData\ValvePipeline\failures.jsonl`; GitHub polling state: `C:\ProgramData\ValvePipeline\github-watch-state.json`.
- Never commit the queue, credential cache, local state, or repository backups to GitHub.

The executable controller and its source repository are separate from SitRep and ADR. A chat session is an execution interface, not project storage.

## Background dispatcher on Titan

Task Scheduler task: `Valve Immediate Release Dispatcher`.

The **Action must execute Node directly**. Executable: `C:\Program Files\nodejs\node.exe`. Arguments: `C:\GuardianControl\Valve\bin\event-dispatcher.mjs`. Working directory: `C:\GuardianControl\Valve`. Principal: local signed-in user `Titan\mason`, limited interactive context.

The task runs at logon and has three automatic restarts, at one-minute intervals, no execution time limit, and IgnoreNew multiple-instance policy. The earlier batch-file action failed with exit code 1. Its replacement with direct Node was verified in Task Scheduler as **Running**, and the durable GitHub watch state continued updating.

The task account must have Modify access to `C:\ProgramData\ValvePipeline` and its children. This permits the controller to append failures and replace the watcher state atomically. Do not grant these files broad network access.

## Immediate, safeguarded commits

A project is registered once using `node src/register-project.mjs add <project-id> <checkout-path> [branch]` on the source checkout, or the installed equivalent. Registration requires an existing Git repository, expected branch, and GitHub `origin`; it cannot silently create or replace application projects.

Only explicit, approved, signed release manifests can trigger the dispatcher to commit and push. The dispatcher reacts to changes in the approved queue immediately; it does not wait for an hourly sweep. The commit pipeline rejects unapproved paths, foreign repository paths, staging contamination, conflicts and branch divergence. No force push or automatic destructive history rewriting is allowed.

A push is not a successful production deployment. The independent `release-verify.mjs` handles HTTPS revision proofs and **live** Supabase migration-ledger proofs. It refuses supplied `verifiedMigrationIds` as proof. Proof records are stored under `C:\ProgramData\ValvePipeline\proofs` when live checks pass.

## Central failure monitoring

The dispatcher polls GitHub Actions once per minute for Valve and GitHub-connected registered projects. It backfills recent failures, records each failing run only once, retains durable seen-run state across restarts, and appends redacted JSONL failure events. API credentials are provided by the user's Git Credential Manager or an appropriate environment token and are **never** copied to source or JSONL output.

The monitoring implementation and tests are in `src/github-ci-watch.mjs` and `test/github-ci-watch.test.mjs`. Run `node --test test/*.test.mjs` for the project-independent safety suite.

## Project-specific release readiness at 15 October 2026

- **Valve:** independent GitHub remote configured, local and remote source synchronized, CI passing.
- **SitRep:** GitHub production release and Supabase migration pipeline proven previously. Titan local `main` had an unmerged local Admin Centre commit and later upstream commits. Reconciliation must preserve the floating-centre layout and restore backed-up working files. Do not disable preflight to bypass divergence.
- **ADR:** registered locally but no GitHub `origin` yet; GitHub monitoring and push remain unavailable until a private remote is established. Do not upload ADR data blindly; preserve all local work and the no-dataset-download policy.

Check the project preflight report for the live state. A project marked `ready:false` cannot be treated as fully integrated or deployable.
