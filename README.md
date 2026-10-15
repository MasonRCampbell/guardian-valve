# Valve — Universal Release Controller

Valve is an independent, project-neutral Git release controller. The repository is the source of truth; chat history is not.

## Source and installation

- Canonical Git repository: https://github.com/MasonRCampbell/guardian-valve
- Titan source: `C:\GuardianControl\ValveSource`
- Titan runtime: `C:\GuardianControl\Valve\bin`
- Registry: `C:\GuardianControl\Valve\projects.json`
- Append-only failure register: `C:\ProgramData\ValvePipeline\failures.jsonl`
- GitHub watcher state: `C:\ProgramData\ValvePipeline\github-watch-state.json`

The scheduled `Valve Immediate Release Dispatcher` listens to approved manifest changes immediately. Every minute it also queries GitHub workflow results for registered projects. GitHub pushes require a signed, explicitly approved manifest and must pass local guards. A commit or push is never treated as proof of a production deployment.

## Verification and safety

- No automatic staging of unapproved changes.
- No branch force-push, merge-conflict override, history repair or credential disclosure.
- Repository path, branch, remote, allowed paths, staging and remote alignment are validated before release.
- Failed GitHub CI runs are recorded in the central failure register, with fingerprinting and redaction.
- Production revision proof supports HTTPS revision endpoints and live Supabase migration-ledger queries. Supplied migration ID lists alone are **not** proof.
- GitHub CI independently runs syntax checks and project-neutral safety tests.

Run all local tests:

```powershell
Set-Location C:\GuardianControl\ValveSource
node --test test\*.test.mjs
```

## Registered projects (15 October 2026)

- **SitRep**: `C:\SitRepManagement`, branch `main`, origin `MasonRCampbell/site-rep-pros`. GitHub monitoring and production verification are available. The local checkout may have unrelated changes or remote divergence; these block automatic publishing until explicitly reconciled.
- **Australian Data Registry**: `C:\AustralianDataRegistry`, branch `master`. Registered for local preflight, but **not publish-ready** because no GitHub origin remote or independent ADR GitHub repository has been verified. Do not invent a remote, assume deployment success, or overwrite local changes.
- **Valve**: `C:\GuardianControl\ValveSource`, `main`, origin `MasonRCampbell/guardian-valve`. Self-CI is monitored too.

To onboard future GitHub projects, configure their remote and use the guarded project registration CLI; do not copy or fork the Valve controller.

## Pending external dependency

An ADR repository and explicit, verified `origin` need to be established before ADR's remote GitHub delivery and verification can be certified. The current absence must remain visible as a failed publishing-readiness gate.

## Operations

The durable source and runtime scripts must remain identical after an approved installation. Report mismatches rather than silently changing running services. Inspect the Task Scheduler dispatcher, its log and GitHub watcher state before declaring end-to-end operational readiness. Store no passwords, personal access tokens or signing keys in this repository.
