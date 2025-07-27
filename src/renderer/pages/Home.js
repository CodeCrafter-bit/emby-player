import { jsxs as _jsxs, jsx as _jsx, Fragment as _Fragment } from "react/jsx-runtime";
import React, { useEffect, useState } from 'react';
import { Card, Row, Col, Spin, Empty, Typography, Button, Alert } from 'antd';
import { useNavigate } from 'react-router-dom';
import { RightOutlined, SettingOutlined, FireOutlined } from '@ant-design/icons';
import { useEmbyStore } from '../stores/embyStore';
import { useServerStore } from '../stores/serverStore';
import './Home.scss';
const { Title, Text } = Typography;
const Home = () => {
    const navigate = useNavigate();
    const [mediaGroups, setMediaGroups] = useState([
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
            setMediaGroups(prevGroups => prevGroups.map(group => ({ ...group, loading: false })));
            return;
        }
        // 并行获取各种类型的媒体
        const fetchMediaGroups = async () => {
            const updatedGroups = [...mediaGroups];
            const apiClient = getApiClient();
            if (!apiClient) {
                console.error('API客户端不可用');
                setMediaGroups(prevGroups => prevGroups.map(group => ({ ...group, loading: false })));
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
            }
            catch (error) {
                console.error('获取媒体内容失败:', error);
                // 更新所有组为非加载状态
                setMediaGroups(updatedGroups.map(group => ({ ...group, loading: false })));
            }
        };
        fetchMediaGroups();
    }, [canFetchMedia, getApiClient, userId]);
    const getImageUrl = (item) => {
        if (item.ImageTags?.Primary) {
            // 获取活跃服务器的URL
            const activeServer = servers.find(s => s.id === activeServerId);
            if (!activeServer)
                return '';
            const port = activeServer.port ? `:${activeServer.port}` : '';
            const serverUrl = `${activeServer.protocol}://${activeServer.url}${port}`;
            return `${serverUrl}/Items/${item.Id}/Images/Primary?width=300&quality=90&api_key=${token}`;
        }
        // 使用 base64 占位图片代替外部链接
        return 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTUwIiBoZWlnaHQ9IjIyNSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTUwIiBoZWlnaHQ9IjIyNSIgZmlsbD0iIzJhMmEyYSIgLz48dGV4dCB4PSI3NSIgeT0iMTEyLjUiIGZvbnQtZmFtaWx5PSJBcmlhbCIgZm9udC1zaXplPSIxMnB4IiBmaWxsPSIjOTk5IiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBhbGlnbm1lbnQtYmFzZWxpbmU9Im1pZGRsZSI+Tm8gSW1hZ2U8L3RleHQ+PC9zdmc+';
    };
    const getBackdropUrl = (item) => {
        if (item.BackdropImageTags && item.BackdropImageTags.length > 0) {
            // 获取活跃服务器的URL
            const activeServer = servers.find(s => s.id === activeServerId);
            if (!activeServer)
                return null;
            const port = activeServer.port ? `:${activeServer.port}` : '';
            const serverUrl = `${activeServer.protocol}://${activeServer.url}${port}`;
            return `${serverUrl}/Items/${item.Id}/Images/Backdrop?width=780&quality=90&api_key=${token}`;
        }
        return null;
    };
    const handleItemClick = async (item) => {
        // 如果是剧集系列(Series)，需要获取第一季第一集
        if (item.Type === 'Series') {
            navigate(`/series/${item.Id}`);
        }
        else {
            // 如果是电影或单集，直接播放
            navigate(`/player/${item.Id}`);
        }
    };
    const formatRuntime = (ticks) => {
        if (!ticks)
            return '';
        const minutes = Math.floor(ticks / (10000 * 1000 * 60));
        if (minutes < 60)
            return `${minutes}分钟`;
        const hours = Math.floor(minutes / 60);
        const remainingMinutes = minutes % 60;
        return `${hours}小时${remainingMinutes > 0 ? remainingMinutes + '分钟' : ''}`;
    };
    const renderMediaCard = (item) => {
        return (_jsx(Card, { hoverable: true, cover: _jsxs("div", { className: "card-cover-container", children: [_jsx("img", { alt: item.Name, src: getImageUrl(item) }), _jsx("div", { className: "card-overlay", children: _jsx("div", { className: "card-play-button", children: "\u64AD\u653E" }) }), item.CommunityRating && (_jsx("div", { className: "card-rating", children: item.CommunityRating.toFixed(1) }))] }), onClick: () => handleItemClick(item), className: "media-card", children: _jsx(Card.Meta, { title: item.Name, description: _jsxs("div", { className: "card-description", children: [item.ProductionYear ? `${item.ProductionYear}` : '', item.Type === 'Episode' && item.SeriesName ? ` · ${item.SeriesName}` : ''] }) }) }));
    };
    const renderMediaGroup = (group) => {
        if (group.loading) {
            return (_jsx("div", { className: "loading-container", children: _jsx(Spin, { size: "large" }) }));
        }
        if (!group.items.length) {
            return (_jsx(Empty, { description: `暂无${group.title}` }));
        }
        return (_jsxs("div", { className: "media-group", children: [_jsxs("div", { className: "media-group-header", children: [_jsx(Title, { level: 4, children: group.title === '重磅热播' ? (_jsxs(_Fragment, { children: [_jsx(FireOutlined, { style: { marginRight: 8 } }), group.title] })) : (group.title) }), _jsx(Button, { type: "link", onClick: () => navigate(group.type === 'Movie' ? '/movies' :
                                group.type === 'Series' ? '/series' :
                                    group.type === 'Variety' ? '/variety' :
                                        group.type === 'Documentary' ? '/documentary' : '/recent'), icon: _jsx(RightOutlined, {}), children: "\u67E5\u770B\u5168\u90E8" })] }), _jsx(Row, { gutter: [16, 24], className: "media-items", children: group.items.map((item) => (_jsx(Col, { xs: 12, sm: 8, md: 6, lg: 4, xl: 4, children: renderMediaCard(item) }, item.Id))) })] }));
    };
    // 如果没有配置服务器，显示配置提示但不强制跳转
    if (!hasServers) {
        return (_jsx("div", { className: "home-container", children: _jsx(Alert, { message: "\u6B22\u8FCE\u4F7F\u7528Emby\u5BA2\u6237\u7AEF", description: _jsxs("div", { children: [_jsx("p", { children: "\u60A8\u5C1A\u672A\u914D\u7F6E\u4EFB\u4F55Emby\u670D\u52A1\u5668\u3002\u8BF7\u5148\u6DFB\u52A0\u670D\u52A1\u5668\u914D\u7F6E\u4EE5\u5F00\u59CB\u4F7F\u7528\u3002" }), _jsx(Button, { type: "primary", icon: _jsx(SettingOutlined, {}), onClick: () => navigate('/settings'), children: "\u524D\u5F80\u8BBE\u7F6E" })] }), type: "info", showIcon: true, className: "server-alert" }) }));
    }
    // 如果有服务器但未登录，显示登录提示但不强制跳转
    if (!isLoggedIn) {
        const activeServer = servers.find(s => s.id === activeServerId);
        return (_jsx("div", { className: "home-container", children: _jsx(Alert, { message: "\u672A\u767B\u5F55\u72B6\u6001", description: _jsxs("div", { children: [_jsx("p", { children: activeServer
                                ? `当前服务器: ${activeServer.name} - 请登录后查看内容`
                                : '请选择服务器并登录后查看内容' }), _jsx("p", { children: "\u60A8\u53EF\u4EE5\u4F7F\u7528\u4FA7\u8FB9\u680F\u5BFC\u822A\u5230\u5176\u4ED6\u9875\u9762\uFF0C\u6216\u524D\u5F80\u8BBE\u7F6E\u91CD\u65B0\u914D\u7F6E\u670D\u52A1\u5668" }), _jsxs("div", { style: { marginTop: 16 }, children: [_jsx(Button, { type: "primary", icon: _jsx(SettingOutlined, {}), onClick: () => navigate('/settings'), style: { marginRight: 8 }, children: "\u524D\u5F80\u767B\u5F55" }), _jsx(Button, { onClick: () => navigate('/settings'), children: "\u670D\u52A1\u5668\u8BBE\u7F6E" })] })] }), type: "info", showIcon: true, className: "server-alert" }) }));
    }
    return (_jsx("div", { className: "home-container", children: mediaGroups.map((group, index) => (_jsx(React.Fragment, { children: renderMediaGroup(group) }, index))) }));
};
export default Home;
