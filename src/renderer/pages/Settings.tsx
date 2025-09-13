import React, { useState, useEffect } from 'react';
import { Form, Input, Button, Card, message, Switch, Space, Divider, List, Modal, Radio, Popconfirm, Typography } from 'antd';
import { useEmbyStore } from '../stores/embyStore';
import { useServerStore, ServerConfig } from '../stores/serverStore';
import { PlusOutlined, EditOutlined, DeleteOutlined, CheckOutlined } from '@ant-design/icons';
import './Settings.scss';

const { Title, Text } = Typography;

const Settings: React.FC = () => {
  const { logout } = useEmbyStore();
  const { servers, addServer, updateServer, deleteServer, activeServerId, setActiveServer } = useServerStore();
  
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editingServerId, setEditingServerId] = useState<string | null>(null);
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
  const showEditServerModal = (server: ServerConfig) => {
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
        } else {
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
  const handleDeleteServer = (id: string) => {
    deleteServer(id);
    message.success('服务器已删除');
  };

  // 设置活跃服务器
  const handleSetActiveServer = (id: string) => {
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
            } else {
              message.error('切换服务器后自动登录失败，请手动登录');
            }
          });
      } else {
        // 如果没有保存用户名密码，则退出当前登录状态
        logout();
        message.info('已切换服务器，请重新登录');
      }
    } else {
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
  const validateServerUrl = (_: any, value: string) => {
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
  const validatePort = (_: any, value: string) => {
    if (!value) {
      return Promise.resolve(); // 端口号可以为空，使用默认端口
    }
    const port = parseInt(value, 10);
    if (isNaN(port) || port < 1 || port > 65535) {
      return Promise.reject('端口号必须在 1-65535 之间');
    }
    return Promise.resolve();
  };

  return (
    <div className="settings-container">
      <h2>设置</h2>
      
      <Card title="服务器管理" className="settings-card">
        <div className="server-list-header">
          <Title level={5}>已配置的服务器</Title>
          <Button 
            type="primary" 
            icon={<PlusOutlined />} 
            onClick={showAddServerModal}
          >
            添加服务器
          </Button>
        </div>
        
        {servers.length === 0 ? (
          <div className="empty-server-list">
            <Text type="secondary">尚未配置任何服务器</Text>
            <Button type="primary" onClick={showAddServerModal}>添加服务器</Button>
          </div>
        ) : (
          <List
            className="server-list"
            itemLayout="horizontal"
            dataSource={servers}
            renderItem={(server) => (
              <List.Item
                actions={[
                  activeServerId !== server.id && (
                    <Button 
                      icon={<CheckOutlined />} 
                      onClick={() => handleSetActiveServer(server.id)}
                      title="设为当前服务器"
                    >
                      使用
                    </Button>
                  ),
                  <Button 
                    icon={<EditOutlined />} 
                    onClick={() => showEditServerModal(server)}
                    title="编辑服务器"
                  >
                    编辑
                  </Button>,
                  <Popconfirm
                    title="确定要删除此服务器吗？"
                    onConfirm={() => handleDeleteServer(server.id)}
                    okText="确定"
                    cancelText="取消"
                  >
                    <Button 
                      danger 
                      icon={<DeleteOutlined />}
                      title="删除服务器"
                    >
                      删除
                    </Button>
                  </Popconfirm>
                ]}
              >
                <List.Item.Meta
                  title={
                    <span>
                      {server.name}
                      {activeServerId === server.id && (
                        <span className="current-server-badge">当前服务器</span>
                      )}
                    </span>
                  }
                  description={
                    <div className="server-details">
                      <div>地址: {server.protocol}://{server.url}{server.port ? `:${server.port}` : ''}</div>
                      <div>用户名: {server.username || '未设置'}</div>
                    </div>
                  }
                />
              </List.Item>
            )}
          />
        )}
      </Card>
      
      <Card title="应用设置" className="settings-card">
        <Form layout="vertical">
          <Form.Item label="播放设置">
            <Space direction="vertical" style={{ width: '100%' }}>
              <div className="setting-option">
                <span>自动播放</span>
                <Switch defaultChecked />
              </div>
              <div className="setting-option">
                <span>播放结束时返回首页</span>
                <Switch defaultChecked />
              </div>
            </Space>
          </Form.Item>
        </Form>
      </Card>
      
      <Card title="故障排除" className="settings-card">
        <p>如果登录失败或遇到连接问题，可以尝试以下操作：</p>
        <Space direction="vertical" style={{ width: '100%' }}>
          <Button 
            type="primary" 
            onClick={showAddServerModal}
            icon={<PlusOutlined />}
          >
            添加新服务器
          </Button>
          <Button 
            danger
            onClick={handleQuickReset}
          >
            快速重置服务器配置
          </Button>
        </Space>
      </Card>
      
      <Card title="关于" className="settings-card">
        <p>Emby 桌面播放器 v1.0.0</p>
        <p>基于 Electron 和 React 构建</p>
      </Card>
      
      <Divider />
      
      <div className="actions">
        <Button 
          type="primary" 
          danger 
          onClick={handleReset}
        >
          重置所有设置
        </Button>
      </div>
      
      {/* 添加/编辑服务器模态框 */}
      <Modal
        title={isEditing ? "编辑服务器" : "添加服务器"}
        open={isModalVisible}
        onOk={handleModalOk}
        onCancel={handleModalCancel}
        destroyOnClose
      >
        <Form
          form={form}
          layout="vertical"
        >
          <Form.Item
            name="name"
            label="服务器名称"
            rules={[{ required: true, message: '请输入服务器名称' }]}
          >
            <Input placeholder="例如：家庭服务器" />
          </Form.Item>
          
          <Form.Item label="服务器地址">
            <Input.Group compact>
              <Form.Item
                name="protocol"
                noStyle
              >
                <Radio.Group buttonStyle="solid">
                  <Radio.Button value="http">http</Radio.Button>
                  <Radio.Button value="https">https</Radio.Button>
                </Radio.Group>
              </Form.Item>
              <Form.Item
                name="url"
                noStyle
                rules={[{ validator: validateServerUrl }]}
              >
                <Input
                  style={{ width: 'calc(100% - 150px)' }}
                  placeholder="服务器地址（如 emby.example.com）"
                />
              </Form.Item>
            </Input.Group>
          </Form.Item>
          
          <Form.Item
            name="port"
            label="端口号"
            rules={[{ validator: validatePort }]}
            extra="可选，留空则使用默认端口"
          >
            <Input placeholder="端口号（可选）" />
          </Form.Item>
          
          <Form.Item
            name="username"
            label="用户名"
            extra="可选，用于自动登录"
          >
            <Input placeholder="用户名（可选）" />
          </Form.Item>
          
          <Form.Item
            name="password"
            label="密码"
            extra="可选，用于自动登录"
          >
            <Input.Password
              placeholder="密码（可选）"
              visibilityToggle={{ visible: isPasswordVisible, onVisibleChange: setIsPasswordVisible }}
            />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default Settings;