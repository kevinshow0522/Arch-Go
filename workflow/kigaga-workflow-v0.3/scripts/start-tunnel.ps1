param([switch]$CheckFilesOnly)
$ErrorActionPreference = 'Stop'
Import-Module (Join-Path $PSScriptRoot 'tunnel-runtime.psm1') -Force -DisableNameChecking
$paths = Get-KgTunnelPaths
try {
    $settings = Get-KgTunnelSettings $paths.Root
    if ($CheckFilesOnly) {
        Write-Host '文件和配置检查通过。此检查不读取密钥、不启动连接。'
        exit 0
    }
    if (-not (Test-Path -LiteralPath $paths.Credential)) {
        $powershell = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
        $arguments = '-NoLogo -NoProfile -STA -ExecutionPolicy Bypass -WindowStyle Hidden -File "' + $paths.Setup + '"'
        Start-Process -FilePath $powershell -ArgumentList $arguments -WindowStyle Hidden | Out-Null
        Write-Host '首次连接需要在本机设置窗口保存已有运行密钥。'
        exit 0
    }
    Start-KgTunnelBackground $paths
    Write-Host '后台连接已启动。可以关闭本窗口；无需保持终端打开。'
    Write-Host '实际连接状态请运行 check-work-connection.cmd 查看。'
} catch {
    Write-Host '连接未启动。请检查本机安装文件、配置与权限。' -ForegroundColor Red
    exit 1
}