param([ValidateSet('serve','test','build','prepare')][string]$Mode = 'serve')
$ErrorActionPreference = 'Stop'
$demoRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..\.haeday-local'))
$pgBin = Join-Path $demoRoot 'runtime\node_modules\@embedded-postgres\windows-x64\native\bin'
if (!(Test-Path -LiteralPath (Join-Path $pgBin 'pg_ctl.exe'))) { throw 'Local PostgreSQL runtime is missing. Ask the coding agent to restore the local demo runtime.' }
# PostgreSQL bootstrap needs an ASCII path on this Windows installation.
if (Test-Path H:\) {
  Add-Type -TypeDefinition @'
using System;
using System.Text;
using System.Runtime.InteropServices;
public static class HaedayLocalDrive {
  [DllImport("kernel32.dll", CharSet=CharSet.Unicode)]
  public static extern uint QueryDosDevice(string name, StringBuilder target, int size);
}
'@
  $target = New-Object Text.StringBuilder 4096
  $found = [HaedayLocalDrive]::QueryDosDevice('H:', $target, $target.Capacity)
  $mapping = if ($found -gt 0 -and $target.ToString().StartsWith('\??\')) { $target.ToString().Substring(4) } else { '' }
  if ($mapping.TrimEnd('\') -ne $demoRoot.TrimEnd('\')) { throw 'Drive H: is in use by another location. Ask the coding agent to select an unused drive.' }
} else {
  & subst H: $demoRoot
  if ($LASTEXITCODE -ne 0) { throw 'Could not create the local demo path mapping.' }
}
& "$pgBin\pg_ctl.exe" -D H:\data status *> $null
if ($LASTEXITCODE -ne 0) {
  & "$pgBin\pg_ctl.exe" -D H:\data -l H:\postgres.log -o '-h 127.0.0.1 -p 55432' -w start
  if ($LASTEXITCODE -ne 0) { throw 'Local PostgreSQL did not start.' }
}
& 'C:\Program Files\nodejs\node.exe' (Join-Path $PSScriptRoot 'local-demo.mjs') $Mode
exit $LASTEXITCODE
