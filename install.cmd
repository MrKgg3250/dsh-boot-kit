@echo off
setlocal enabledelayedexpansion
chcp 65001 >nul 2>nul

REM ============================================================================
REM  dsh-boot-kit 本地一键安装（Windows，双击即可）
REM  ---------------------------------------------------------------------------
REM  全程不联网（除非选 T：主题全家桶 @linxin666/dsh-web-all 来自 npm，
REM  国内通常已配 npmmirror 镜像）。
REM
REM  使用方式：把 install.cmd 和 local\ 文件夹一起拷到任何机器，双击本文件。
REM
REM    Q（推荐）—— 启动动画 + 皮肤背景从第一帧开始（完全本地）
REM    T         —— Q + 主题全家桶 + 关掉右下角宠物（需要 npm registry）
REM    S         —— 只装皮肤同步（已有启动动画的话选这个）
REM
REM  桌面端注意：安装前请**完全退出** DeepSeek Harness Desktop，
REM  装完再打开。（desktop profile 的 package.json 由桌面端进程锁管理）
REM ============================================================================

set "HERE=%~dp0"
if "%HERE:~-1%"=="\" set "HERE=%HERE:~0,-1%"
set "HOME_DIR=%DSH_HOME%"
if not defined HOME_DIR set "HOME_DIR=%USERPROFILE%\.dsh"

REM local\ 里的包用通配符找：版本号升级后不用改本脚本。
REM 注意 cmd 的坑：通配符不匹配时 for 会返回字面量，必须 if exist 过滤。
set "PLUGIN_TGZ="
for %%F in ("!HERE!\local\dsh-skin-boot-sync-*.tgz") do if exist "%%~fF" set "PLUGIN_TGZ=%%~fF"
set "STARTUP_TGZ="
for %%F in ("!HERE!\local\dsh-startup-screen-*.tgz") do if exist "%%~fF" set "STARTUP_TGZ=%%~fF"
if not defined PLUGIN_TGZ goto no_local

echo.
echo ============================================================
echo   dsh-boot-kit 本地安装
echo ============================================================
if defined STARTUP_TGZ (
  echo   本地包：启动动画 + 皮肤同步（不需要联网）
) else (
  echo   本地包：皮肤同步（local\ 里没有启动动画包，只装同步）
)

REM --- 找 dsh 命令 -----------------------------------------------------------
set "DSH_CMD="
where dsh >nul 2>nul
if not errorlevel 1 (
  set "DSH_CMD=dsh"
  goto dsh_found
)

REM 桌面端用户通常没有全局 dsh：从正在运行的进程路径反推安装目录
for /f "delims=" %%P in ('powershell -NoProfile -Command "if ($p = Get-Process 'DeepSeek Harness' -ErrorAction SilentlyContinue) { Split-Path -Parent $p.Path }" 2^>nul') do (
  call :try_dsh "%%P"
)
if defined DSH_CMD goto dsh_found

REM 常见安装位置（装了但没在跑也能找到）
call :try_dsh "%ProgramFiles%\DeepSeek Harness"
call :try_dsh "%LocalAppData%\Programs\DeepSeek Harness"
call :try_dsh "D:\A_Install\dsh"
if not defined DSH_CMD goto no_dsh
:dsh_found
echo   [1/4] 找到 dsh：!DSH_CMD!

REM --- 检测 profile ----------------------------------------------------------
set "PROFILES="
if exist "%HOME_DIR%\profiles\web\package.json"      set "PROFILES=web"
if exist "%HOME_DIR%\profiles\desktop\package.json"  set "PROFILES=!PROFILES! desktop"
if not defined PROFILES goto no_profile
echo   [2/4] 检测到 profile：!PROFILES!

REM --- 安装前清理旧的 URL 依赖（放在选模式之前，Q/S/T 都要过这一步）---
REM 旧版 install.cmd（Release v1.0.0 附件那份）把包名装成了 GitHub URL；只要
REM package.json 里留着这种 spec，以后每次 pnpm 操作都会去 HEAD 那些地址，
REM GitHub 一抖就是 ECONNRESET/ETIMEDOUT 重试循环。先删掉再装本地包，旧机器自愈。
for %%P in (!PROFILES!) do call :cleanup_urls %%P

REM --- 选模式 ----------------------------------------------------------------
echo.
choice /C QTS /N /M "  [Q] 启动动画+皮肤同步（推荐，离线）  [T] 全套含主题（需 npm）  [S] 只装皮肤同步 : "
if errorlevel 3 goto opt_small
if errorlevel 2 goto opt_full

REM Q：两个本地包一次装完
set "SPECS="!PLUGIN_TGZ!""
if defined STARTUP_TGZ set "SPECS="!STARTUP_TGZ!" "!PLUGIN_TGZ!""
goto do_install

:opt_small
set "SPECS="!PLUGIN_TGZ!""
goto do_install

