$ErrorActionPreference = 'Stop'
Import-Module (Join-Path $PSScriptRoot 'tunnel-runtime.psm1') -Force -DisableNameChecking
$paths = Get-KgTunnelPaths
try {
    Disable-KgTunnelStartup $paths.Startup $paths.Background
    Stop-KgTunnelBackground $paths
    Write-Host '已关闭自动启动并停止本工具管理的隧道。加密凭据与项目数据保留。'
    Write-Host 'Codex 本地直连仍可使用。重新启用自动连接请运行 setup-work-connection.cmd。'
} catch {
    Write-Host '停止未完成，请检查是否存在其他手动启动的隧道窗口。' -ForegroundColor Red
    exit 1
}
