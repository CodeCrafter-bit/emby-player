import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState, useEffect } from 'react';
import { Layout as AntLayout, Menu, Button, Dropdown, Modal, Form, Input, message } from 'antd';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { HomeOutlined, PlayCircleOutlined, HistoryOutlined, SettingOutlined, LogoutOutlined, VideoCameraOutlined, AppstoreOutlined, UserOutlined, DownOutlined, LoginOutlined, FolderOpenOutlined, } from '@ant-design/icons';
import { useEmbyStore } from '../stores/embyStore';
import { useServerStore } from '../stores/serverStore';
import { useMediaLibraryStore } from '../stores/mediaLibraryStore';
import SearchBar from './SearchBar';
import './Layout.scss';
const { Header, Content, Sider } = AntLayout;
const Layout = () => {
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
    const handleLibraryClick = (library) => {
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
    const handleMenuClick = (key) => {
        if (key === 'logout') {
            logout();
            message.success('已退出登录');
        }
        else if (key === 'login') {
            showLoginModal();
        }
        else if (key.startsWith('/library/')) {
            // 处理媒体库菜单点击
            const libraryId = key.replace('/library/', '');
            const library = libraries.find(lib => lib.Id === libraryId);
            if (library) {
                handleLibraryClick(library);
            }
            else {
                navigate(key);
            }
        }
        else {
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
            }
            else {
                message.error('登录失败');
            }
        }
        catch (error) {
            console.error('登录时发生错误:', error);
        }
        finally {
            setIsLoggingIn(false);
        }
    };
    const handleServerChange = (serverId) => {
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
                    }
                    else {
                        message.error('切换服务器后自动登录失败，请手动登录');
                    }
                })
                    .finally(() => {
                    setIsLoggingIn(false);
                });
            }
            else {
                // 如果没有保存用户名密码，则退出当前登录状态
                logout();
                message.info('已切换服务器，请重新登录');
            }
        }
        else {
            message.success('已切换服务器');
        }
    };
    // 使用items API来创建服务器选择菜单
    const serverMenuItems = [
        ...servers.map(server => ({
            key: server.id,
            label: server.name,
        })),
        {
            type: 'divider',
        },
        {
            key: 'manage',
            label: (_jsxs("span", { children: [_jsx(SettingOutlined, {}), " \u7BA1\u7406\u670D\u52A1\u5668"] })),
            onClick: () => navigate('/settings'),
        },
    ];
    // 创建基本菜单项 - 始终显示所有菜单项，包括设置
    const mainMenuItems = [
        {
            key: '/',
            icon: _jsx(HomeOutlined, {}),
            label: '首页',
        },
        {
            key: '/libraries',
            icon: _jsx(FolderOpenOutlined, {}),
            label: '媒体库',
        },
        {
            key: '/movies',
            icon: _jsx(VideoCameraOutlined, {}),
            label: '电影库',
        },
        {
            key: '/series',
            icon: _jsx(AppstoreOutlined, {}),
            label: '剧集库',
        },
        {
            key: '/recent',
            icon: _jsx(PlayCircleOutlined, {}),
            label: '最近添加',
        },
        {
            key: '/history',
            icon: _jsx(HistoryOutlined, {}),
            label: '播放历史',
        },
        {
            key: '/settings',
            icon: _jsx(SettingOutlined, {}),
            label: '设置',
        },
    ];
    // 根据登录状态添加登录/退出菜单项
    const menuItems = [...mainMenuItems];
    if (isLoggedIn) {
        menuItems.push({
            key: 'logout',
            icon: _jsx(LogoutOutlined, {}),
            label: '退出登录',
        });
    }
    else {
        menuItems.push({
            key: 'login',
            icon: _jsx(LoginOutlined, {}),
            label: '登录',
        });
    }
    const isPlayerPage = location.pathname.startsWith('/player/');
    return (_jsxs(AntLayout, { className: "main-layout", children: [_jsxs(Sider, { collapsible: true, collapsedWidth: 0, breakpoint: "md", className: "main-sider", children: [_jsxs("div", { className: "logo", children: [_jsx("div", { className: "app-icon", children: _jsx("span", { className: "icon-inner", children: "E" }) }), _jsx("span", { className: "app-name", children: "Emby\u64AD\u653E\u5668" })] }), _jsx(Menu, { theme: "dark", mode: "inline", selectedKeys: [location.pathname], onClick: ({ key }) => handleMenuClick(key.toString()), items: menuItems, className: "main-menu" }), isLoggedIn && libraries.length > 0 && (_jsxs("div", { className: "libraries-section", children: [_jsx("div", { className: "section-title", children: "\u5A92\u4F53\u5E93" }), _jsx(Menu, { theme: "dark", mode: "inline", selectedKeys: [location.pathname], onClick: ({ key }) => handleMenuClick(key.toString()), items: libraries.map(library => ({
                                    key: `/library/${library.Id}`,
                                    icon: _jsx(FolderOpenOutlined, {}),
                                    label: library.Name,
                                })), className: "library-menu" })] }))] }), _jsxs(AntLayout, { children: [_jsxs(Header, { className: "main-header", children: [_jsx("div", { className: "header-center", children: _jsx(SearchBar, {}) }), _jsxs("div", { className: "header-right", children: [_jsx(Dropdown, { menu: { items: serverMenuItems, selectedKeys: [activeServerId || ''] }, trigger: ['click'], children: _jsxs(Button, { children: [activeServerId
                                                    ? servers.find(s => s.id === activeServerId)?.name || '选择服务器'
                                                    : '选择服务器', " ", _jsx(DownOutlined, {})] }) }), isLoggedIn ? (_jsxs("span", { className: "user-info", children: [_jsx(UserOutlined, {}), " ", username] })) : (_jsx(Button, { type: "primary", icon: _jsx(LoginOutlined, {}), onClick: showLoginModal, children: "\u767B\u5F55" }))] })] }), _jsx(Content, { className: `main-content ${isPlayerPage ? 'player-content' : ''}`, children: _jsx(Outlet, {}) })] }), _jsx(Modal, { title: "\u767B\u5F55\u5230Emby\u670D\u52A1\u5668", open: loginModalVisible, onOk: handleLogin, onCancel: () => setLoginModalVisible(false), confirmLoading: isLoggingIn, destroyOnClose: true, children: _jsxs(Form, { form: loginForm, layout: "vertical", requiredMark: false, children: [_jsx(Form.Item, { name: "username", label: "\u7528\u6237\u540D", rules: [{ required: true, message: '请输入用户名' }], children: _jsx(Input, { placeholder: "\u8BF7\u8F93\u5165\u7528\u6237\u540D" }) }), _jsx(Form.Item, { name: "password", label: "\u5BC6\u7801", rules: [{ required: true, message: '请输入密码' }], children: _jsx(Input.Password, { placeholder: "\u8BF7\u8F93\u5165\u5BC6\u7801" }) })] }) })] }));
};
export default Layout;
