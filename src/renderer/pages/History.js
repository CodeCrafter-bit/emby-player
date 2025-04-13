import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useState } from 'react';
import { Card, Row, Col, Spin, Empty, message } from 'antd';
import { useNavigate } from 'react-router-dom';
import { useEmbyStore } from '../stores/embyStore';
import './History.scss';
const History = () => {
    const [loading, setLoading] = useState(true);
    const [historyItems, setHistoryItems] = useState([]);
    const { getApiClient, serverUrl, userId } = useEmbyStore();
    const navigate = useNavigate();
    useEffect(() => {
        fetchHistoryItems();
    }, []);
    const fetchHistoryItems = async () => {
        try {
            setLoading(true);
            const apiClient = getApiClient();
            // 获取播放历史
            const response = await apiClient.get(`/Users/${userId}/Items`, {
                params: {
                    Limit: 20,
                    Recursive: true,
                    Fields: 'PrimaryImageAspectRatio,ProductionYear',
                    ImageTypeLimit: 1,
                    EnableImageTypes: 'Primary',
                    SortBy: 'DatePlayed',
                    SortOrder: 'Descending',
                    Filters: 'IsPlayed',
                },
            });
            setHistoryItems(response.data.Items || []);
            setLoading(false);
        }
        catch (error) {
            console.error('获取播放历史失败:', error);
            message.error('获取播放历史失败，请检查网络连接');
            setLoading(false);
        }
    };
    const getImageUrl = (item) => {
        if (item.ImageTags?.Primary) {
            return `${serverUrl}/Items/${item.Id}/Images/Primary`;
        }
        // 使用 base64 占位图片代替外部链接
        return 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTUwIiBoZWlnaHQ9IjIyNSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTUwIiBoZWlnaHQ9IjIyNSIgZmlsbD0iIzJhMmEyYSIgLz48dGV4dCB4PSI3NSIgeT0iMTEyLjUiIGZvbnQtZmFtaWx5PSJBcmlhbCIgZm9udC1zaXplPSIxMnB4IiBmaWxsPSIjOTk5IiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBhbGlnbm1lbnQtYmFzZWxpbmU9Im1pZGRsZSI+Tm8gSW1hZ2U8L3RleHQ+PC9zdmc+';
    };
    const formatDate = (dateString) => {
        if (!dateString)
            return '';
        const date = new Date(dateString);
        return date.toLocaleDateString('zh-CN');
    };
    const handleItemClick = async (item) => {
        try {
            // 如果是剧集系列(Series)，需要获取第一季第一集
            if (item.Type === 'Series') {
                setLoading(true);
                const apiClient = getApiClient();
                console.log(`获取剧集系列 ${item.Name} 的第一季...`);
                // 获取该系列的所有季
                const seasonsResponse = await apiClient.get(`/Shows/${item.Id}/Seasons`, {
                    params: { userId }
                });
                if (seasonsResponse.data && seasonsResponse.data.Items && seasonsResponse.data.Items.length > 0) {
                    // 按季号排序
                    const seasons = seasonsResponse.data.Items.sort((a, b) => (a.IndexNumber || 0) - (b.IndexNumber || 0));
                    const firstSeason = seasons[0];
                    console.log(`获取第一季 ${firstSeason.Name} 的剧集...`);
                    // 获取第一季的所有剧集
                    const episodesResponse = await apiClient.get(`/Shows/${item.Id}/Episodes`, {
                        params: {
                            seasonId: firstSeason.Id,
                            userId
                        }
                    });
                    if (episodesResponse.data && episodesResponse.data.Items && episodesResponse.data.Items.length > 0) {
                        // 按集号排序
                        const episodes = episodesResponse.data.Items.sort((a, b) => (a.IndexNumber || 0) - (b.IndexNumber || 0));
                        const firstEpisode = episodes[0];
                        console.log(`准备播放第一集: ${firstEpisode.Name} (ID: ${firstEpisode.Id})`);
                        // 导航到第一集
                        navigate(`/player/${firstEpisode.Id}`);
                        setLoading(false);
                        return;
                    }
                    else {
                        console.error('未找到第一季的任何剧集');
                        message.error('未找到任何可播放的剧集');
                    }
                }
                else {
                    console.error('未找到任何季');
                    message.error('未找到任何可播放的季');
                }
                setLoading(false);
            }
            else {
                // 如果是电影或单集，直接播放
                navigate(`/player/${item.Id}`);
            }
        }
        catch (error) {
            console.error('获取剧集信息失败:', error);
            message.error('获取剧集信息失败，请稍后重试');
            setLoading(false);
        }
    };
    return (_jsxs("div", { className: "history-container", children: [_jsx("h2", { children: "\u64AD\u653E\u5386\u53F2" }), loading ? (_jsx("div", { className: "loading-container", children: _jsx(Spin, { size: "large" }) })) : historyItems.length === 0 ? (_jsx(Empty, { description: "\u6682\u65E0\u64AD\u653E\u5386\u53F2" })) : (_jsx(Row, { gutter: [16, 16], children: historyItems.map((item) => (_jsx(Col, { xs: 12, sm: 8, md: 6, lg: 4, children: _jsx(Card, { hoverable: true, cover: _jsx("img", { alt: item.Name, src: getImageUrl(item) }), onClick: () => handleItemClick(item), children: _jsx(Card.Meta, { title: item.Name, description: `${item.ProductionYear || ''} ${formatDate(item.LastPlayedDate)}` }) }) }, item.Id))) }))] }));
};
export default History;
