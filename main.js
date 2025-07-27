const { app, BrowserWindow, session, protocol } = require('electron');
const path = require('path');
const http = require('http');
const fs = require('fs');
const url = require('url');

function checkPort(port) {
    return new Promise((resolve) => {
        const server = http.createServer();
        server.once('error', () => {
            resolve(false);
        });
        server.once('listening', () => {
            server.close();
            resolve(true);
        });
        server.listen(port);
    });
}

async function findFirstAvailablePort(startPort) {
    let port = startPort;
    const MAX_PORTS_TO_CHECK = 10;
    
    for (let i = 0; i < MAX_PORTS_TO_CHECK; i++) {
        const isAvailable = await checkPort(port + i);
        if (isAvailable) {
            return port + i;
        }
    }
    
    // 如果没有可用端口，返回默认端口并打印警告
    console.warn(`未找到可用端口，尝试使用默认端口 ${startPort}`);
    return startPort;
}

async function createWindow() {
    // 禁用证书验证
    app.commandLine.appendSwitch('ignore-certificate-errors');
    
    // 添加localStorage权限支持
    app.commandLine.appendSwitch('enable-features', 'StorageAPI');
    app.commandLine.appendSwitch('disable-web-security');
    app.commandLine.appendSwitch('allow-file-access-from-files');
    app.commandLine.appendSwitch('allow-running-insecure-content');

    const mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
            webSecurity: false, // 允许跨域请求和file://协议加载
            allowRunningInsecureContent: true,
            preload: path.join(__dirname, 'preload.js'),
            // 添加localStorage支持
            partition: 'persist:emby-player',
            // 确保localStorage可用
            additionalArguments: ['--enable-features=StorageAPI']
        }
    });

    // 配置更宽松的 CSP 以解决加载问题
    session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
        callback({
            responseHeaders: {
                ...details.responseHeaders,
                'Content-Security-Policy': ["default-src * 'self' 'unsafe-inline' 'unsafe-eval' data: blob: file:"]
            }
        });
    });

    // 记录当前环境和应用路径信息以便调试
    console.log('当前环境:', process.env.NODE_ENV);
    console.log('应用路径:', __dirname);
    console.log('是否为打包环境:', app.isPackaged);

    // 开发环境下加载本地服务
    if (process.env.NODE_ENV === 'development') {
        // 尝试扩展可能的端口范围
        const possiblePorts = [5173, 5174, 5175, 5176, 5177, 51747, 52226, 3000, 8080];
        let loaded = false;
        
        // 打印当前尝试加载的URL信息
        console.log('开发环境: 尝试连接到Vite开发服务器...');
        console.log(`NODE_ENV=${process.env.NODE_ENV}`);
        
        for (const port of possiblePorts) {
            try {
                const url = `http://localhost:${port}`;
                console.log(`尝试加载 URL: ${url}`);
                await mainWindow.loadURL(url);
                loaded = true;
                console.log(`成功加载 URL: ${url}`);
                break;
            } catch (err) {
                console.log(`无法加载端口 ${port}:`, err.message);
            }
        }
        
        if (!loaded) {
            console.error('无法连接到开发服务器，请确保 Vite 正在运行');
            console.error('尝试手动指定端口...');
            
            // 尝试查找运行中的 Vite 端口
            try {
                const { execSync } = require('child_process');
                const output = execSync('lsof -i | grep node | grep LISTEN').toString();
                console.log('当前运行的node服务:', output);
                
                // 尝试提取端口
                const portMatch = output.match(/localhost:(\d+)/);
                if (portMatch && portMatch[1]) {
                    const detectedPort = portMatch[1];
                    console.log(`检测到可能的Vite端口: ${detectedPort}`);
                    try {
                        const url = `http://localhost:${detectedPort}`;
                        await mainWindow.loadURL(url);
                        console.log(`成功加载 URL: ${url}`);
                        loaded = true;
                    } catch (err) {
                        console.log(`无法加载检测到的端口 ${detectedPort}:`, err.message);
                    }
                }
            } catch (err) {
                console.error('端口自动检测失败:', err.message);
            }
            
            if (!loaded) {
                mainWindow.webContents.loadFile(path.join(__dirname, 'error.html'));
            }
        }
        
        // 打开开发者工具以便调试
        mainWindow.webContents.openDevTools();
    } else {
        // 生产环境加载打包好的文件
        try {
            // 处理不同的文件路径情况
            let indexPath;
            
            console.log('=== 生产环境文件加载调试 ===');
            console.log('__dirname:', __dirname);
            console.log('process.resourcesPath:', process.resourcesPath);
            console.log('app.isPackaged:', app.isPackaged);
            
            // 检查在打包应用中的可能路径
            let actualPath;
            if (app.isPackaged) {
                // 在打包环境中，文件在 app.asar 内
                actualPath = path.join(__dirname, 'dist', 'renderer', 'index.html');
                console.log('打包环境路径:', actualPath);
                console.log('__dirname:', __dirname);
                console.log('是否为asar:', __dirname.includes('app.asar'));
                
                // 在asar环境中，直接加载文件
                mainWindow.loadFile(actualPath);
            } else {
                // 非打包环境(npm start) - 使用本地 dist 目录
                actualPath = path.join(__dirname, 'dist', 'renderer', 'index.html');
                console.log('开发环境路径:', actualPath);
                
                if (fs.existsSync(actualPath)) {
                    mainWindow.loadFile(actualPath);
                } else {
                    throw new Error(`文件不存在: ${actualPath}`);
                }
            }
        } catch (err) {
            console.error('加载生产环境文件失败:', err);
            // 显示错误页面
            const errorContent = `
                <html>
                <head>
                    <title>加载错误</title>
                    <style>
                        body { 
                            font-family: Arial, sans-serif; 
                            background: #121212; 
                            color: #fff; 
                            text-align: center; 
                            padding-top: 100px; 
                        }
                        .error-container { 
                            max-width: 500px; 
                            margin: 0 auto; 
                            padding: 20px; 
                            background: rgba(255,255,255,0.1); 
                            border-radius: 8px; 
                        }
                        h3 { color: #ff4d4f; }
                        pre { 
                            text-align: left; 
                            background: #333; 
                            padding: 10px; 
                            overflow: auto; 
                            max-height: 200px; 
                        }
                    </style>
                </head>
                <body>
                    <div class="error-container">
                        <h3>加载失败</h3>
                        <p>无法加载应用程序文件。</p>
                        <p>错误信息: ${err.message}</p>
                        <pre>${err.stack}</pre>
                    </div>
                </body>
                </html>
            `;
            mainWindow.webContents.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(errorContent));
        }
    }

    // 添加错误处理
    mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
        console.error('页面加载失败:', errorCode, errorDescription);
        
        // 创建 error.html 显示错误信息
        if (errorCode !== -3) { // 忽略用户取消操作
            const errorContent = `
                <html>
                <head>
                    <title>加载错误</title>
                    <style>
                        body { 
                            font-family: Arial, sans-serif; 
                            background: #121212; 
                            color: #fff; 
                            text-align: center; 
                            padding-top: 100px; 
                        }
                        .error-container { 
                            max-width: 500px; 
                            margin: 0 auto; 
                            padding: 20px; 
                            background: rgba(255,255,255,0.1); 
                            border-radius: 8px; 
                        }
                        h3 { color: #ff4d4f; }
                        button {
                            background: #1890ff;
                            border: none;
                            color: white;
                            padding: 10px 20px;
                            border-radius: 4px;
                            margin-top: 20px;
                            cursor: pointer;
                        }
                        .debug {
                            margin-top: 20px;
                            font-size: 12px;
                            color: #999;
                            text-align: left;
                            background: #333;
                            padding: 10px;
                            border-radius: 4px;
                        }
                    </style>
                </head>
                <body>
                    <div class="error-container">
                        <h3>加载失败</h3>
                        <p>应用程序加载失败</p>
                        <p>错误代码: ${errorCode}</p>
                        <p>描述: ${errorDescription}</p>
                        <button onclick="window.location.reload()">重试</button>
                        <div class="debug">
                            <p>调试信息:</p>
                            <p>NODE_ENV: ${process.env.NODE_ENV || '未设置'}</p>
                            <p>__dirname: ${__dirname}</p>
                            <p>isPackaged: ${app.isPackaged}</p>
                        </div>
                    </div>
                </body>
                </html>
            `;
            mainWindow.webContents.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(errorContent));
        }
    });
}

// 创建窗口
app.whenReady().then(() => {
    createWindow();
});

app.on('window-all-closed', function () {
    if (process.platform !== 'darwin') app.quit();
});

app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
});