:opt_full
REM T：web-all 带原生构建依赖（ssh2/cloudflared），pnpm 11 默认拒绝这些脚本，
REM 不补配置安装会直接失败；顺带关掉它带的右下角宠物。
echo   [3/4] 准备 profile（pnpm 配置 + 关掉宠物）...
for %%P in (!PROFILES!) do (
  powershell -NoProfile -Command "$f='%HOME_DIR%\profiles\%%P\pnpm-workspace.yaml'; if (Test-Path $f) { $t=[IO.File]::ReadAllText($f); if ($t -notmatch 'strictDepBuilds') { $nl=[Environment]::NewLine; [IO.File]::WriteAllText($f, $t + $nl + 'strictDepBuilds: false' + $nl) } } else { $nl=[Environment]::NewLine; Set-Content -Path $f -Value ('packages:' + $nl + '  - .' + $nl + 'strictDepBuilds: false' + $nl) -Encoding ascii }"
  powershell -NoProfile -Command "$f='%HOME_DIR%\profiles\%%P\cordis.patch.yml'; $row='- id: web-ui-pet'; if (Test-Path $f) { $t=[IO.File]::ReadAllText($f); if ($t -notmatch '(?m)^- id: web-ui-pet') { $nl=[Environment]::NewLine; [IO.File]::WriteAllText($f, $t + $nl + '# Disabled by dsh-boot-kit (delete these two lines to restore).' + $nl + $row + $nl + '  disabled: true' + $nl) } } else { $nl=[Environment]::NewLine; Set-Content -Path $f -Value ($row + $nl + '  disabled: true' + $nl) -Encoding ascii }"
)
set "SPECS="!PLUGIN_TGZ!""
if defined STARTUP_TGZ set "SPECS="!STARTUP_TGZ!" "!PLUGIN_TGZ!""
set "SPECS=!SPECS! @linxin666/dsh-web-all"

REM --- 安装 ------------------------------------------------------------------
:do_install
echo.
for %%P in (!PROFILES!) do (
  echo   [4/4] 安装到 %%P profile ...
  call "!DSH_CMD!" plugin --profile %%P add !SPECS!
  if errorlevel 1 (
    echo         ^> %%P：安装失败，看上面的报错。
    echo           desktop profile 需要桌面端**完全退出**后再装。
    echo           T 模式还需要能访问 npm registry（国内配 npmmirror 镜像）。
  ) else (
    echo         ^> %%P：完成
  )
)

echo.
echo ============================================================
echo   装完了
echo ============================================================
echo   **完全退出** DeepSeek Harness Desktop，再重新打开。
echo   Q/T 模式：启动时播放动画，皮肤背景从第一帧开始。
echo   T 模式：设置里多出皮肤中心 / 主题全家桶；右下角宠物如需关闭，
echo           在插件面板里关（本脚本已默认写好禁用行）。
echo.
echo   说明 / 卸载：见仓库 README  https://github.com/MrKgg3250/dsh-boot-kit
echo.
pause
exit /b 0

REM ---------------------------------------------------------------------------
:try_dsh
if defined DSH_CMD exit /b 0
if exist "%~1\resources\runtime\cli\bin\dsh.cmd" set "DSH_CMD=%~1\resources\runtime\cli\bin\dsh.cmd"
exit /b 0

:cleanup_urls
powershell -NoProfile -Command "$f='%HOME_DIR%\profiles\%~1\package.json'; if (-not (Test-Path $f)) { exit 1 }; $t=[IO.File]::ReadAllText($f); if ($t -match 'github\.com/(MrKgg3250|6shenhonghong9)') { exit 0 } else { exit 1 }"
if errorlevel 1 exit /b 0
echo   清理旧版安装器留下的网络依赖（%~1）...
call "!DSH_CMD!" plugin --profile %~1 remove dsh-skin-boot-sync dsh-startup-screen
exit /b 0

:no_local
echo   [x] 在 "!HERE!\local" 里没找到 dsh-skin-boot-sync 的安装包。
echo.
echo       请把 install.cmd 和 local\ 文件夹**一起**拷贝（两者要同级），
echo       或直接拷贝整个仓库文件夹后再双击。
echo.
pause
exit /b 1

:no_dsh
echo   [x] 没找到 DSH（dsh 命令或桌面端安装目录）。
echo.
echo       桌面端用户：先安装并打开一次 DeepSeek Harness Desktop，再重新双击本文件。
echo       网页版用户：先安装全局 dsh（npm i -g @deepseek-ai/dsh）。
echo.
pause
exit /b 1

:no_profile
echo   [x] 没有检测到已初始化的 profile。
echo.
echo       桌面端用户：先打开一次 DeepSeek Harness Desktop，然后完全退出，再重新双击本文件。
echo       网页版用户：先跑一次 dsh web。
echo.
pause
exit /b 1
