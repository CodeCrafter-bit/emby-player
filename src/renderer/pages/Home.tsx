import React, { useEffect, useState } from 'react';
import { Card, Row, Col, Spin, Empty, Typography, Button, message, Alert } from 'antd';
import { useNavigate } from 'react-router-dom';
import { RightOutlined, SettingOutlined, FireOutlined } from '@ant-design/icons';
import { useEmbyStore } from '../stores/embyStore';
import { useServerStore } from '../stores/serverStore';
import './Home.scss';

const { Title, Text } = Typography;

interface MediaItem {
  Id: string;
  Name: string;
  ImageTags: {
    Primary?: string;
  };
  BackdropImageTags?: string[];
  Type: string;
  ProductionYear?: number;
  SeriesName?: string;
  Overview?: string;
  RunTimeTicks?: number;
  CommunityRating?: number;
  PremiereDate?: string;
  EndDate?: string;
  OfficialRating?: string;
}

interface MediaGroup {
  title: string;
  items: MediaItem[];
  type: string;
  loading: boolean;
  highlight?: boolean;
}

const Home: React.FC = () => {
  const navigate = useNavigate();
  const [mediaGroups, setMediaGroups] = useState<MediaGroup[]>([
    { 
      title: '重磅热播', 
      items: [], 
      type: 'Featured', 
      loading: true,
      highlight: true,
    },
    { 
      title: '电影库', 
      items: [], 
      type: 'Movie', 
      loading: true,
    },
    { 
      title: '电视剧', 
      items: [], 
      type: 'Series', 
      loading: true, 
    },
    { 
      title: '综艺', 
      items: [], 
      type: 'Variety', 
      loading: true, 
    },
    { 
      title: '纪录片', 
      items: [], 
      type: 'Documentary', 
      loading: true,
    },
  ]);
  
  const { getApiClient, isLoggedIn, token, userId } = useEmbyStore();
  const { servers, activeServerId } = useServerStore();
  
  // 计算当前状态
  const hasServers = servers.length > 0;
  const hasActiveServer = !!activeServerId;
  const canFetchMedia = hasServers && hasActiveServer && isLoggedIn;
  
  useEffect(() => {
    // 如果不满足获取媒体的条件，则不进行API调用
    if (!canFetchMedia) {
      // 将所有媒体组设置为非加载状态，但保持空数组
      setMediaGroups(prevGroups => 
        prevGroups.map(group => ({ ...group, loading: false }))
      );
      return;
    }
    
    // 并行获取各种类型的媒体
    const fetchMediaGroups = async () => {
      const updatedGroups = [...mediaGroups];
      
      const apiClient = getApiClient();
      if (!apiClient) {
        console.error('API客户端不可用');
        setMediaGroups(prevGroups => 
          prevGroups.map(group => ({ ...group, loading: false }))
        );
        return;
      }
      
      try {
        // 获取重磅热播（按热度排序）
        const featuredResponse = await apiClient.get(`/Users/${userId}/Items`, {
          params: {
            SortBy: 'CommunityRating,SortName',
            SortOrder: 'Descending',
            IncludeItemTypes: 'Movie,Series',
            Recursive: true,
            Fields: 'PrimaryImageAspectRatio,BasicSyncInfo,Overview,CommunityRating,PremiereDate,OfficialRating,ProductionYear',
            ImageTypeLimit: 1,
            EnableImageTypes: 'Primary,Backdrop',
            Limit: 12,
          },
        });
        
        updatedGroups[0] = {
          ...updatedGroups[0],
          items: featuredResponse.data.Items || [],
          loading: false,
        };
        
        // 获取电影库（优先显示最新年份的电影）
        const movieResponse = await apiClient.get(`/Users/${userId}/Items`, {
          params: {
            SortBy: 'ProductionYear,PremiereDate,DateCreated',
            SortOrder: 'Descending',
            IncludeItemTypes: 'Movie',
            Recursive: true,
            Fields: 'PrimaryImageAspectRatio,BasicSyncInfo,Overview,CommunityRating,PremiereDate,OfficialRating,ProductionYear',
            ImageTypeLimit: 1,
            EnableImageTypes: 'Primary,Backdrop',
            Limit: 12,
          },
        });
        
        updatedGroups[1] = {
          ...updatedGroups[1],
          items: movieResponse.data.Items || [],
          loading: false,
        };
        
        // 获取电视剧（优先显示最新年份的电视剧）
        const seriesResponse = await apiClient.get(`/Users/${userId}/Items`, {
          params: {
            SortBy: 'ProductionYear,PremiereDate,DateCreated',
            SortOrder: 'Descending',
            IncludeItemTypes: 'Series',
            ExcludeGenres: 'Reality,Talk Show,Variety,Game Show,Documentary',
            Recursive: true,
            Fields: 'PrimaryImageAspectRatio,BasicSyncInfo,Overview,CommunityRating,PremiereDate,OfficialRating,ProductionYear',
            ImageTypeLimit: 1,
            EnableImageTypes: 'Primary,Backdrop',
            Limit: 12,
          },
        });
        
        updatedGroups[2] = {
          ...updatedGroups[2],
          items: seriesResponse.data.Items || [],
          loading: false,
        };
        
        // 获取综艺节目（优先显示最新年份的综艺）
        const varietyResponse = await apiClient.get(`/Users/${userId}/Items`, {
          params: {
            SortBy: 'ProductionYear,PremiereDate,DateCreated',
            SortOrder: 'Descending',
            IncludeItemTypes: 'Series',
            Genres: 'Reality,Talk Show,Variety,Game Show',
            Recursive: true,
            Fields: 'PrimaryImageAspectRatio,BasicSyncInfo,Overview,CommunityRating,PremiereDate,OfficialRating,ProductionYear',
            ImageTypeLimit: 1,
            EnableImageTypes: 'Primary,Backdrop',
            Limit: 12,
          },
        });
        
        updatedGroups[3] = {
          ...updatedGroups[3],
          items: varietyResponse.data.Items || [],
          loading: false,
        };

        // 获取纪录片（优先显示最新年份的纪录片）
        const documentaryResponse = await apiClient.get(`/Users/${userId}/Items`, {
          params: {
            SortBy: 'ProductionYear,PremiereDate,DateCreated',
            SortOrder: 'Descending',
            IncludeItemTypes: 'Movie,Series',
            Genres: 'Documentary',
            Recursive: true,
            Fields: 'PrimaryImageAspectRatio,BasicSyncInfo,Overview,CommunityRating,PremiereDate,OfficialRating,ProductionYear',
            ImageTypeLimit: 1,
            EnableImageTypes: 'Primary,Backdrop',
            Limit: 12,
          },
        });
        
        updatedGroups[4] = {
          ...updatedGroups[4],
          items: documentaryResponse.data.Items || [],
          loading: false,
        };
        
        setMediaGroups(updatedGroups);
      } catch (error) {
        console.error('获取媒体内容失败:', error);
        
        // 更新所有组为非加载状态
        setMediaGroups(updatedGroups.map(group => ({ ...group, loading: false })));
      }
    };

    fetchMediaGroups();
  }, [canFetchMedia, getApiClient, userId]);

  const getImageUrl = (item: MediaItem) => {
    if (item.ImageTags?.Primary) {
      // 获取活跃服务器的URL
      const activeServer = servers.find(s => s.id === activeServerId);
      if (!activeServer) return '';
      
      const port = activeServer.port ? `:${activeServer.port}` : '';
      const serverUrl = `${activeServer.protocol}://${activeServer.url}${port}`;
      
      return `${serverUrl}/Items/${item.Id}/Images/Primary?width=300&quality=90&api_key=${token}`;
    }
    // 使用 base64 占位图片代替外部链接
    return 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTUwIiBoZWlnaHQ9IjIyNSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTUwIiBoZWlnaHQ9IjIyNSIgZmlsbD0iIzJhMmEyYSIgLz48dGV4dCB4PSI3NSIgeT0iMTEyLjUiIGZvbnQtZmFtaWx5PSJBcmlhbCIgZm9udC1zaXplPSIxMnB4IiBmaWxsPSIjOTk5IiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBhbGlnbm1lbnQtYmFzZWxpbmU9Im1pZGRsZSI+Tm8gSW1hZ2U8L3RleHQ+PC9zdmc+';
  };

  const getBackdropUrl = (item: MediaItem) => {
    if (item.BackdropImageTags && item.BackdropImageTags.length > 0) {
      // 获取活跃服务器的URL
      const activeServer = servers.find(s => s.id === activeServerId);
      if (!activeServer) return null;
      
      const port = activeServer.port ? `:${activeServer.port}` : '';
      const serverUrl = `${activeServer.protocol}://${activeServer.url}${port}`;
      
      return `${serverUrl}/Items/${item.Id}/Images/Backdrop?width=780&quality=90&api_key=${token}`;
    }
    return null;
  };

  const handleItemClick = async (item: MediaItem) => {
    // 如果是剧集系列(Series)，需要获取第一季第一集
    if (item.Type === 'Series') {
      navigate(`/series/${item.Id}`);
    } else {
      // 如果是电影或单集，直接播放
      navigate(`/player/${item.Id}`);
    }
  };

  const formatRuntime = (ticks?: number) => {
    if (!ticks) return '';
    const minutes = Math.floor(ticks / (10000 * 1000 * 60));
    if (minutes < 60) return `${minutes}分钟`;
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    return `${hours}小时${remainingMinutes > 0 ? remainingMinutes + '分钟' : ''}`;
  };

  const renderMediaCard = (item: MediaItem) => {
    return (
      <Card
        hoverable
        cover={
          <div className="card-cover-container">
            <img alt={item.Name} src={getImageUrl(item)} />
            <div className="card-overlay">
              <div className="card-play-button">播放</div>
            </div>
            {item.CommunityRating && (
              <div className="card-rating">{item.CommunityRating.toFixed(1)}</div>
            )}
          </div>
        }
        onClick={() => handleItemClick(item)}
        className="media-card"
      >
        <Card.Meta
          title={item.Name}
          description={
            <div className="card-description">
              {item.ProductionYear ? `${item.ProductionYear}` : ''}
              {item.Type === 'Episode' && item.SeriesName ? ` · ${item.SeriesName}` : ''}
            </div>
          }
        />
      </Card>
    );
  };

  const renderMediaGroup = (group: MediaGroup) => {
    if (group.loading) {
      return (
        <div className="loading-container">
          <Spin size="large" />
        </div>
      );
    }

    if (!group.items.length) {
      return (
        <Empty description={`暂无${group.title}`} />
      );
    }

    return (
      <div className="media-group">
        <div className="media-group-header">
          <Title level={4}>
            {group.title === '重磅热播' ? (
              <><FireOutlined style={{ marginRight: 8 }} />{group.title}</>
            ) : (
              group.title
            )}
          </Title>
          <Button 
            type="link" 
            onClick={() => navigate(group.type === 'Movie' ? '/movies' : 
                                   group.type === 'Series' ? '/series' :
                                   group.type === 'Variety' ? '/variety' :
                                   group.type === 'Documentary' ? '/documentary' : '/recent')}
            icon={<RightOutlined />}
          >
            查看全部
          </Button>
        </div>
        <Row gutter={[16, 24]} className="media-items">
          {group.items.map((item) => (
            <Col key={item.Id} xs={12} sm={8} md={6} lg={4} xl={4}>
              {renderMediaCard(item)}
            </Col>
          ))}
        </Row>
      </div>
    );
  };

  // 如果没有配置服务器，显示配置提示但不强制跳转
  if (!hasServers) {
    return (
      <div className="home-container">
        <Alert
          message="欢迎使用Emby客户端"
          description={
            <div>
              <p>您尚未配置任何Emby服务器。请先添加服务器配置以开始使用。</p>
              <Button 
                type="primary" 
                icon={<SettingOutlined />} 
                onClick={() => navigate('/settings')}
              >
                前往设置
              </Button>
            </div>
          }
          type="info"
          showIcon
          className="server-alert"
        />
      </div>
    );
  }
  
  // 如果有服务器但未登录，显示登录提示但不强制跳转
  if (!isLoggedIn) {
    const activeServer = servers.find(s => s.id === activeServerId);
    return (
      <div className="home-container">
        <Alert
          message="未登录状态"
          description={
            <div>
              <p>
                {activeServer 
                  ? `当前服务器: ${activeServer.name} - 请登录后查看内容` 
                  : '请选择服务器并登录后查看内容'}
              </p>
              <p>您可以使用侧边栏导航到其他页面，或前往设置重新配置服务器</p>
              <div style={{ marginTop: 16 }}>
                <Button 
                  type="primary" 
                  icon={<SettingOutlined />} 
                  onClick={() => navigate('/settings')}
                  style={{ marginRight: 8 }}
                >
                  前往登录
                </Button>
                <Button 
                  onClick={() => navigate('/settings')}
                >
                  服务器设置
                </Button>
              </div>
            </div>
          }
          type="info"
          showIcon
          className="server-alert"
        />
      </div>
    );
  }

  return (
    <div className="home-container">
      {mediaGroups.map((group, index) => (
        <React.Fragment key={index}>
          {renderMediaGroup(group)}
        </React.Fragment>
      ))}
    </div>
  );
};

export default Home; 