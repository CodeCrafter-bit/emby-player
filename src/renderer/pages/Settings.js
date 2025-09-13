import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from 'react';
import { Form, Input, Button, Card, message, Switch, Space, Divider, List, Modal, Radio, Popconfirm, Typography } from 'antd';
import { useEmbyStore } from '../stores/embyStore';
import { useServerStore } from '../stores/serverStore';
import { PlusOutlined, EditOutlined, DeleteOutlined, CheckOutlined } from '@ant-design/icons';
import './Settings.scss';
const { Title, Text } = Typography;
const Settings = () => {
    const { logout } = useEmbyStore();
    const { servers, addServer, updateServer, deleteServer, activeServerId, setActiveServer } = useServerStore();
    const [isModalVisible, setIsModalVisible] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const [editingServerId, setEditingServerId] = useState(null);
    const [form] = Form.useForm();
    const [isPasswordVisible, setIsPasswordVisible] = useState(false);
    console.log('Settings组件 - 服务器数量:', servers.length);
    console.log('Settings组件 - 活跃服务器ID:', activeServerId);
    // 打开添加服务器模态框
    const showAddServerModal = () => {
        setIsEditing(false);
        setEditingServerId(null);
        form.resetFields();
        form.setFieldsValue({
            protocol: 'https',
            port: ''
        });
        setIsModalVisible(true);
    };
    // 打开编辑服务器模态框
    const showEditServerModal = (server) => {
        setIsEditing(true);
        setEditingServerId(server.id);
        form.setFieldsValue({
            name: server.name,
            protocol: server.protocol,
            url: server.url,
            port: server.port || '',
            username: server.username || '',
            password: server.password || ''
        });
        setIsModalVisible(true);
    };
    // 处理模态框确认
    const handleModalOk = () => {
        form.validateFields()
            .then((values) => {
            if (isEditing && editingServerId) {
                updateServer(editingServerId, values);
                message.success('服务器配置已更新');
            }
            else {
                const newServerId = addServer(values);
                message.success('服务器已添加');
                // 如果是第一个服务器，自动设为活跃
                if (servers.length === 0) {
                    setActiveServer(newServerId);
                }
            }
            setIsModalVisible(false);
        })
            .catch((info) => {
            console.log('验证失败:', info);
        });
    };
    // 处理模态框取消
    const handleModalCancel = () => {
        setIsModalVisible(false);
    };
    // 删除服务器
    const handleDeleteServer = (id) => {
        deleteServer(id);
        message.success('服务器已删除');
    };
    // 设置活跃服务器
    const handleSetActiveServer = (id) => {
        setActiveServer(id);
        // 如果用户已登录，则需要使用新服务器的信息重新登录
        const { isLoggedIn, login, logout } = useEmbyStore.getState();
        if (isLoggedIn) {
            // 获取新选择的服务器信息
            const newServer = servers.find(s => s.id === id);
            if (newServer && newServer.username && newServer.password) {
                // 使用新服务器的用户名密码自动登录
                login(id, newServer.username, newServer.password)
                    .then(success => {
                    if (success) {
                        message.success('已切换到服务器：' + newServer.name);
                    }
                    else {
                        message.error('切换服务器后自动登录失败，请手动登录');
                    }
                });
            }
            else {
                // 如果没有保存用户名密码，则退出当前登录状态
                logout();
                message.info('已切换服务器，请重新登录');
            }
        }
        else {
            message.success('已切换当前服务器');
        }
    };
    // 重置所有设置
    const handleReset = () => {
        Modal.confirm({
            title: '确认重置',
            content: '此操作将删除所有服务器配置并退出登录，确定继续吗？',
            onOk: () => {
                // 删除所有服务器
                servers.forEach(server => {
                    deleteServer(server.id);
                });
                // 登出
                logout();
                message.success('所有设置已重置');
            }
        });
    };
    // 快速重置服务器配置
    const handleQuickReset = () => {
        Modal.confirm({
            title: '快速重置服务器配置',
            content: '此操作将清除所有服务器配置，但保留其他设置。您可以重新添加服务器。',
            onOk: () => {
                // 删除所有服务器
                servers.forEach(server => {
                    deleteServer(server.id);
                });
                // 登出
                logout();
                message.success('服务器配置已重置，请重新添加服务器');
                // 自动打开添加服务器模态框
                setTimeout(() => {
                    showAddServerModal();
                }, 500);
            }
        });
    };
    // 验证服务器URL
    const validateServerUrl = (_, value) => {
        if (!value) {
            return Promise.reject('请输入服务器地址');
        }
        // 只验证服务器地址格式，不包含协议和端口
        if (!/^[a-zA-Z0-9][-a-zA-Z0-9.]*[a-zA-Z0-9]$/.test(value)) {
            return Promise.reject('服务器地址格式不正确');
        }
        return Promise.resolve();
    };
    // 验证端口号
    const validatePort = (_, value) => {
        if (!value) {
            return Promise.resolve(); // 端口号可以为空，使用默认端口
        }
        const port = parseInt(value, 10);
        if (isNaN(port) || port < 1 || port > 65535) {
            return Promise.reject('端口号必须在 1-65535 之间');
        }
        return Promise.resolve();
    };
    return (_jsxs("div", { className: "settings-container", children: [_jsx("h2", { children: "\u8BBE\u7F6E" }), _jsxs(Card, { title: "\u670D\u52A1\u5668\u7BA1\u7406", className: "settings-card", children: [_jsxs("div", { className: "server-list-header", children: [_jsx(Title, { level: 5, children: "\u5DF2\u914D\u7F6E\u7684\u670D\u52A1\u5668" }), _jsx(Button, { type: "primary", icon: _jsx(PlusOutlined, {}), onClick: showAddServerModal, children: "\u6DFB\u52A0\u670D\u52A1\u5668" })] }), servers.length === 0 ? (_jsxs("div", { className: "empty-server-list", children: [_jsx(Text, { type: "secondary", children: "\u5C1A\u672A\u914D\u7F6E\u4EFB\u4F55\u670D\u52A1\u5668" }), _jsx(Button, { type: "primary", onClick: showAddServerModal, children: "\u6DFB\u52A0\u670D\u52A1\u5668" })] })) : (_jsx(List, { className: "server-list", itemLayout: "horizontal", dataSource: servers, renderItem: (server) => (_jsx(List.Item, { actions: [
                                activeServerId !== server.id && (_jsx(Button, { icon: _jsx(CheckOutlined, {}), onClick: () => handleSetActiveServer(server.id), title: "\u8BBE\u4E3A\u5F53\u524D\u670D\u52A1\u5668", children: "\u4F7F\u7528" })),
                                _jsx(Button, { icon: _jsx(EditOutlined, {}), onClick: () => showEditServerModal(server), title: "\u7F16\u8F91\u670D\u52A1\u5668", children: "\u7F16\u8F91" }),
                                _jsx(Popconfirm, { title: "\u786E\u5B9A\u8981\u5220\u9664\u6B64\u670D\u52A1\u5668\u5417\uFF1F", onConfirm: () => handleDeleteServer(server.id), okText: "\u786E\u5B9A", cancelText: "\u53D6\u6D88", children: _jsx(Button, { danger: true, icon: _jsx(DeleteOutlined, {}), title: "\u5220\u9664\u670D\u52A1\u5668", children: "\u5220\u9664" }) })
                            ], children: _jsx(List.Item.Meta, { title: _jsxs("span", { children: [server.name, activeServerId === server.id && (_jsx("span", { className: "current-server-badge", children: "\u5F53\u524D\u670D\u52A1\u5668" }))] }), description: _jsxs("div", { className: "server-details", children: [_jsxs("div", { children: ["\u5730\u5740: ", server.protocol, "://", server.url, server.port ? `:${server.port}` : ''] }), _jsxs("div", { children: ["\u7528\u6237\u540D: ", server.username || '未设置'] })] }) }) })) }))] }), _jsx(Card, { title: "\u5E94\u7528\u8BBE\u7F6E", className: "settings-card", children: _jsx(Form, { layout: "vertical", children: _jsx(Form.Item, { label: "\u64AD\u653E\u8BBE\u7F6E", children: _jsxs(Space, { direction: "vertical", style: { width: '100%' }, children: [_jsxs("div", { className: "setting-option", children: [_jsx("span", { children: "\u81EA\u52A8\u64AD\u653E" }), _jsx(Switch, { defaultChecked: true })] }), _jsxs("div", { className: "setting-option", children: [_jsx("span", { children: "\u64AD\u653E\u7ED3\u675F\u65F6\u8FD4\u56DE\u9996\u9875" }), _jsx(Switch, { defaultChecked: true })] })] }) }) }) }), _jsxs(Card, { title: "\u6545\u969C\u6392\u9664", className: "settings-card", children: [_jsx("p", { children: "\u5982\u679C\u767B\u5F55\u5931\u8D25\u6216\u9047\u5230\u8FDE\u63A5\u95EE\u9898\uFF0C\u53EF\u4EE5\u5C1D\u8BD5\u4EE5\u4E0B\u64CD\u4F5C\uFF1A" }), _jsxs(Space, { direction: "vertical", style: { width: '100%' }, children: [_jsx(Button, { type: "primary", onClick: showAddServerModal, icon: _jsx(PlusOutlined, {}), children: "\u6DFB\u52A0\u65B0\u670D\u52A1\u5668" }), _jsx(Button, { danger: true, onClick: handleQuickReset, children: "\u5FEB\u901F\u91CD\u7F6E\u670D\u52A1\u5668\u914D\u7F6E" })] })] }), _jsxs(Card, { title: "\u5173\u4E8E", className: "settings-card", children: [_jsx("p", { children: "Emby \u684C\u9762\u64AD\u653E\u5668 v1.0.0" }), _jsx("p", { children: "\u57FA\u4E8E Electron \u548C React \u6784\u5EFA" })] }), _jsx(Divider, {}), _jsx("div", { className: "actions", children: _jsx(Button, { type: "primary", danger: true, onClick: handleReset, children: "\u91CD\u7F6E\u6240\u6709\u8BBE\u7F6E" }) }), _jsx(Modal, { title: isEditing ? "编辑服务器" : "添加服务器", open: isModalVisible, onOk: handleModalOk, onCancel: handleModalCancel, destroyOnClose: true, children: _jsxs(Form, { form: form, layout: "vertical", children: [_jsx(Form.Item, { name: "name", label: "\u670D\u52A1\u5668\u540D\u79F0", rules: [{ required: true, message: '请输入服务器名称' }], children: _jsx(Input, { placeholder: "\u4F8B\u5982\uFF1A\u5BB6\u5EAD\u670D\u52A1\u5668" }) }), _jsx(Form.Item, { label: "\u670D\u52A1\u5668\u5730\u5740", children: _jsxs(Input.Group, { compact: true, children: [_jsx(Form.Item, { name: "protocol", noStyle: true, children: _jsxs(Radio.Group, { buttonStyle: "solid", children: [_jsx(Radio.Button, { value: "http", children: "http" }), _jsx(Radio.Button, { value: "https", children: "https" })] }) }), _jsx(Form.Item, { name: "url", noStyle: true, rules: [{ validator: validateServerUrl }], children: _jsx(Input, { style: { width: 'calc(100% - 150px)' }, placeholder: "\u670D\u52A1\u5668\u5730\u5740\uFF08\u5982 emby.example.com\uFF09" }) })] }) }), _jsx(Form.Item, { name: "port", label: "\u7AEF\u53E3\u53F7", rules: [{ validator: validatePort }], extra: "\u53EF\u9009\uFF0C\u7559\u7A7A\u5219\u4F7F\u7528\u9ED8\u8BA4\u7AEF\u53E3", children: _jsx(Input, { placeholder: "\u7AEF\u53E3\u53F7\uFF08\u53EF\u9009\uFF09" }) }), _jsx(Form.Item, { name: "username", label: "\u7528\u6237\u540D", extra: "\u53EF\u9009\uFF0C\u7528\u4E8E\u81EA\u52A8\u767B\u5F55", children: _jsx(Input, { placeholder: "\u7528\u6237\u540D\uFF08\u53EF\u9009\uFF09" }) }), _jsx(Form.Item, { name: "password", label: "\u5BC6\u7801", extra: "\u53EF\u9009\uFF0C\u7528\u4E8E\u81EA\u52A8\u767B\u5F55", children: _jsx(Input.Password, { placeholder: "\u5BC6\u7801\uFF08\u53EF\u9009\uFF09", visibilityToggle: { visible: isPasswordVisible, onVisibleChange: setIsPasswordVisible } }) })] }) })] }));
};
export default Settings;
