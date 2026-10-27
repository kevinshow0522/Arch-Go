param([string]$ScratchRoot = $env:TEMP)
$ErrorActionPreference = 'Stop'
$modulePath = Join-Path $PSScriptRoot '..\scripts\tunnel-runtime.psm1'
if (-not (Test-Path -LiteralPath $modulePath)) { throw 'Missing persistent tunnel runtime implementation.' }
Import-Module $modulePath -Force -DisableNameChecking
$testRoot = Join-Path $ScratchRoot ('kigaga-tunnel-test-' + [guid]::NewGuid().ToString('N'))
[void][IO.Directory]::CreateDirectory($testRoot)
$checks = 0
function Check([bool]$Condition, [string]$Message) {
    if (-not $Condition) { throw $Message }
    $script:checks++
}
$secret = ConvertTo-SecureString 'sk-kigaga-fake-test-only-no-api-access' -AsPlainText -Force
$wrong = ConvertTo-SecureString 'sk-admin-test-only' -AsPlainText -Force
try {
    $path = Join-Path $testRoot 'credentials\tunnel.clixml'
    Save-KgTunnelCredential -Path $path -TunnelId 'tunnel_test_one' -Secret $secret
    Check (([IO.File]::ReadAllText($path)) -notmatch 'sk-kigaga-fake-test-only') 'Credential was written in plaintext.'
    $restored = Read-KgTunnelCredential -Path $path -TunnelId 'tunnel_test_one'
    Check ($restored.GetNetworkCredential().Password -eq 'sk-kigaga-fake-test-only-no-api-access') 'Credential did not survive reload.'
    $restored.Password.Dispose()
    Save-KgTunnelCredential -Path $path -TunnelId 'tunnel_test_one' -Secret $secret
    $restored = Read-KgTunnelCredential -Path $path -TunnelId 'tunnel_test_one'
    Check ($restored.GetNetworkCredential().Password -eq 'sk-kigaga-fake-test-only-no-api-access') 'Replacing a saved credential failed.'
    $restored.Password.Dispose()
    $before = [IO.File]::ReadAllText($path)
    $rejected = $false
    try { Save-KgTunnelCredential -Path $path -TunnelId 'tunnel_test_one' -Secret $wrong } catch { $rejected = $true }
    Check $rejected 'Admin key was accepted.'
    Check (([IO.File]::ReadAllText($path)) -eq $before) 'Invalid replacement overwrote the saved credential.'
    $rejected = $false
    try { Read-KgTunnelCredential -Path $path -TunnelId 'tunnel_test_two' | Out-Null } catch { $rejected = $true }
    Check $rejected 'Credential was reused for a different tunnel.'
    $acl = Get-Acl -LiteralPath $path
    Check $acl.AreAccessRulesProtected 'Credential file inherits broad permissions.'
    $sid = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value
    $unexpected = @($acl.Access | Where-Object { $_.IdentityReference.Translate([Security.Principal.SecurityIdentifier]).Value -notin @($sid,'S-1-5-18') })
    Check ($unexpected.Count -eq 0) 'Unexpected account can access credential file.'

    $lockPath = Join-Path $testRoot 'runtime.lock'
    $first = Open-KgRuntimeLock -Path $lockPath
    Check ($null -ne $first) 'First runtime could not acquire its lock.'
    $second = Open-KgRuntimeLock -Path $lockPath
    Check ($null -eq $second) 'Duplicate runtime was allowed.'
    $first.Dispose()
    $third = Open-KgRuntimeLock -Path $lockPath
    Check ($null -ne $third) 'Runtime could not restart after release.'
    $third.Dispose()

    $startup = Join-Path $testRoot 'Startup'
    [void][IO.Directory]::CreateDirectory($startup)
    $scriptPath = Join-Path $testRoot 'path with spaces\run-tunnel-background.ps1'
    [void][IO.Directory]::CreateDirectory((Split-Path -Parent $scriptPath))
    [IO.File]::WriteAllText($scriptPath, 'exit 0')
    Enable-KgTunnelStartup -StartupDirectory $startup -ScriptPath $scriptPath
    Enable-KgTunnelStartup -StartupDirectory $startup -ScriptPath $scriptPath
    $shortcutPath = Join-Path $startup 'KiGAGA Work Connection.lnk'
    $shell = New-Object -ComObject WScript.Shell
    $shortcut = $shell.CreateShortcut($shortcutPath)
    Check ($shortcut.Arguments.Contains('"' + $scriptPath + '"')) 'Startup path with spaces is not quoted.'
    Check ($shortcut.Arguments -match '-NonInteractive' -and $shortcut.Arguments -match '-WindowStyle Hidden') 'Startup can prompt or show a console.'
    Disable-KgTunnelStartup -StartupDirectory $startup -ScriptPath $scriptPath
    Check (-not (Test-Path -LiteralPath $shortcutPath)) 'Disabling startup failed.'
    $foreignShortcut = $shell.CreateShortcut($shortcutPath)
    $foreignShortcut.TargetPath = 'C:\Windows\System32\notepad.exe'
    $foreignShortcut.Arguments = 'unrelated'
    $foreignShortcut.Save()
    $rejected = $false
    try { Enable-KgTunnelStartup -StartupDirectory $startup -ScriptPath $scriptPath } catch { $rejected = $true }
    Check $rejected 'An unrelated startup entry was overwritten.'
    Check ($shell.CreateShortcut($shortcutPath).Arguments -eq 'unrelated') 'Startup conflict modified an existing entry.'

    $fakeExe = Join-Path $testRoot 'fake-tunnel.exe'
    Add-Type -OutputAssembly $fakeExe -OutputType ConsoleApplication -TypeDefinition @'
using System;
using System.IO;
using System.Diagnostics;
using System.Threading;
public class FakeTunnel {
    public static int Main(string[] args) {
        string db = Environment.GetEnvironmentVariable("KIGAGA_DB_PATH");
        string key = Environment.GetEnvironmentVariable("CONTROL_PLANE_API_KEY");
        if (args[0] == "admin") {
            if (key.EndsWith("denied")) {
                Console.Error.WriteLine("{\"error\":{\"status_code\":403}}"); return 1;
            }
            Console.WriteLine("{\"id\":\"tunnel_test_one\"}"); return 0;
        }
        if (args[0] == "leaf") { Thread.Sleep(300000); return 0; }
        var leaf = Process.Start(new ProcessStartInfo {
            FileName = System.Reflection.Assembly.GetExecutingAssembly().Location,
            Arguments = "leaf", UseShellExecute = false, CreateNoWindow = true
        });
        File.WriteAllText(db + ".observed", (key == "sk-kigaga-fake-test-only-no-api-access" ? "key-ok" : "key-bad") + "\n" + leaf.Id);
        Console.WriteLine(key); Console.Error.WriteLine(key);
        Thread.Sleep(300000); return 0;
    }
}
'@
    $settings = @{ Exe=$fakeExe; Root=$testRoot; Config=(Join-Path $testRoot 'fake config.yaml'); DbPath=(Join-Path $testRoot 'fake-db'); Proxy='http://127.0.0.1:1'; TunnelId='tunnel_test_one' }
    $credential = [Management.Automation.PSCredential]::new('tunnel_test_one',$secret)
    Check ((Test-KgTunnelAccess $settings $credential) -eq 'ok') 'Successful preflight was rejected.'
    $deniedSecret = ConvertTo-SecureString 'sk-fake-denied' -AsPlainText -Force
    $deniedCredential = [Management.Automation.PSCredential]::new('tunnel_test_one',$deniedSecret)
    Check ((Test-KgTunnelAccess $settings $deniedCredential) -eq 'http_403') 'Permission failure lost its status.'
    $deniedSecret.Dispose()
    $parentKeyBefore = $env:CONTROL_PLANE_API_KEY
    $child = Start-KgTunnelChild $settings $credential
    try {
        for ($wait = 0; $wait -lt 40 -and -not (Test-Path -LiteralPath ($settings.DbPath + '.observed')); $wait++) { Start-Sleep -Milliseconds 100 }
        $observed = [IO.File]::ReadAllLines($settings.DbPath + '.observed')
        Check ($observed[0] -eq 'key-ok') 'Child did not receive its key and database path.'
        Check ($env:CONTROL_PLANE_API_KEY -eq $parentKeyBefore) 'Parent environment was modified.'
        Check (-not $child.StartInfo.EnvironmentVariables.ContainsKey('CONTROL_PLANE_API_KEY')) 'Started process retained a plaintext key in its configuration.'
        $leafPid = [int]$observed[1]
        Stop-KgTunnelChild $child
        Check $child.HasExited 'Stopping the tunnel left it alive.'
        Check ($null -eq (Get-Process -Id $leafPid -ErrorAction SilentlyContinue)) 'Stopping the tunnel orphaned its MCP child.'
    } finally {
        if (-not $child.HasExited) { & (Join-Path $env:SystemRoot 'System32\taskkill.exe') /PID $child.Id /T /F *> $null }
        $child.Dispose()
    }

    $statusPath = Join-Path $testRoot 'status.json'
    Write-KgTunnelStatus -Path $statusPath -State 'setup_required'
    $status = Get-Content -LiteralPath $statusPath -Raw | ConvertFrom-Json
    Check ($status.state -eq 'setup_required' -and $null -ne $status.updated_at) 'Status is not readable.'
    Write-KgTunnelStatus -Path $statusPath -State 'ready' -ChildPid 123
    $status = Get-Content -LiteralPath $statusPath -Raw | ConvertFrom-Json
    Check ($status.state -eq 'ready' -and $status.child_pid -eq 123) 'Repeated status update failed.'
    # The checkout intentionally excludes private configs. Seed a disposable install
    # rather than depending on a user's tunnel, credentials, or source-tree path.
    $fixtureInstall = Join-Path $testRoot 'isolated-install\workflow'
    $fixtureScripts = Join-Path $fixtureInstall 'scripts'
    [void][IO.Directory]::CreateDirectory($fixtureScripts)
    [void][IO.Directory]::CreateDirectory((Join-Path $fixtureInstall 'src'))
    $fixtureExeDirectory = Join-Path $testRoot 'isolated-install\kigaga-workbench-v0.2'
    [void][IO.Directory]::CreateDirectory($fixtureExeDirectory)
    Copy-Item -LiteralPath $fakeExe -Destination (Join-Path $fixtureExeDirectory 'tunnel-client.exe')
    Copy-Item -LiteralPath $modulePath -Destination (Join-Path $fixtureScripts 'tunnel-runtime.psm1')
    $backgroundScript = Join-Path $fixtureScripts 'run-tunnel-background.ps1'
    Copy-Item -LiteralPath (Join-Path $PSScriptRoot '..\scripts\run-tunnel-background.ps1') -Destination $backgroundScript
    [IO.File]::WriteAllText((Join-Path $fixtureInstall 'src\server.mjs'), '// disposable test entry')
    $fixtureTunnelId = 'tunnel_' + ('0' * 32)
    $fixtureYaml = "http_proxy: 'http://127.0.0.1:1'`ntunnel_id: $fixtureTunnelId`nlisten_addr: 127.0.0.1:1`napi_key: env:CONTROL_PLANE_API_KEY`n"
    [IO.File]::WriteAllText((Join-Path $fixtureInstall 'tunnel-kigaga-v03.yaml'), $fixtureYaml)
    $fixtureConfig = @{ mcpServers = @{ 'kigaga-workflow-v03' = @{ env = @{ KIGAGA_DB_PATH = (Join-Path $testRoot 'fixture.db') } } } } | ConvertTo-Json -Depth 8
    [IO.File]::WriteAllText((Join-Path $fixtureInstall '.mcp.json'), $fixtureConfig)
    $background = New-Object Diagnostics.Process
    $background.StartInfo.FileName = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
    $background.StartInfo.Arguments = '-NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "' + $backgroundScript + '"'
    $background.StartInfo.UseShellExecute = $false
    $background.StartInfo.CreateNoWindow = $true
    $background.StartInfo.EnvironmentVariables['LOCALAPPDATA'] = Join-Path $testRoot 'empty-profile'
    try {
        [void]$background.Start()
        Check ($background.WaitForExit(10000)) 'Background startup prompted or hung without credentials.'
        Check ($background.ExitCode -eq 2) 'Missing credentials were not reported as setup required.'
        $missingStatus = Get-Content -LiteralPath (Join-Path $testRoot 'empty-profile\KiGAGA\work-connection\status.json') -Raw | ConvertFrom-Json
        Check ($missingStatus.state -eq 'setup_required') 'Missing credential status was not saved.'
    } finally {
        if (-not $background.HasExited) { $background.Kill(); $background.WaitForExit() }
        $background.Dispose()
    }
    Write-Output ('PASS: ' + $checks + ' tunnel runtime checks; fake credential only, no network calls.')
} finally {
    $secret.Dispose(); $wrong.Dispose()
    $resolved = [IO.Path]::GetFullPath($testRoot)
    $allowed = [IO.Path]::GetFullPath($ScratchRoot).TrimEnd('\') + '\'
    if ($resolved.StartsWith($allowed,[StringComparison]::OrdinalIgnoreCase) -and (Split-Path -Leaf $resolved).StartsWith('kigaga-tunnel-test-')) {
        Remove-Item -LiteralPath $resolved -Recurse -Force
    }
}
