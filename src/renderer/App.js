import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect } from 'react';
import { Routes, Route, useNavigate } from 'react-router-dom';
import { ConfigProvider, theme, App as AntdApp } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import Home from './pages/Home';
import Player from './pages/Player';
import Recent from './pages/Recent';
import History from './pages/History';
import Settings from './pages/Settings';
import Movies from './pages/Movies';
import Series from './pages/Series';
import Libraries from './pages/Libraries';
import Layout from './components/Layout';
import ErrorBoundary from './components/ErrorBoundary';
import { useEmbyStore } from './stores/embyStore';
import { useServerStore } from './stores/serverStore';
import './index.css';
const App = () => {
    const { isLoggedIn } = useEmbyStore();
    const { servers, activeServerId } = useServerStore();
    const navigate = useNavigate();
    // 监控登录状态和服务器配置 - 仅记录日志，不进行强制跳转
    useEffect(() => {
        console.log('App组件 - 登录状态:', isLoggedIn, '服务器数量:', servers.length);
        console.log('当前路径:', window.location.pathname);
        console.log('完整URL:', window.location.href);
        // 仅在没有服务器配置时显示提示，但不强制跳转
        if (servers.length === 0) {
            console.log('没有配置服务器，请前往设置页面添加服务器');
        }
    }, [isLoggedIn, servers]);
    // 尝试使用存储的凭证自动登录
    useEffect(() => {
        const performAutoLogin = async () => {
            // 只有当有活跃服务器但未登录时才尝试自动登录
            if (activeServerId && !isLoggedIn && servers.length > 0) {
                const activeServer = servers.find(s => s.id === activeServerId);
                if (activeServer && activeServer.username && activeServer.password) {
                    console.log('尝试使用存储的凭证自动登录...');
                    const embyStore = useEmbyStore.getState();
                    try {
                        await embyStore.login(activeServer.id, activeServer.username, activeServer.password);
                    }
                    catch (error) {
                        console.error('自动登录失败:', error);
                    }
                }
            }
        };
        performAutoLogin();
    }, [activeServerId, isLoggedIn, servers]);
    return (_jsx(ConfigProvider, { locale: zhCN, theme: {
            algorithm: theme.darkAlgorithm,
            token: {
                colorPrimary: '#1890ff',
            },
        }, children: _jsx(AntdApp, { children: _jsx(ErrorBoundary, { children: _jsx(Routes, { children: _jsxs(Route, { path: "/", element: _jsx(Layout, {}), children: [_jsx(Route, { index: true, element: _jsx(Home, {}) }), _jsx(Route, { path: "player/:id", element: _jsx(Player, {}) }), _jsx(Route, { path: "recent", element: _jsx(Recent, {}) }), _jsx(Route, { path: "history", element: _jsx(History, {}) }), _jsx(Route, { path: "settings", element: _jsx(Settings, {}) }), _jsx(Route, { path: "movies", element: _jsx(Movies, {}) }), _jsx(Route, { path: "series", element: _jsx(Series, {}) }), _jsx(Route, { path: "series/:id", element: _jsx(Series, {}) }), _jsx(Route, { path: "libraries", element: _jsx(Libraries, {}) })] }) }) }) }) }));
};
export default App;
