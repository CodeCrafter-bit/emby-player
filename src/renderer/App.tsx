import React, { useEffect } from 'react';
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom';
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

const App: React.FC = () => {
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
            await embyStore.login(
              activeServer.id,
              activeServer.username,
              activeServer.password
            );
          } catch (error) {
            console.error('自动登录失败:', error);
          }
        }
      }
    };
    
    performAutoLogin();
  }, [activeServerId, isLoggedIn, servers]);

  return (
    <ConfigProvider
      locale={zhCN}
      theme={{
        algorithm: theme.darkAlgorithm,
        token: {
          colorPrimary: '#1890ff',
        },
      }}
    >
      <AntdApp>
        <ErrorBoundary>
          <Routes>
            <Route path="/" element={<Layout />}>
              <Route index element={<Home />} />
              <Route path="player/:id" element={<Player />} />
              <Route path="recent" element={<Recent />} />
              <Route path="history" element={<History />} />
              <Route path="settings" element={<Settings />} />
              <Route path="movies" element={<Movies />} />
              <Route path="series" element={<Series />} />
              <Route path="series/:id" element={<Series />} />
              <Route path="libraries" element={<Libraries />} />
            </Route>
          </Routes>
        </ErrorBoundary>
      </AntdApp>
    </ConfigProvider>
  );
};

export default App;