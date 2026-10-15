# Valve production acceptance — 15 October 2026

## Live acceptance: passed

- **15/15 automated tests passed** on Titan, including signed isolated pushes, signature rejection, private repository creation, project registration, CI deduplication, Supabase spoofed-proof rejection, failure redaction, branch-divergence rejection before staging, and signed-queue dispatcher restart recovery.
- **Actual Windows Task Scheduler stop/start completed successfully** for `Valve Immediate Release Dispatcher`; task returned `Running`.
- **Isolated dispatcher acceptance:** a signed queued release committed and pushed to a local bare Git remote, then the dispatcher process was killed and restarted; a second signed queued release committed/pushed. The remote contained exactly three expected commits, with no duplicate release.
- **Branch divergence fix deployed:** the worker now fetches/validates upstream before staging, preserving approved pending changes when remote has moved. SHA-256 for source and runtime worker matched after installation.
- **GitHub CI succeeded** on Valve revisions `df9d1e71bf2d8861d572a5565cd5d75123401504` and `c1f3f9872299b27e04ca065d4548dc63e5cc6faf`.
- The Valve Git working tree is clean, tracking `origin/main`; runtime dispatcher is running.
- CI watcher independently scanned Valve, SitRep and ADR and reported zero newly detected failures at `2026-10-15T05:33:48.237Z`.
- Scheduled task now allows battery operation and has `StartWhenAvailable=true` and three restart attempts.
- SitRep and ADR last project Git preflight checks both reported ready and aligned.
- The SitRep Supabase production release chain had previously applied and independently verified safe migration `20261015150000` against the live production ledger.

## Limits of certification (no invented proof)

The validated scope is Valve's **local release controller, guarded signing, GitHub CI observation, registered project Git preflight, and SitRep Supabase production transport**.

Not proven by this round: OS power loss while a git commit/push is partially executing, recovery after an actual production hosting or Supabase outage, fully automatic hosting configuration for an arbitrary new project, or every project having a production revision-proof adapter. An isolated clean shutdown/restart is not the same as power-loss fault injection.

The historical Supabase migration SQL-effect forensic audit is separate and cannot be treated as evidence of release pipeline failure.

## Verdict

**Tested release-controller and GitHub CI integration: PASS. Generic all-project zero-configuration deployment and arbitrary crash/outage recovery: NOT FULLY CERTIFIED.** Continue to fail closed for unknown deployment targets or unreconciled branch states. Do not claim an arbitrary hosting release is production-verified without target-specific proof.
