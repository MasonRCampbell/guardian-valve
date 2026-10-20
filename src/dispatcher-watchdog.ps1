param([switch]$DryRun)
$ErrorActionPreference='Stop'
$taskName='Valve Immediate Release Dispatcher'
$root='C:\ProgramData\ValvePipeline'
$logPath=Join-Path $root 'dispatcher-console.log'
$audit=Join-Path $root 'watchdog.jsonl'
function Record([string]$state,[string]$detail) {
  $row=[ordered]@{time=(Get-Date).ToString('o');task=$taskName;state=$state;detail=$detail}
  $line=$row|ConvertTo-Json -Compress
  if(-not $DryRun) {
    try {Add-Content -LiteralPath $audit -Value $line -Encoding UTF8 -ErrorAction Stop}
    catch {Write-Output ('WATCHDOG_LOG_FAILED '+$_.Exception.Message)}
  }
  Write-Output $line
}
try {
  $task=Get-ScheduledTask -ErrorAction Stop | Where-Object {$_.TaskName -eq $taskName} | Select-Object -First 1
  if(!$task){Record 'ALERT' 'Scheduled task missing';exit 2}
  if([string]$task.State -eq 'Disabled'){Record 'ALERT' 'Dispatcher is explicitly disabled; not overriding that choice';exit 3}
  $last=if(Test-Path -LiteralPath $logPath){(Get-Item -LiteralPath $logPath).LastWriteTime}else{[datetime]::MinValue}
  $stale=([datetime]::Now-$last).TotalMinutes -gt 6
  $requiresRestart=([string]$task.State -ne 'Running') -or $stale
  if(-not $requiresRestart){if($DryRun){Record 'HEALTHY' 'Dispatcher running and writing progress'};exit 0}
  # Avoid terminating an in-flight signed release even when dispatcher output is quiet.
  $workers=@(Get-CimInstance Win32_Process -Filter "Name='node.exe'" -ErrorAction Stop | Where-Object {$_.CommandLine -match 'commit-pipeline\.mjs'})
  if($workers.Count -gt 0){Record 'DEFERRED' ('Signed release worker active; count='+$workers.Count);exit 0}
  if($DryRun){Record 'WOULD_RESTART' ('state='+$task.State+' stale='+$stale);exit 0}
  if([string]$task.State -eq 'Running'){Stop-ScheduledTask -TaskName $taskName -ErrorAction Stop;Start-Sleep -Seconds 2}
  Start-ScheduledTask -TaskName $taskName -ErrorAction Stop
  Start-Sleep -Seconds 3
  $after=Get-ScheduledTask -ErrorAction Stop | Where-Object {$_.TaskName -eq $taskName} | Select-Object -First 1
  if([string]$after.State -ne 'Running'){Record 'ALERT' ('Restart requested but state='+$after.State);exit 4}
  Record 'RECOVERED' ('previousState='+$task.State+' logStale='+$stale)
} catch {
  Record 'ERROR' $_.Exception.Message
  exit 5
}
