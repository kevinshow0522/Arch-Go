$ErrorActionPreference = 'Stop'
Import-Module (Join-Path $PSScriptRoot 'tunnel-runtime.psm1') -Force -DisableNameChecking
$paths = Get-KgTunnelPaths
try {
    $settings = Get-KgTunnelSettings $paths.Root
    $saved = Test-Path -LiteralPath $paths.Credential
    $startup = Test-Path -LiteralPath (Join-Path $paths.Startup 'KiGAGA Work Connection.lnk')
    Write-Host 'KiGAGA · GPT Work 连接状态' -ForegroundColor Cyan
    Write-Host ('已保存加密凭据：' + $saved)
    Write-Host ('登录 Windows 自动启动：' + $startup)
    $health = Get-KgTunnelHealth $settings.HealthUrl
    switch ($health) {
        'ready' { Write-Host '隧道已就绪。请在 GPT Work 中选择已有 KiGAGA 插件并检查项目服务。' -ForegroundColor Green }
        'connecting' { Write-Host '后台服务已启动，正在连接。请确认代理和网络可用。' -ForegroundColor Yellow }
        default {
            if (-not $saved) { Write-Host '尚未首次配置。请双击 setup-work-connection.cmd。' -ForegroundColor Yellow }
            else {
                Write-Host '隧道当前未就绪。可双击 start-tunnel-windows.cmd 启动或重试。' -ForegroundColor Yellow
                if (Test-Path -LiteralPath $paths.Status) {
                    $status = Get-Content -LiteralPath $paths.Status -Raw | ConvertFrom-Json
                    Write-Host ('最近状态：' + $status.state + '；记录时间：' + $status.updated_at)
                }
            }
        }
    }
    Write-Host 'Codex 本地直连独立可用，不依赖此隧道。'
} catch {
    Write-Host '无法读取连接状态，请检查安装文件和本机权限。' -ForegroundColor Red
    exit 1
}
