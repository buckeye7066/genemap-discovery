@echo off
rem GeneMap nightly sweep — schtasks entry point.
rem Registered as scheduled task "GeneMap Nightly Sweep" (daily 03:00).
rem Logs to reports\agents\last-run.log (overwritten each night; the durable
rem record is reports\agents\nightly-<date>.md written by the sweep itself).
cd /d "C:\Users\firer\genemap-discovery"
if not exist "reports\agents" mkdir "reports\agents"
"C:\Program Files\nodejs\node.exe" scripts\agents\nightly-sweep.mjs > "reports\agents\last-run.log" 2>&1
