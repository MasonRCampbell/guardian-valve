# Valve — Universal Release Pipeline

Valve is an independent, project-neutral Git release controller. **The chat is not the source of truth**; this repository contains the controller source and tests. The operational installation remains under `C:\GuardianControl\Valve`.

## Safety
- Only explicitly approved, HMAC-signed manifests may trigger a commit and push.
- Validate project ID, repository path, branch, remote, allowlisted paths, clean staging and remote alignment.
- Never force push, rewrite history, silently resolve conflicts, or stage unrelated files.
- Record failures as redacted JSONL events; no secrets in logs.
- A successful Git push is **not** proof that hosting or databases deployed; production verification is a separate required stage.

## Tests
Run from any working directory:
```powershell
node --test C:\GuardianControl\ValveSource\test\valve.test.mjs C:\GuardianControl\ValveSource\test\integration.test.mjs
```

## Deployment
The executable scripts in `src/` are copied to the installed `C:\GuardianControl\Valve\bin` only through an approved, version-checked deployment operation. Do not mix state, manifests or tokens into source control.

## Publication
Set the independent GitHub repository as `origin` and push `main` after the private repository is created and access verified. Never claim GitHub-backed source-of-truth until the remote exists and its commit is checked.

## Projects
Project registration is in `C:\GuardianControl\Valve\projects.json`; new projects are registered there without copying or forking Valve.
