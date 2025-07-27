import React, { useState, useEffect } from 'react';
import { Layout as AntLayout, Menu, Button, Dropdown, Modal, Form, Input, message, Badge } from 'antd';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import {
  HomeOutlined,
  PlayCircleOutlined,
  HistoryOutlined,
  SettingOutlined,
  LogoutOutlined,
  ArrowLeftOutlined,
  VideoCameraOutlined,
  AppstoreOutlined,
  UserOutlined,
  DownOutlined,
  LoginOutlined,
  FolderOpenOutlined,
} from '@ant-design/icons';
import type { MenuProps } from 'antd';
import { useEmbyStore } from '../stores/embyStore';
import { useServerStore } from '../stores/serverStore';
import { useMediaLibraryStore, LibraryView } from '../stores/mediaLibraryStore';
import SearchBar from './SearchBar';
import './Layout.scss';

const { Header, Content, Sider } = AntLayout;

// 定义菜单项类型
type MenuItem = {
  key: string;
  icon?: React.ReactNode;
  label: string;
  onClick?: () => void;
};

const Layout: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { isLoggedIn, login, logout, username } = useEmbyStore();
  const { servers, activeServerId, setActiveServer } = useServerStore();
  const { libraries, fetchLibraries } = useMediaLibraryStore();
  
  const [loginModalVisible, setLoginModalVisible] = useState(false);
  const [loginForm] = Form.useForm();
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  
  // 当登录状态变化时，获取媒体库列表
  useEffect(() => {
    if (isLoggedIn) {
      fetchLibraries();
    }
  }, [isLoggedIn, fetchLibraries]);
  
  // 处理媒体库点击
  const handleLibraryClick = (library: LibraryView) => {
    // 根据媒体库类型导航到不同页面
    switch (library.CollectionType) {
      case 'movies':
        navigate(`/movies`, { state: { libraryId: library.Id } });
        break;
      case 'tvshows':
        navigate(`/series`, { state: { libraryId: library.Id } });
        break;
      default:
        // 对于其他类型，可以先导航到通用页面或当前还不支持的提示
        message.info(`暂不支持 ${library.Name} (${library.CollectionType || '未知类型'}) 类型的媒体库浏览`);
        break;
    }
  };
  
  const handleMenuClick = (key: string) => {
    if (key === 'logout') {
      logout();
      message.success('已退出登录');
    } else if (key === 'login') {
      showLoginModal();
    } else if (key.startsWith('/library/')) {
      // 处理媒体库菜单点击
      const libraryId = key.replace('/library/', '');
      const library = libraries.find(lib => lib.Id === libraryId);
      if (library) {
        handleLibraryClick(library);
      } else {
        navigate(key);
      }
    } else {
      navigate(key);
    }
  };

  const showLoginModal = () => {
    if (servers.length === 0) {
      message.warning('请先添加服务器配置');
      navigate('/settings');
      return;
    }
    
    // 预填充用户名（如果服务器配置中有）
    const activeServer = servers.find(s => s.id === activeServerId);
    if (activeServer && activeServer.username) {
      loginForm.setFieldsValue({
        username: activeServer.username
      });
    }
    
    setLoginModalVisible(true);
  };
  
  const handleLogin = async () => {
    try {
      const values = await loginForm.validateFields();
      setIsLoggingIn(true);
      
      // 如果没有选择服务器，使用第一个
      const serverId = activeServerId || (servers.length > 0 ? servers[0].id : null);
      
      if (!serverId) {
        message.error('未找到有效的服务器配置');
        setIsLoggingIn(false);
        return;
      }
      
      const success = await login(serverId, values.username, values.password);
      
      if (success) {
        message.success('登录成功');
        setLoginModalVisible(false);
        loginForm.resetFields();
      } else {
        message.error('登录失败');
      }
    } catch (error) {
      console.error('登录时发生错误:', error);
    } finally {
      setIsLoggingIn(false);
    }
  };
  
  const handleServerChange = (serverId: string) => {
    setActiveServer(serverId);
    
    // 如果用户已登录，则需要使用新服务器的信息重新登录
    if (isLoggedIn) {
      // 获取新选择的服务器信息
      const newServer = servers.find(s => s.id === serverId);
      if (newServer && newServer.username && newServer.password) {
        // 使用新服务器的用户名密码自动登录
        setIsLoggingIn(true);
        login(serverId, newServer.username, newServer.password)
          .then(success => {
            if (success) {
              message.success('已切换到服务器：' + newServer.name);
            } else {
              message.error('切换服务器后自动登录失败，请手动登录');
            }
          })
          .finally(() => {
            setIsLoggingIn(false);
          });
      } else {
        // 如果没有保存用户名密码，则退出当前登录状态
        logout();
        message.info('已切换服务器，请重新登录');
      }
    } else {
      message.success('已切换服务器');
    }
  };

  // 使用items API来创建服务器选择菜单
  const serverMenuItems: MenuProps['items'] = [
    ...servers.map(server => ({
      key: server.id,
      label: server.name,
    })),
    {
      type: 'divider',
    },
    {
      key: 'manage',
      label: (
        <span>
          <SettingOutlined /> 管理服务器
        </span>
      ),
      onClick: () => navigate('/settings'),
    },
  ];

  // 创建基本菜单项 - 始终显示所有菜单项，包括设置
  const mainMenuItems: MenuItem[] = [
    {
      key: '/',
      icon: <HomeOutlined />,
      label: '首页',
    },
    {
      key: '/libraries',
      icon: <FolderOpenOutlined />,
      label: '媒体库',
    },
    {
      key: '/movies',
      icon: <VideoCameraOutlined />,
      label: '电影库',
    },
    {
      key: '/series',
      icon: <AppstoreOutlined />,
      label: '剧集库',
    },
    {
      key: '/recent',
      icon: <PlayCircleOutlined />,
      label: '最近添加',
    },
    {
      key: '/history',
      icon: <HistoryOutlined />,
      label: '播放历史',
    },
    {
      key: '/settings',
      icon: <SettingOutlined />,
      label: '设置',
    },
  ];
  
  // 根据登录状态添加登录/退出菜单项
  const menuItems = [...mainMenuItems];
  
  if (isLoggedIn) {
    menuItems.push({
      key: 'logout',
      icon: <LogoutOutlined />,
      label: '退出登录',
    });
  } else {
    menuItems.push({
      key: 'login',
      icon: <LoginOutlined />,
      label: '登录',
    });
  }

  const isPlayerPage = location.pathname.startsWith('/player/');

  return (
    <AntLayout className="main-layout">
      <Sider
        collapsible
        collapsedWidth={0}
        breakpoint="md"
        className="main-sider"
      >
        <div className="logo">
          <div className="app-icon">
            <span className="icon-inner">E</span>
          </div>
          <span className="app-name">Emby播放器</span>
        </div>
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[location.pathname]}
          onClick={({key}) => handleMenuClick(key.toString())}
          items={menuItems as MenuProps['items']}
          className="main-menu"
        />
        
        {/* 动态媒体库菜单 */}
        {isLoggedIn && libraries.length > 0 && (
          <div className="libraries-section">
            <div className="section-title">媒体库</div>
            <Menu
              theme="dark"
              mode="inline"
              selectedKeys={[location.pathname]}
              onClick={({key}) => handleMenuClick(key.toString())}
              items={libraries.map(library => ({
                key: `/library/${library.Id}`,
                icon: <FolderOpenOutlined />,
                label: library.Name,
              })) as MenuProps['items']}
              className="library-menu"
            />
          </div>
        )}
      </Sider>
      <AntLayout>
        <Header className="main-header">
          <div className="header-center">
            <SearchBar />
          </div>
          
          <div className="header-right">
            {/* 服务器选择下拉菜单 */}
            <Dropdown menu={{ items: serverMenuItems, selectedKeys: [activeServerId || ''] }} trigger={['click']}>
              <Button>
                {activeServerId 
                  ? servers.find(s => s.id === activeServerId)?.name || '选择服务器'
                  : '选择服务器'} <DownOutlined />
              </Button>
            </Dropdown>
            
            {/* 用户信息/登录按钮 */}
            {isLoggedIn ? (
              <span className="user-info">
                <UserOutlined /> {username}
              </span>
            ) : (
              <Button 
                type="primary" 
                icon={<LoginOutlined />}
                onClick={showLoginModal}
              >
                登录
              </Button>
            )}
          </div>
        </Header>
        
        <Content className={`main-content ${isPlayerPage ? 'player-content' : ''}`}>
          <Outlet />
        </Content>
      </AntLayout>
      
      {/* 登录模态框 */}
      <Modal
        title="登录到Emby服务器"
        open={loginModalVisible}
        onOk={handleLogin}
        onCancel={() => setLoginModalVisible(false)}
        confirmLoading={isLoggingIn}
        destroyOnClose
      >
        <Form
          form={loginForm}
          layout="vertical"
          requiredMark={false}
        >
          <Form.Item
            name="username"
            label="用户名"
            rules={[{ required: true, message: '请输入用户名' }]}
          >
            <Input placeholder="请输入用户名" />
          </Form.Item>
          <Form.Item
            name="password"
            label="密码"
            rules={[{ required: true, message: '请输入密码' }]}
          >
            <Input.Password placeholder="请输入密码" />
          </Form.Item>
        </Form>
      </Modal>
    </AntLayout>
  );
};

export default Layout; 