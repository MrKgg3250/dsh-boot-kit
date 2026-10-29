@echo off
setlocal enabledelayedexpansion
chcp 65001 >nul 2>nul

REM ============================================================================
REM  dsh-boot-kit 一键安装（Windows，双击即可）
REM  ---------------------------------------------------------------------------
REM  不需要会用终端：脚本自动找 DSH、自动判断 profile、自动下载安装。
REM
REM  安装内容由你自己选：
REM    Q（推荐）—— 启动动画 + 皮肤背景从第一帧开始（完整体验，不需要 npm）
REM    S        —— 只装皮肤同步（已有启动动画的话选这个）
REM
REM  安装的是 dsh-startup-screen（GitHub Release）和 dsh-skin-boot-sync
REM  （GitHub Release），都不经过 npm。只有 --tier full 的主题全家桶才需要
REM  npm 通道，见 README。
REM
REM  桌面端注意：安装前请**完全退出** DeepSeek Harness Desktop，
REM  装完再打开。（desktop profile 的 package.json 由桌面端进程锁管理）
REM ============================================================================

set "HOME_DIR=%DSH_HOME%"
if not defined HOME_DIR set "HOME_DIR=%USERPROFILE%\.dsh"

set "PLUGIN_URL=https://github.com/MrKgg3250/dsh-boot-kit/releases/download/v1.0.0/dsh-skin-boot-sync-1.0.0.tgz"
set "STARTUP_URL=https://github.com/6shenhonghong9/dsh-startup-screen/releases/download/v1.2.0/dsh-startup-screen-1.2.0.tgz"

echo.
echo ============================================================
echo   dsh-boot-kit 一键安装
echo ============================================================

REM --- 1/4 找 dsh 命令 ------------------------------------------------------
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

REM --- 2/4 检测 profile ------------------------------------------------------
set "PROFILES="
if exist "%HOME_DIR%\profiles\web\package.json"      set "PROFILES=web"
if exist "%HOME_DIR%\profiles\desktop\package.json"  set "PROFILES=!PROFILES! desktop"
if not defined PROFILES goto no_profile
echo   [2/4] 检测到 profile：!PROFILES!

REM --- 3/4 选安装内容 --------------------------------------------------------
echo.
choice /C QS /N /M "  [Q] 完整体验（启动动画+皮肤同步，推荐）  [S] 只装皮肤同步 : "
if errorlevel 2 (
  set "SPECS=!PLUGIN_URL!"
) else (
  set "SPECS=!STARTUP_URL! !PLUGIN_URL!"
)

REM --- 4/4 安装 -------------------------------------------------------------
echo.
for %%P in (!PROFILES!) do (
  echo   [3/4] 安装到 %%P profile ...
  call "!DSH_CMD!" plugin --profile %%P add !SPECS!
  if errorlevel 1 (
    echo         ^> %%P：安装失败，看上面的报错。
    echo           常见原因：desktop profile 需要桌面端完全退出后再装。
  ) else (
    echo         ^> %%P：完成
  )
)

echo.
echo ============================================================
echo   装完了
echo ============================================================
echo   **完全退出** DeepSeek Harness Desktop，再重新打开：
echo   启动时会播放动画（Q 模式），皮肤背景从第一帧开始。
echo.
echo   只装了皮肤同步（S）的话：效果在有启动动画时才看得见。
echo.
echo   说明 / 卸载 / macOS 命令：见仓库 README  https://github.com/MrKgg3250/dsh-boot-kit
echo.
pause
exit /b 0

REM ---------------------------------------------------------------------------

:try_dsh
if defined DSH_CMD exit /b 0
if exist "%~1\resources\runtime\cli\bin\dsh.cmd" set "DSH_CMD=%~1\resources\runtime\cli\bin\dsh.cmd"
exit /b 0

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
