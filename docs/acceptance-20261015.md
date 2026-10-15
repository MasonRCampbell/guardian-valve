# Valve final acceptance evidence — 2026-10-15

## Verified in live Titan session

- 13/13 independent Node safety tests passed (`node --test test/*.test.mjs`). Coverage includes signed isolated pushes, unauthorized signature rejection, source registration guards, private GitHub repository bootstrap, CI deduplication, SQL ledger proof rejection and failure redaction.
- SHA-256 matched for all eight live executable files and source files in `C:\GuardianControl\ValveSource\src`.
- Valve repository `main` clean and tracking `origin/main` after audit helper scripts were moved out of the canonical source.
- SitRep and ADR live preflight reported `ready:true` with all checks passed.
- Live GitHub CI watcher returned `projects:["Valve","SitRep","ADR"]`, `failureEvents:0`, with successful read at `2026-10-15T05:24:25.035Z` (UTC).
- Scheduled task `Valve Immediate Release Dispatcher` reported `Running`.
- Approved-release queue empty before recovery experiment.
- Corrected Windows scheduled-task settings and read back: `RestartCount:3`, `StartWhenAvailable:true`, `DisallowStartIfOnBatteries:false`, `StopIfGoingOnBatteries:false`.
- GitHub → Supabase integration had previously deployed non-destructive migration `20261015150000`, verified against production ledger and checksum.

## Still not validated (do not declare 100%)

1. Controlled stop/start of the Windows dispatcher was attempted but the execution safety layer rejected the action; service restart/recovery was **not** tested.
2. No fault-injection exercise has proven recovery from a half-complete Git push/deployment, network outage or OS shutdown.
3. No fresh full Guardian approval → signed manifest → GitHub CI → Hostinger/Supabase revision proof has been executed in this acceptance run for both live projects. Isolated signed-push tests and past SitRep deployment proofs do not substitute for that.
4. There is no evidence of generic zero-configuration hosting/deployment adapters for arbitrary future projects. GitHub repo creation is automated, but deployment destination setup may require explicit configuration.
5. Historical Supabase effect reconciliation remains a separate, documented forensic work item.

## Sign-off

**Not 100% certified.** Operational core and tests passed; restart and end-to-end recovery acceptance remain outstanding. Do not invent evidence or bypass the approval/signature guard to close this report.
