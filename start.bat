@echo off
chcp 65001 >nul
echo.
echo ====================================
echo   AI图像管理系统 启动脚本
echo   百度AI开放平台驱动
echo ====================================
echo.

cd /d "%~dp0backend"

:: 检查 .env 文件
if not exist ".env" (
    echo [警告] 未找到 .env 配置文件
    echo 正在从模板创建...
    copy ".env.example" ".env" >nul
    echo.
    echo [重要] 请编辑 backend\.env 文件，填入您的百度AI API Key 和 Secret Key
    echo 文件路径: %~dp0backend\.env
    echo.
    pause
)

:: 检查 node_modules
if not exist "node_modules" (
    echo [信息] 首次运行，正在安装依赖（约1-2分钟）...
    call npm install
    echo.
)

echo [信息] 启动后端服务...
echo [信息] 后端地址: http://localhost:3001
echo [信息] 前端界面: 请直接打开 frontend\index.html
echo.
echo 按 Ctrl+C 停止服务
echo.

node server.js

pause
