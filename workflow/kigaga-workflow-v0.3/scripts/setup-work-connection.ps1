$ErrorActionPreference = 'Stop'
Import-Module (Join-Path $PSScriptRoot 'tunnel-runtime.psm1') -Force -DisableNameChecking
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
[Windows.Forms.Application]::EnableVisualStyles()
$paths = Get-KgTunnelPaths
try { $settings = Get-KgTunnelSettings $paths.Root }
catch {
    [void][Windows.Forms.MessageBox]::Show('安装文件或连接配置不完整，请在 Codex 中检查 KiGAGA 工作流。', 'KiGAGA 连接设置')
    exit 1
}
$form = New-Object Windows.Forms.Form
$form.Text = 'KiGAGA · GPT Work 连接'
$form.Size = New-Object Drawing.Size(620,420)
$form.StartPosition = 'CenterScreen'
$form.FormBorderStyle = 'FixedDialog'
$form.MaximizeBox = $false
$form.Font = New-Object Drawing.Font('Microsoft YaHei UI',10)
$title = New-Object Windows.Forms.Label
$title.Text = '首次设置一次，以后登录 Windows 自动连接'
$title.SetBounds(24,22,560,30)
$form.Controls.Add($title)
$intro = New-Object Windows.Forms.Label
$intro.Text = '请在此输入已有的隧道运行密钥，不要发到聊天里。' + [Environment]::NewLine + '密钥由 Windows 加密保存，绑定当前账户和电脑。'
$intro.SetBounds(24,65,560,58)
$form.Controls.Add($intro)
$keyLabel = New-Object Windows.Forms.Label
$keyLabel.Text = '运行密钥（sk- 开头，不是 Admin key 或 tunnel_ 编号）'
$keyLabel.SetBounds(24,132,565,28)
$form.Controls.Add($keyLabel)
$keyBox = New-Object Windows.Forms.TextBox
$keyBox.UseSystemPasswordChar = $true
$keyBox.SetBounds(24,164,556,30)
$form.Controls.Add($keyBox)
$auto = New-Object Windows.Forms.CheckBox
$auto.Text = '登录 Windows 后自动在后台连接'
$auto.Checked = $true
$auto.SetBounds(24,210,540,28)
$form.Controls.Add($auto)
$state = New-Object Windows.Forms.Label
$state.Text = '保存位置：当前 Windows 用户的 KiGAGA 加密凭据目录。'
$state.SetBounds(24,249,560,58)
$form.Controls.Add($state)
if (Test-Path -LiteralPath $paths.Credential) { $state.Text = '已有加密凭据。密钥留空可沿用，填写新值可更换。' }
$save = New-Object Windows.Forms.Button
$save.Text = '保存并连接'
$save.SetBounds(300,324,150,36)
$form.Controls.Add($save)
$close = New-Object Windows.Forms.Button
$close.Text = '关闭'
$close.SetBounds(466,324,114,36)
$close.Add_Click({ $form.Close() })
$form.Controls.Add($close)
$form.AcceptButton = $save
$save.Add_Click({
    $secret = $null
    $credential = $null
    $save.Enabled = $false
    try {
        if ([string]::IsNullOrWhiteSpace($keyBox.Text)) {
            if (-not (Test-Path -LiteralPath $paths.Credential)) { throw '请先输入已有的隧道运行密钥。' }
            $credential = Read-KgTunnelCredential $paths.Credential $settings.TunnelId
            $secret = $credential.Password
        } else {
            $secret = ConvertTo-SecureString ($keyBox.Text.Trim()) -AsPlainText -Force
            $keyBox.Clear()
            if (-not (Test-KgRuntimeSecret $secret)) { throw '请输入完整运行密钥，不要使用 Admin key 或隧道编号。' }
            $credential = [Management.Automation.PSCredential]::new($settings.TunnelId,$secret)
        }
        $state.Text = '正在核对隧道访问权限，最多等待 30 秒……'
        $state.ForeColor = [Drawing.Color]::DimGray
        $state.Refresh()
        $access = Test-KgTunnelAccess $settings $credential
        switch ($access) {
            'ok' {}
            'http_401' { throw '密钥验证失败（401）。请核对已有运行密钥，再重新输入。' }
            'http_403' { throw '访问被拒绝（403）。请核对密钥所属组织及 Tunnels Read + Use 权限。' }
            'http_404' { throw '隧道不可访问（404）。请核对隧道所属组织与现有配置。' }
            default { throw '暂时无法连接。请先启动代理并检查网络，再重新保存。' }
        }
        Save-KgTunnelCredential $paths.Credential $settings.TunnelId $secret
        if ($auto.Checked) { Enable-KgTunnelStartup $paths.Startup $paths.Background }
        else { Disable-KgTunnelStartup $paths.Startup $paths.Background }
        Stop-KgTunnelBackground $paths
        Start-KgTunnelBackground $paths
        $state.ForeColor = [Drawing.Color]::DarkGreen
        $state.Text = '凭据已加密保存，后台连接已启动。' + [Environment]::NewLine + '可关闭此窗口；连接状态可用“检查 Work 连接”查看。'
    } catch {
        $state.ForeColor = [Drawing.Color]::Firebrick
        if ($_.Exception.Message -match '[\u4e00-\u9fff]') { $state.Text = $_.Exception.Message }
        else { $state.Text = '设置未完成。请检查本机文件权限或联系 Codex 排查。错误代码：' + $_.Exception.GetType().Name }
    } finally {
        $keyBox.Clear()
        if ($null -ne $secret) { $secret.Dispose() }
        $save.Enabled = $true
    }
})
[void]$form.ShowDialog()
$form.Dispose()
