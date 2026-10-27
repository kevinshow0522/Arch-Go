Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
# Codex can inherit PowerShell 7 module paths. Use modules belonging to this host.
foreach ($standardModule in @('Microsoft.PowerShell.Security','Microsoft.PowerShell.Management','Microsoft.PowerShell.Utility')) {
    Import-Module (Join-Path $PSHOME ('Modules\' + $standardModule + '\' + $standardModule + '.psd1')) -Global -ErrorAction Stop
}

function Get-KgTunnelPaths {
    param([string]$Root = (Split-Path -Parent $PSScriptRoot))
    $state = Join-Path $env:LOCALAPPDATA 'KiGAGA\work-connection'
    return @{
        Root = $Root
        StateDirectory = $state
        Credential = (Join-Path $env:LOCALAPPDATA 'KiGAGA\credentials\tunnel-v03.clixml')
        Status = (Join-Path $state 'status.json')
        Lock = (Join-Path $state 'runtime.lock')
        Stop = (Join-Path $state 'stop.request')
        Background = (Join-Path $Root 'scripts\run-tunnel-background.ps1')
        Setup = (Join-Path $Root 'scripts\setup-work-connection.ps1')
        Startup = [Environment]::GetFolderPath('Startup')
    }
}

function Get-KgTunnelSettings {
    param([string]$Root)
    $config = Join-Path $Root 'tunnel-kigaga-v03.yaml'
    $exe = Join-Path (Split-Path -Parent $Root) 'kigaga-workbench-v0.2\tunnel-client.exe'
    foreach ($path in @($config, $exe, (Join-Path $Root 'src\server.mjs'))) {
        if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { throw 'INSTALLATION_INCOMPLETE' }
    }
    $yaml = [IO.File]::ReadAllText($config)
    $id = [regex]::Match($yaml, '(?m)^\s*tunnel_id:\s*["'']?(tunnel_[a-f0-9]{32})["'']?\s*$').Groups[1].Value
    $proxy = [regex]::Match($yaml, '(?m)^http_proxy:\s*["''](http://127\.0\.0\.1:\d+)["'']\s*$').Groups[1].Value
    $listen = [regex]::Match($yaml, '(?m)^\s*listen_addr:\s*["'']?(127\.0\.0\.1:\d+)["'']?\s*$').Groups[1].Value
    if (-not $id -or -not $proxy -or -not $listen -or $yaml -notmatch 'api_key:\s*["'']?env:CONTROL_PLANE_API_KEY["'']?') { throw 'INVALID_TUNNEL_CONFIG' }
    $local = Get-Content -LiteralPath (Join-Path $Root '.mcp.json') -Raw -Encoding UTF8 | ConvertFrom-Json
    $db = $local.mcpServers.'kigaga-workflow-v03'.env.KIGAGA_DB_PATH
    if (-not $db -or -not [IO.Path]::IsPathRooted($db)) { throw 'INVALID_DATABASE_PATH' }
    return @{ Exe=$exe; Config=$config; TunnelId=$id; Proxy=$proxy; HealthUrl=('http://' + $listen); DbPath=$db; Root=$Root }
}

function Test-KgRuntimeSecret {
    param([Security.SecureString]$Secret)
    if ($null -eq $Secret -or $Secret.Length -eq 0) { return $false }
    $plain = ([Net.NetworkCredential]::new('', $Secret)).Password
    try { return ($plain.StartsWith('sk-') -and -not $plain.StartsWith('sk-admin-') -and $plain -notmatch '\s') }
    finally { $plain = $null }
}

function Protect-KgCredentialPath {
    param([string]$Path, [switch]$Directory)
    $sid = [Security.Principal.WindowsIdentity]::GetCurrent().User
    $system = [Security.Principal.SecurityIdentifier]::new('S-1-5-18')
    if ($Directory) { $acl = New-Object Security.AccessControl.DirectorySecurity }
    else { $acl = New-Object Security.AccessControl.FileSecurity }
    $acl.SetOwner($sid)
    $acl.SetAccessRuleProtection($true, $false)
    foreach ($identity in @($sid, $system)) {
        if ($Directory) {
            $rule = [Security.AccessControl.FileSystemAccessRule]::new($identity, 'FullControl', 'ContainerInherit,ObjectInherit', 'None', 'Allow')
        } else {
            $rule = [Security.AccessControl.FileSystemAccessRule]::new($identity, 'FullControl', 'Allow')
        }
        [void]$acl.AddAccessRule($rule)
    }
    # Persist only the owner and access rules changed above; do not request SACL privileges.
    if ($Directory) { ([IO.DirectoryInfo]::new($Path)).SetAccessControl($acl) }
    else { ([IO.FileInfo]::new($Path)).SetAccessControl($acl) }
}

function Save-KgTunnelCredential {
    param([string]$Path, [string]$TunnelId, [Security.SecureString]$Secret)
    if (-not (Test-KgRuntimeSecret $Secret)) { throw 'INVALID_RUNTIME_KEY' }
    if (-not [IO.Path]::IsPathRooted($Path)) { throw 'CREDENTIAL_PATH_MUST_BE_ABSOLUTE' }
    $directory = Split-Path -Parent $Path
    [void][IO.Directory]::CreateDirectory($directory)
    Protect-KgCredentialPath -Path $directory -Directory
    $temporary = Join-Path $directory ([guid]::NewGuid().ToString('N') + '.tmp')
    try {
        $credential = [Management.Automation.PSCredential]::new($TunnelId, $Secret)
        $credential | Export-Clixml -LiteralPath $temporary -Encoding UTF8
        Protect-KgCredentialPath -Path $temporary
        # Windows PowerShell 5.1 converts $null to an empty string for this overload.
        if ([IO.File]::Exists($Path)) { [IO.File]::Replace($temporary, $Path, [Management.Automation.Language.NullString]::Value) }
        else { [IO.File]::Move($temporary, $Path) }
        Protect-KgCredentialPath -Path $Path
    } finally {
        if ([IO.File]::Exists($temporary)) { [IO.File]::Delete($temporary) }
    }
}

function Read-KgTunnelCredential {
    param([string]$Path, [string]$TunnelId)
    try { $credential = Import-Clixml -LiteralPath $Path }
    catch { throw 'CREDENTIAL_UNAVAILABLE_FOR_THIS_WINDOWS_ACCOUNT' }
    if ($credential -isnot [Management.Automation.PSCredential] -or $credential.UserName -ne $TunnelId) { throw 'CREDENTIAL_TUNNEL_MISMATCH' }
    if (-not (Test-KgRuntimeSecret $credential.Password)) { $credential.Password.Dispose(); throw 'INVALID_RUNTIME_KEY' }
    return $credential
}

function Open-KgRuntimeLock {
    param([string]$Path)
    [void][IO.Directory]::CreateDirectory((Split-Path -Parent $Path))
    try { return [IO.File]::Open($Path, 'OpenOrCreate', 'ReadWrite', 'None') }
    catch [IO.IOException] { return $null }
}

function Write-KgTunnelStatus {
    param([string]$Path, [string]$State, [int]$ChildPid = 0)
    [void][IO.Directory]::CreateDirectory((Split-Path -Parent $Path))
    $body = @{state=$State;updated_at=[DateTime]::UtcNow.ToString('o');supervisor_pid=$PID;child_pid=$ChildPid} | ConvertTo-Json -Compress
    $temporary = $Path + '.' + $PID + '.tmp'
    [IO.File]::WriteAllText($temporary, $body, [Text.UTF8Encoding]::new($false))
    if ([IO.File]::Exists($Path)) { [IO.File]::Replace($temporary,$Path,[Management.Automation.Language.NullString]::Value) }
    else { [IO.File]::Move($temporary,$Path) }
}

function Get-KgTunnelHealth {
    param([string]$HealthUrl)
    try {
        $response = Invoke-WebRequest -UseBasicParsing -Uri ($HealthUrl + '/readyz') -TimeoutSec 2
        if ($response.StatusCode -eq 200) { return 'ready' }
    } catch {}
    try {
        $response = Invoke-WebRequest -UseBasicParsing -Uri ($HealthUrl + '/healthz') -TimeoutSec 2
        if ($response.StatusCode -eq 200) { return 'connecting' }
    } catch {}
    return 'offline'
}

function New-KgTunnelProcessInfo {
    param([hashtable]$Settings, [Management.Automation.PSCredential]$Credential, [string]$Arguments)
    $info = New-Object Diagnostics.ProcessStartInfo
    $info.FileName = $Settings.Exe
    $info.Arguments = $Arguments
    $info.WorkingDirectory = $Settings.Root
    $info.UseShellExecute = $false
    $info.CreateNoWindow = $true
    $info.RedirectStandardOutput = $true
    $info.RedirectStandardError = $true
    $info.EnvironmentVariables['CONTROL_PLANE_API_KEY'] = $Credential.GetNetworkCredential().Password
    $info.EnvironmentVariables['CONTROL_PLANE_BASE_URL'] = 'https://api.openai.com'
    foreach ($name in @('OPENAI_ADMIN_KEY','OPENAI_API_KEY','CONTROL_PLANE_URL_PATH')) { $info.EnvironmentVariables.Remove($name) }
    $info.EnvironmentVariables['HTTPS_PROXY'] = $Settings.Proxy
    $info.EnvironmentVariables['HTTP_PROXY'] = $Settings.Proxy
    $info.EnvironmentVariables['NO_PROXY'] = 'localhost,127.0.0.1'
    $info.EnvironmentVariables['KIGAGA_DB_PATH'] = $Settings.DbPath
    return $info
}

function Test-KgTunnelAccess {
    param([hashtable]$Settings, [Management.Automation.PSCredential]$Credential)
    $process = New-Object Diagnostics.Process
    $process.StartInfo = New-KgTunnelProcessInfo $Settings $Credential ('admin --json tunnels get ' + $Settings.TunnelId)
    try {
        [void]$process.Start()
        $process.StartInfo.EnvironmentVariables.Remove('CONTROL_PLANE_API_KEY')
        $output = $process.StandardOutput.ReadToEndAsync()
        $errors = $process.StandardError.ReadToEndAsync()
        if (-not $process.WaitForExit(30000)) { $process.Kill(); $process.WaitForExit(); return 'timeout' }
        if ($process.ExitCode -eq 0) { return 'ok' }
        $raw = $output.Result + $errors.Result
        try {
            $failure = $raw | ConvertFrom-Json
            $code = [int]$failure.error.status_code
            if ($code -in @(401,403,404)) { return ('http_' + $code) }
        } catch {}
        return 'connection_failed'
    } catch { return 'connection_failed' }
    finally { $raw = $null; $process.Dispose() }
}

function Start-KgTunnelChild {
    param([hashtable]$Settings, [Management.Automation.PSCredential]$Credential)
    # Drain logs without persisting payloads or credentials, and without an unbounded buffer.
    if (-not ('KiGaga.TunnelProcess' -as [type])) {
        Add-Type -TypeDefinition @'
using System.Diagnostics;
namespace KiGaga {
    public static class TunnelProcess {
        public static Process Start(ProcessStartInfo info) {
            Process p = new Process();
            p.StartInfo = info;
            p.OutputDataReceived += (sender, args) => {};
            p.ErrorDataReceived += (sender, args) => {};
            p.Start();
            info.EnvironmentVariables.Remove("CONTROL_PLANE_API_KEY");
            p.BeginOutputReadLine();
            p.BeginErrorReadLine();
            return p;
        }
    }
}
'@
    }
    $arguments = 'run --config "' + $Settings.Config + '" --log.http-raw-unsafe=false'
    $info = New-KgTunnelProcessInfo $Settings $Credential $arguments
    return [KiGaga.TunnelProcess]::Start($info)
}

function Stop-KgTunnelChild {
    param([Diagnostics.Process]$Process)
    if ($Process.HasExited) { return }
    # Only terminate the tree owned by this live Process handle, including its MCP children.
    & (Join-Path $env:SystemRoot 'System32\taskkill.exe') /PID $Process.Id /T /F *> $null
    if (-not $Process.WaitForExit(5000)) { throw 'TUNNEL_STOP_TIMEOUT' }
}

function Enable-KgTunnelStartup {
    param([string]$StartupDirectory, [string]$ScriptPath)
    if (-not (Test-Path -LiteralPath $ScriptPath -PathType Leaf)) { throw 'STARTUP_SCRIPT_MISSING' }
    [void][IO.Directory]::CreateDirectory($StartupDirectory)
    $path = Join-Path $StartupDirectory 'KiGAGA Work Connection.lnk'
    $shell = New-Object -ComObject WScript.Shell
    $shortcut = $shell.CreateShortcut($path)
    $arguments = '-NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -WindowStyle Hidden -File "' + $ScriptPath + '"'
    if ((Test-Path -LiteralPath $path) -and $shortcut.Arguments -ne $arguments) { throw 'EXISTING_STARTUP_ENTRY_DIFFERS' }
    $shortcut.TargetPath = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
    $shortcut.Arguments = $arguments
    $shortcut.WorkingDirectory = Split-Path -Parent $ScriptPath
    $shortcut.WindowStyle = 7
    $shortcut.Description = 'KiGAGA Work connection - start after Windows sign-in'
    $shortcut.Save()
}

function Disable-KgTunnelStartup {
    param([string]$StartupDirectory, [string]$ScriptPath)
    $path = Join-Path $StartupDirectory 'KiGAGA Work Connection.lnk'
    if (-not (Test-Path -LiteralPath $path)) { return }
    $shell = New-Object -ComObject WScript.Shell
    $shortcut = $shell.CreateShortcut($path)
    $arguments = '-NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -WindowStyle Hidden -File "' + $ScriptPath + '"'
    if ($shortcut.Arguments -ne $arguments) { throw 'EXISTING_STARTUP_ENTRY_DIFFERS' }
    [IO.File]::Delete($path)
}

function Start-KgTunnelBackground {
    param([hashtable]$Paths)
    [void][IO.Directory]::CreateDirectory($Paths.StateDirectory)
    if (Test-Path -LiteralPath $Paths.Stop) { [IO.File]::Delete($Paths.Stop) }
    $powershell = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
    $arguments = '-NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -WindowStyle Hidden -File "' + $Paths.Background + '"'
    Start-Process -FilePath $powershell -ArgumentList $arguments -WindowStyle Hidden | Out-Null
}

function Stop-KgTunnelBackground {
    param([hashtable]$Paths)
    [void][IO.Directory]::CreateDirectory($Paths.StateDirectory)
    [IO.File]::WriteAllText($Paths.Stop, 'stop', [Text.Encoding]::ASCII)
    for ($attempt = 0; $attempt -lt 80; $attempt++) {
        $lock = Open-KgRuntimeLock $Paths.Lock
        if ($null -ne $lock) { $lock.Dispose(); return }
        Start-Sleep -Milliseconds 250
    }
    throw 'BACKGROUND_STOP_TIMEOUT'
}

Export-ModuleMember -Function *-Kg*
