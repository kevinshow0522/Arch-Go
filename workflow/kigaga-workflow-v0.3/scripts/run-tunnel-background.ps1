$ErrorActionPreference = 'Stop'
Import-Module (Join-Path $PSScriptRoot 'tunnel-runtime.psm1') -Force -DisableNameChecking
$paths = Get-KgTunnelPaths
$lock = Open-KgRuntimeLock $paths.Lock
if ($null -eq $lock) { exit 0 }
$child = $null
$credential = $null
try {
    if (Test-Path -LiteralPath $paths.Stop) { exit 0 }
    $settings = Get-KgTunnelSettings $paths.Root
    if (-not (Test-Path -LiteralPath $paths.Credential)) {
        Write-KgTunnelStatus $paths.Status 'setup_required'
        exit 2
    }
    try { $credential = Read-KgTunnelCredential $paths.Credential $settings.TunnelId }
    catch { Write-KgTunnelStatus $paths.Status 'credential_unavailable'; exit 2 }
    if ((Get-KgTunnelHealth $settings.HealthUrl) -ne 'offline') {
        Write-KgTunnelStatus $paths.Status 'existing_connection'
        exit 0
    }
    $delay = 5
    while (-not (Test-Path -LiteralPath $paths.Stop)) {
        Write-KgTunnelStatus $paths.Status 'connecting'
        try {
            $child = Start-KgTunnelChild $settings $credential
            while (-not $child.HasExited -and -not (Test-Path -LiteralPath $paths.Stop)) {
                $health = Get-KgTunnelHealth $settings.HealthUrl
                if ($health -eq 'ready') { $delay = 5 }
                Write-KgTunnelStatus $paths.Status $health $child.Id
                for ($tick = 0; $tick -lt 5 -and -not (Test-Path -LiteralPath $paths.Stop) -and -not $child.HasExited; $tick++) { Start-Sleep -Seconds 1 }
            }
        } catch { Write-KgTunnelStatus $paths.Status 'retrying' }
        finally {
            if ($null -ne $child) {
                Stop-KgTunnelChild $child
                $child.Dispose(); $child = $null
            }
        }
        if (Test-Path -LiteralPath $paths.Stop) { break }
        Write-KgTunnelStatus $paths.Status 'retrying'
        for ($tick = 0; $tick -lt $delay -and -not (Test-Path -LiteralPath $paths.Stop); $tick++) { Start-Sleep -Seconds 1 }
        $delay = [Math]::Min(60, $delay * 2)
    }
    Write-KgTunnelStatus $paths.Status 'stopped'
} catch {
    Write-KgTunnelStatus $paths.Status 'configuration_error'
    exit 1
} finally {
    if ($null -ne $child) {
        Stop-KgTunnelChild $child
        $child.Dispose()
    }
    if ($null -ne $credential) { $credential.Password.Dispose() }
    $lock.Dispose()
}
