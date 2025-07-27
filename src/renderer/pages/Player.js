import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useRef, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Button, Spin, message, List, Typography, Tabs, Collapse, Menu, Card } from 'antd';
import { StepBackwardOutlined, StepForwardOutlined, DownOutlined, UpOutlined, SettingOutlined, ReloadOutlined } from '@ant-design/icons';
import { useEmbyStore } from '../stores/embyStore';
import { useServerStore } from '../stores/serverStore'; // 添加导入
import './Player.scss';
import videojs from 'video.js';
import 'video.js/dist/video-js.css';
import Hls from 'hls.js';
const { Title, Text, Paragraph } = Typography;
const { TabPane } = Tabs;
const { Panel } = Collapse;
// 高级双线程缓冲管理器类
class AdvancedBufferManager {
    constructor(player, videoElement, onBufferingChange, onBufferUpdate) {
        Object.defineProperty(this, "player", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "videoElement", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: null
        });
        Object.defineProperty(this, "bufferTarget", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 300
        }); // 目标缓冲秒数 - 5分钟
        Object.defineProperty(this, "minPlayBuffer", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 10
        }); // 最小播放所需缓冲秒数
        Object.defineProperty(this, "preloadBuffer", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 60
        }); // 预加载缓冲秒数
        Object.defineProperty(this, "isLoading", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: false
        });
        Object.defineProperty(this, "isBuffering", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: false
        });
        Object.defineProperty(this, "onBufferingChange", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "onBufferUpdate", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "bufferCheckInterval", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: null
        });
        Object.defineProperty(this, "preloadInterval", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: null
        });
        Object.defineProperty(this, "loadingTimeout", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: null
        });
        Object.defineProperty(this, "pausedForBuffering", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: false
        });
        Object.defineProperty(this, "lastPlaybackRate", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 1
        });
        Object.defineProperty(this, "isDisposed", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: false
        });
        Object.defineProperty(this, "preloadWorker", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: null
        });
        Object.defineProperty(this, "bufferHistory", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: []
        });
        Object.defineProperty(this, "adaptiveBufferStrategy", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: true
        });
        this.player = player;
        this.videoElement = videoElement;
        this.onBufferingChange = onBufferingChange;
        this.onBufferUpdate = onBufferUpdate;
        this.initialize();
    }
    // 初始化高级缓冲管理器
    initialize() {
        try {
            if (!this.player || !this.videoElement)
                return;
            if (typeof this.player.on !== 'function')
                return;
            // 绑定事件
            this.player.on('waiting', this.handleWaiting.bind(this));
            this.player.on('canplay', this.handleCanPlay.bind(this));
            this.player.on('progress', this.handleProgress.bind(this));
            this.player.on('dispose', this.dispose.bind(this));
            this.startDualThreadBuffering();
        }
        catch (e) {
            // 静默处理初始化错误
        }
    }
    // 启动双线程缓冲系统
    startDualThreadBuffering() {
        this.startBufferCheck();
        this.startPreloadThread();
    }
    // 预加载线程
    startPreloadThread() {
        if (this.preloadInterval) {
            clearInterval(this.preloadInterval);
        }
        this.preloadInterval = window.setInterval(() => {
            if (this.isPlayerValid() && !this.isDisposed) {
                this.performPreload();
            }
        }, 5000); // 每5秒检查一次
    }
    // 检查播放器是否有效
    isPlayerValid() {
        // 首先检查已释放标志
        if (this.isDisposed)
            return false;
        // 检查播放器对象是否存在
        if (!this.player)
            return false;
        try {
            // 检查播放器是否有有效的技术实现(tech)对象
            // video.js在技术实现被销毁时可能会保留player对象，但内部tech为null
            if (this.player.tech && typeof this.player.tech === 'function') {
                const tech = this.player.tech(true);
                if (!tech || !tech.el_)
                    return false;
            }
            // 尝试访问播放器的基本属性，确保对象有效
            // 有些情况下player对象可能存在，但已经在内部被销毁
            if (typeof this.player.el !== 'function')
                return false;
            // 尝试执行一个简单的方法调用来验证
            const playerEl = this.player.el();
            return !!playerEl;
        }
        catch (e) {
            // 如果访问属性或调用方法时出错，说明播放器已经无效
            console.error('缓冲管理器: 检查播放器有效性时出错', e);
            return false;
        }
    }
    // 开始定时检查缓冲区
    startBufferCheck() {
        if (this.bufferCheckInterval) {
            clearInterval(this.bufferCheckInterval);
        }
        // 使用较长的间隔减少CPU使用
        this.bufferCheckInterval = window.setInterval(() => {
            if (this.isPlayerValid()) {
                this.checkBuffer();
            }
            else {
                console.log('缓冲管理器: 播放器已失效，停止缓冲检查');
                this.stopBufferCheck();
            }
        }, 3000);
    }
    // 停止缓冲检查
    stopBufferCheck() {
        if (this.bufferCheckInterval) {
            clearInterval(this.bufferCheckInterval);
            this.bufferCheckInterval = null;
        }
        if (this.loadingTimeout) {
            clearTimeout(this.loadingTimeout);
            this.loadingTimeout = null;
        }
    }
    // 清理资源
    dispose() {
        if (this.isDisposed) {
            // 已经释放过了，避免重复操作
            return;
        }
        this.isDisposed = true;
        // 停止所有定时器
        this.stopBufferCheck();
        // 移除事件监听器
        try {
            if (this.player && typeof this.player.off === 'function') {
                this.player.off('waiting', this.handleWaiting.bind(this));
                this.player.off('canplay', this.handleCanPlay.bind(this));
                this.player.off('progress', this.handleProgress.bind(this));
            }
        }
        catch (e) {
            // 静默处理错误
        }
        this.player = null;
        this.videoElement = null;
    }
    // 处理等待缓冲事件
    handleWaiting() {
        if (!this.isPlayerValid())
            return;
        this.isBuffering = true;
        this.onBufferingChange(true);
        // 安全地检查播放器状态
        try {
            // 如果播放器处于播放状态但缓冲不足，暂停播放器以积累更多缓冲
            if (this.player && typeof this.player.paused === 'function' &&
                !this.player.paused() && this.getBufferAhead() < this.minPlayBuffer) {
                this.pauseForBuffering();
            }
        }
        catch (e) {
            // 静默处理错误
        }
    }
    // 处理可以播放事件
    handleCanPlay() {
        // 如果之前因缓冲不足而暂停，且现在有足够缓冲，则恢复播放
        if (this.pausedForBuffering && this.getBufferAhead() >= this.minPlayBuffer) {
            this.resumeFromBuffering();
        }
        this.isBuffering = false;
        this.onBufferingChange(false);
    }
    // 处理progress事件（浏览器在加载更多视频数据时触发）
    handleProgress() {
        const bufferInfo = this.getBufferInfo();
        this.onBufferUpdate(bufferInfo.bufferAhead, bufferInfo.totalBuffered);
        // 如果之前因缓冲不足而暂停，且现在有足够缓冲，则恢复播放
        if (this.pausedForBuffering && bufferInfo.bufferAhead >= this.minPlayBuffer) {
            this.resumeFromBuffering();
        }
    }
    // 检查缓冲状态并做出相应调整
    checkBuffer() {
        // 多重检查以确保安全
        if (this.isDisposed)
            return;
        if (!this.player)
            return;
        if (!this.isPlayerValid())
            return;
        try {
            // 先验证player的技术实现是否有效，避免"Cannot read properties of null"错误
            let techValid = false;
            try {
                if (this.player.tech && typeof this.player.tech === 'function') {
                    const tech = this.player.tech(true);
                    techValid = !!(tech && tech.el_);
                }
            }
            catch (e) {
                console.error('缓冲管理器: 验证播放器技术实现时出错', e);
                return; // 如果技术实现无效，直接返回
            }
            if (!techValid) {
                console.log('缓冲管理器: 播放器技术实现无效，跳过缓冲检查');
                return;
            }
            // 获取缓冲信息
            const { bufferAhead } = this.getBufferInfo();
            // 获取播放状态
            let isPaused = true;
            try {
                // 确保player.paused方法存在且可调用
                if (this.player && typeof this.player.paused === 'function' && techValid) {
                    isPaused = this.player.paused();
                }
                else if (this.videoElement) {
                    isPaused = this.videoElement.paused;
                }
            }
            catch (e) {
                console.error('缓冲管理器: 获取播放状态失败', e);
                isPaused = true; // 出错时假设已暂停
            }
            // 执行缓冲策略
            try {
                // 缓冲不足，暂停以积累更多缓冲
                if (bufferAhead < this.minPlayBuffer && !isPaused) {
                    this.pauseForBuffering();
                }
                // 已暂停且缓冲充足，恢复播放
                else if (bufferAhead >= this.minPlayBuffer && this.pausedForBuffering) {
                    this.resumeFromBuffering();
                }
                // 缓冲偏低，降低播放速度
                else if (bufferAhead < 10 && !isPaused) {
                    this.adjustPlaybackRate(0.9);
                }
                // 缓冲充足，尝试恢复原始播放速度
                else if (bufferAhead > 20) {
                    let currentRate = 1;
                    try {
                        if (this.player && typeof this.player.playbackRate === 'function') {
                            currentRate = this.player.playbackRate();
                        }
                    }
                    catch (e) {
                        console.error('缓冲管理器: 获取播放速度失败', e);
                    }
                    if (currentRate < this.lastPlaybackRate) {
                        this.adjustPlaybackRate(this.lastPlaybackRate);
                    }
                }
            }
            catch (e) {
                console.error('缓冲管理器: 执行缓冲策略失败', e);
            }
            // 检查是否需要预加载
            try {
                if (bufferAhead < this.bufferTarget && !this.isLoading) {
                    // 检查视频就绪状态
                    let readyState = 0;
                    try {
                        if (this.videoElement) {
                            readyState = this.videoElement.readyState;
                        }
                    }
                    catch (e) {
                        console.error('缓冲管理器: 获取视频就绪状态失败', e);
                    }
                    if (readyState >= 3) {
                        this.preloadMore();
                    }
                }
            }
            catch (e) {
                console.error('缓冲管理器: 检查预加载失败', e);
            }
        }
        catch (e) {
            // 静默处理缓冲检查错误
        }
    }
    // 获取缓冲区信息
    getBufferInfo() {
        if (this.isDisposed) {
            return { bufferAhead: 0, totalBuffered: 0 };
        }
        try {
            // 安全检查player对象和videoElement
            if (!this.player) {
                return { bufferAhead: 0, totalBuffered: 0 };
            }
            // 验证player的技术实现是否有效
            let techValid = false;
            try {
                if (this.player.tech && typeof this.player.tech === 'function') {
                    const tech = this.player.tech(true);
                    techValid = !!(tech && tech.el_);
                }
            }
            catch (e) {
                console.error('缓冲管理器: 验证播放器技术实现时出错', e);
            }
            if (!techValid && !this.videoElement) {
                return { bufferAhead: 0, totalBuffered: 0 };
            }
            // 安全获取当前播放时间
            let currentTime = 0;
            try {
                if (techValid && this.player && typeof this.player.currentTime === 'function') {
                    currentTime = this.player.currentTime() || 0;
                }
                else if (this.videoElement) {
                    currentTime = this.videoElement.currentTime || 0;
                }
            }
            catch (e) {
                console.error('缓冲管理器: 获取当前播放时间失败', e);
                if (this.videoElement) {
                    currentTime = this.videoElement.currentTime || 0;
                }
            }
            // 安全获取缓冲区
            let buffered = null;
            try {
                if (this.player && typeof this.player.buffered === 'function') {
                    buffered = this.player.buffered();
                }
                else if (this.videoElement) {
                    buffered = this.videoElement.buffered;
                }
            }
            catch (e) {
                console.error('缓冲管理器: 获取缓冲区信息失败', e);
                if (this.videoElement) {
                    buffered = this.videoElement.buffered;
                }
            }
            if (!buffered || buffered.length === 0) {
                return { bufferAhead: 0, totalBuffered: 0 };
            }
            let bufferAhead = 0;
            let totalBuffered = 0;
            try {
                // 计算总缓冲量
                for (let i = 0; i < buffered.length; i++) {
                    const start = buffered.start(i) || 0;
                    const end = buffered.end(i) || 0;
                    totalBuffered += end - start;
                    // 找到当前播放位置所在的缓冲区间
                    if (currentTime >= start && currentTime <= end) {
                        bufferAhead = end - currentTime;
                    }
                }
            }
            catch (e) {
                console.error('缓冲管理器: 计算缓冲量失败', e);
            }
            return { bufferAhead, totalBuffered };
        }
        catch (e) {
            console.error('缓冲管理器: 获取缓冲信息失败', e);
            return { bufferAhead: 0, totalBuffered: 0 };
        }
    }
    // 获取前方缓冲秒数
    getBufferAhead() {
        return this.getBufferInfo().bufferAhead;
    }
    // 因缓冲不足暂停播放
    pauseForBuffering() {
        // 多重检查确保安全
        if (this.isDisposed)
            return;
        if (!this.player)
            return;
        if (!this.isPlayerValid())
            return;
        // 验证player的技术实现是否有效
        let techValid = false;
        try {
            if (this.player.tech && typeof this.player.tech === 'function') {
                const tech = this.player.tech(true);
                techValid = !!(tech && tech.el_);
            }
        }
        catch (e) {
            console.error('缓冲管理器: 验证播放器技术实现时出错', e);
            return; // 如果技术实现无效，直接返回
        }
        if (!techValid) {
            console.log('缓冲管理器: 播放器技术实现无效，跳过暂停操作');
            return;
        }
        try {
            // 检查是否已经暂停
            let isAlreadyPaused = false;
            try {
                if (this.player && typeof this.player.paused === 'function') {
                    isAlreadyPaused = this.player.paused();
                }
                else if (this.videoElement) {
                    isAlreadyPaused = this.videoElement.paused;
                }
            }
            catch (e) {
                console.error('缓冲管理器: 获取播放状态失败', e);
                return; // 如果无法确定状态，不执行暂停
            }
            if (isAlreadyPaused || this.pausedForBuffering)
                return;
            // 保存当前播放速度
            if (this.player && this.player.playbackRate && typeof this.player.playbackRate === 'function') {
                this.lastPlaybackRate = this.player.playbackRate() || 1;
            }
            // 暂停播放器
            if (this.player && typeof this.player.pause === 'function') {
                this.player.pause();
            }
            this.pausedForBuffering = true;
            this.isBuffering = true;
            this.onBufferingChange(true);
            // 创建缓冲指示器
            this.createBufferingIndicator();
            // 设置超时保护，防止长时间无法恢复
            this.loadingTimeout = window.setTimeout(() => {
                if (this.pausedForBuffering) {
                    console.log('缓冲管理器：缓冲超时，强制恢复播放');
                    this.resumeFromBuffering();
                }
            }, 15000); // 15秒后强制恢复
        }
        catch (e) {
            console.error('缓冲管理器：暂停播放失败', e);
        }
    }
    // 从缓冲暂停中恢复
    resumeFromBuffering() {
        if (!this.isPlayerValid() || !this.pausedForBuffering)
            return;
        try {
            // 清除超时定时器
            if (this.loadingTimeout) {
                clearTimeout(this.loadingTimeout);
                this.loadingTimeout = null;
            }
            // 移除缓冲指示器
            this.removeBufferingIndicator();
            // 恢复播放
            if (this.player && typeof this.player.play === 'function') {
                const playPromise = this.player.play();
                if (playPromise !== undefined && typeof playPromise.catch === 'function') {
                    playPromise.catch((err) => {
                        console.error('缓冲管理器: 恢复播放失败', err);
                    });
                }
            }
            // 恢复播放速度
            this.adjustPlaybackRate(this.lastPlaybackRate);
            this.pausedForBuffering = false;
            this.isBuffering = false;
            this.onBufferingChange(false);
            console.log('缓冲管理器: 已从缓冲暂停中恢复播放');
        }
        catch (e) {
            console.error('缓冲管理器: 恢复播放失败', e);
        }
    }
    // 调整播放速度
    adjustPlaybackRate(rate) {
        if (!this.player || !this.player.playbackRate || typeof this.player.playbackRate !== 'function') {
            return;
        }
        try {
            const currentRate = this.player.playbackRate();
            // 仅在需要改变时设置
            if (currentRate !== rate) {
                if (rate < 1 && currentRate >= 1) {
                    // 保存原始速度
                    this.lastPlaybackRate = currentRate;
                }
                this.player.playbackRate(rate);
            }
        }
        catch (e) {
            console.error('缓冲管理器：调整播放速度失败', e);
        }
    }
    // 创建缓冲指示器
    createBufferingIndicator() {
        try {
            if (!this.player || !this.player.el)
                return;
            // 移除可能已存在的指示器
            this.removeBufferingIndicator();
            const bufferingText = document.createElement('div');
            bufferingText.className = 'vjs-buffering-text';
            bufferingText.textContent = '正在缓冲...';
            bufferingText.style.position = 'absolute';
            bufferingText.style.top = '50%';
            bufferingText.style.left = '50%';
            bufferingText.style.transform = 'translate(-50%, -50%)';
            bufferingText.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
            bufferingText.style.color = 'white';
            bufferingText.style.padding = '10px 20px';
            bufferingText.style.borderRadius = '5px';
            bufferingText.style.zIndex = '100';
            // 添加到播放器元素中
            this.player.el().appendChild(bufferingText);
        }
        catch (e) {
            console.error('缓冲管理器：创建缓冲指示器失败', e);
        }
    }
    // 移除缓冲指示器
    removeBufferingIndicator() {
        try {
            if (!this.player || !this.player.el)
                return;
            const bufferElement = this.player.el().querySelector('.vjs-buffering-text');
            if (bufferElement) {
                bufferElement.remove();
            }
        }
        catch (e) {
            console.error('缓冲管理器：移除缓冲指示器失败', e);
        }
    }
    // 执行预加载操作 - 双线程系统
    performPreload() {
        if (!this.player || !this.videoElement || this.isLoading)
            return;
        try {
            const currentTime = this.player.currentTime();
            const duration = this.player.duration();
            const bufferInfo = this.getBufferInfo();
            if (!duration || currentTime >= duration)
                return;
            // 计算需要预加载的范围
            const preloadStart = currentTime + bufferInfo.bufferAhead;
            const preloadEnd = Math.min(currentTime + this.bufferTarget, duration);
            const neededBuffer = preloadEnd - preloadStart;
            if (neededBuffer > this.preloadBuffer) {
                this.triggerBackgroundLoad(preloadStart, preloadEnd);
            }
        }
        catch (e) {
            console.error('预加载线程失败:', e);
        }
    }
    // 触发后台加载
    triggerBackgroundLoad(start, end) {
        if (!this.videoElement)
            return;
        try {
            // 使用Range请求预加载内容
            const preloadWorker = new Worker(URL.createObjectURL(new Blob([
                `
          self.onmessage = function(e) {
            const {url, start, end} = e.data;
            const xhr = new XMLHttpRequest();
            xhr.open('GET', url, true);
            xhr.setRequestHeader('Range', bytes=${start * 1000}-${end * 1000});
            xhr.responseType = 'arraybuffer';
            xhr.onload = () => {
              self.postMessage({success: true, size: xhr.response.byteLength});
            };
            xhr.onerror = () => {
              self.postMessage({success: false});
            };
            xhr.send();
          };
        `
            ])));
            preloadWorker.postMessage({
                url: this.videoElement.src,
                start: start,
                end: end
            });
            preloadWorker.onmessage = (e) => {
                if (e.data.success) {
                }
                preloadWorker.terminate();
            };
        }
        catch (e) {
            console.log('Web Workers不支持，使用备用预加载策略');
            this.fallbackPreload(start, end);
        }
    }
    // 备用预加载策略
    fallbackPreload(start, end) {
        try {
            // 创建隐藏的video元素进行预加载
            const preloadVideo = document.createElement('video');
            preloadVideo.src = this.videoElement?.src || '';
            preloadVideo.preload = 'auto';
            preloadVideo.currentTime = start;
            preloadVideo.style.display = 'none';
            document.body.appendChild(preloadVideo);
            preloadVideo.load();
            setTimeout(() => {
                document.body.removeChild(preloadVideo);
            }, 5000);
        }
        catch (e) {
            console.error('备用预加载失败:', e);
        }
    }
    // 高级缓冲检查 - 自适应策略
    checkBuffer() {
        if (this.isDisposed || !this.isPlayerValid())
            return;
        try {
            const { bufferAhead, totalBuffered } = this.getBufferInfo();
            const currentTime = this.getCurrentTime();
            const duration = this.getDuration();
            // 记录缓冲历史
            this.recordBufferHistory(currentTime, bufferAhead);
            // 自适应缓冲策略
            if (this.adaptiveBufferStrategy) {
                this.applyAdaptiveStrategy(bufferAhead, totalBuffered);
            }
            else {
                this.applyStandardStrategy(bufferAhead);
            }
            // 更新UI
            this.onBufferUpdate(bufferAhead, totalBuffered);
        }
        catch (e) {
            console.error('高级缓冲检查失败:', e);
        }
    }
    // 记录缓冲历史用于分析
    recordBufferHistory(currentTime, bufferAhead) {
        this.bufferHistory.push({ time: Date.now(), bufferAhead });
        // 保持历史记录在合理范围内
        if (this.bufferHistory.length > 100) {
            this.bufferHistory.shift();
        }
    }
    // 自适应缓冲策略
    applyAdaptiveStrategy(bufferAhead, totalBuffered) {
        try {
            const isPaused = this.isPlayerPaused();
            // 分析缓冲趋势
            const recentHistory = this.bufferHistory.slice(-10);
            const avgBuffer = recentHistory.reduce((sum, h) => sum + h.bufferAhead, 0) / recentHistory.length;
            const trend = recentHistory.length > 1 ?
                recentHistory[recentHistory.length - 1].bufferAhead - recentHistory[0].bufferAhead : 0;
            // 动态调整策略
            if (avgBuffer < this.minPlayBuffer && !isPaused) {
                // 缓冲不足，暂停播放
                this.pauseForBuffering();
            }
            else if (this.pausedForBuffering && avgBuffer >= this.minPlayBuffer * 1.5) {
                // 缓冲充足，恢复播放
                this.resumeFromBuffering();
            }
            else if (trend < -2 && avgBuffer < 20) {
                // 缓冲消耗过快，降低播放速度
                this.adjustPlaybackRate(0.9);
            }
            else if (trend > 2 && avgBuffer > 30) {
                // 缓冲积累良好，恢复速度
                this.adjustPlaybackRate(this.lastPlaybackRate);
            }
        }
        catch (e) {
            console.error('自适应策略失败:', e);
        }
    }
    // 标准缓冲策略
    applyStandardStrategy(bufferAhead) {
        try {
            const isPaused = this.isPlayerPaused();
            if (bufferAhead < this.minPlayBuffer && !isPaused) {
                console.log(`标准策略: 缓冲不足 ${bufferAhead.toFixed(2)}s，暂停播放`);
                this.pauseForBuffering();
            }
            else if (bufferAhead >= this.minPlayBuffer && this.pausedForBuffering) {
                console.log(`标准策略: 缓冲充足 ${bufferAhead.toFixed(2)}s，恢复播放`);
                this.resumeFromBuffering();
            }
        }
        catch (e) {
            console.error('标准策略失败:', e);
        }
    }
    // 获取当前播放时间
    getCurrentTime() {
        try {
            if (this.player && typeof this.player.currentTime === 'function') {
                return this.player.currentTime() || 0;
            }
            return this.videoElement?.currentTime || 0;
        }
        catch (e) {
            console.error('获取当前时间失败:', e);
            return 0;
        }
    }
    // 获取视频总时长
    getDuration() {
        try {
            if (this.player && typeof this.player.duration === 'function') {
                return this.player.duration() || 0;
            }
            return this.videoElement?.duration || 0;
        }
        catch (e) {
            console.error('获取总时长失败:', e);
            return 0;
        }
    }
    // 检查是否暂停
    isPlayerPaused() {
        try {
            if (this.player && typeof this.player.paused === 'function') {
                return this.player.paused();
            }
            return this.videoElement?.paused || true;
        }
        catch (e) {
            console.error('检查暂停状态失败:', e);
            return true;
        }
    }
    // 增强的缓冲状态检查
    getBufferInfo() {
        if (this.isDisposed) {
            return { bufferAhead: 0, totalBuffered: 0 };
        }
        try {
            if (!this.player)
                return { bufferAhead: 0, totalBuffered: 0 };
            const currentTime = this.getCurrentTime();
            let bufferAhead = 0;
            let totalBuffered = 0;
            // 获取缓冲区信息
            let buffered = null;
            try {
                if (this.player && typeof this.player.buffered === 'function') {
                    buffered = this.player.buffered();
                }
                else if (this.videoElement) {
                    buffered = this.videoElement.buffered;
                }
            }
            catch (e) {
                console.error('获取缓冲区失败:', e);
            }
            if (!buffered || buffered.length === 0) {
                return { bufferAhead: 0, totalBuffered: 0 };
            }
            // 计算缓冲信息
            for (let i = 0; i < buffered.length; i++) {
                try {
                    const start = buffered.start(i) || 0;
                    const end = buffered.end(i) || 0;
                    totalBuffered += end - start;
                    if (currentTime >= start && currentTime <= end) {
                        bufferAhead = end - currentTime;
                    }
                }
                catch (e) {
                    console.error(`计算缓冲区段 ${i} 失败:`, e);
                }
            }
            return { bufferAhead, totalBuffered };
        }
        catch (e) {
            console.error('获取缓冲信息失败:', e);
            return { bufferAhead: 0, totalBuffered: 0 };
        }
    }
    // 清理资源
    dispose() {
        if (this.isDisposed)
            return;
        this.isDisposed = true;
        // 停止所有定时器
        this.stopBufferCheck();
        this.stopPreloadThread();
        // 清理Web Workers
        if (this.preloadWorker) {
            this.preloadWorker.terminate();
            this.preloadWorker = null;
        }
        // 移除事件监听器
        try {
            if (this.player && typeof this.player.off === 'function') {
                this.player.off('waiting', this.handleWaiting.bind(this));
                this.player.off('canplay', this.handleCanPlay.bind(this));
                this.player.off('progress', this.handleProgress.bind(this));
            }
        }
        catch (e) {
            // 静默处理
        }
        this.player = null;
        this.videoElement = null;
        this.bufferHistory = [];
    }
    // 停止预加载线程
    stopPreloadThread() {
        if (this.preloadInterval) {
            clearInterval(this.preloadInterval);
            this.preloadInterval = null;
        }
    }
}
// VideoJS播放器组件
const Player = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const { token, userId, getApiClient, isLoggedIn, username, login, logout } = useEmbyStore();
    const { servers, activeServerId, setActiveServer } = useServerStore(); // 添加state
    const [serverUrl, setServerUrl] = useState('');
    const videoContainerRef = useRef(null);
    // 不再将videoElementRef作为React ref，而是普通变量，避免只读问题
    const videoElementRef = { current: null };
    const playerRef = useRef(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [retryCount, setRetryCount] = useState(0);
    const [buffering, setBuffering] = useState(false);
    const [currentFormat, setCurrentFormat] = useState(0); // 0=直连
    const playerInitializedRef = useRef(false);
    // 播放信息状态
    const [itemInfo, setItemInfo] = useState(null);
    const [isEpisode, setIsEpisode] = useState(false);
    const [seasonId, setSeasonId] = useState(null);
    const [seriesId, setSeriesId] = useState(null);
    const [seasons, setSeasons] = useState([]);
    const [currentEpisode, setCurrentEpisode] = useState(null);
    const [drawerVisible, setDrawerVisible] = useState(false);
    const [episodesLoading, setEpisodesLoading] = useState(false);
    // 优化缓冲状态显示
    const [showLoadingIndicator, setShowLoadingIndicator] = useState(true);
    const [bufferingMessage, setBufferingMessage] = useState(null);
    // 新增状态 - 三层布局
    const [infoCollapsed, setInfoCollapsed] = useState(false);
    const [mediaStreams, setMediaStreams] = useState([]);
    const [selectedStream, setSelectedStream] = useState('auto');
    const [episodesList, setEpisodesList] = useState([]);
    // 添加缺失的状态变量
    const [playbackError, setPlaybackError] = useState(false);
    const [errorRetry, setErrorRetry] = useState(false);
    const [streamUrl, setStreamUrl] = useState('');
    const [mediaSource, setMediaSource] = useState(null);
    const [isPlaying, setIsPlaying] = useState(false); // 添加新状态变量
    // 添加禁用自动尝试的状态
    const [autoRetryDisabled, setAutoRetryDisabled] = useState(true); // 默认禁用自动尝试
    // 添加字幕流状态
    const [subtitleStreams, setSubtitleStreams] = useState([]);
    const [subtitleUrls, setSubtitleUrls] = useState({});
    const [currentSubtitleIndex, setCurrentSubtitleIndex] = useState(null);
    // 缓冲管理相关状态
    const [bufferAhead, setBufferAhead] = useState(0);
    const [totalBuffered, setTotalBuffered] = useState(0);
    const bufferManagerRef = useRef(null);
    // 添加推荐内容状态
    const [recommendedItems, setRecommendedItems] = useState([]);
    const [recommendedLoading, setRecommendedLoading] = useState(false);
    // 获取服务器URL
    useEffect(() => {
        // 从localStorage获取服务器URL
        const savedServerUrl = localStorage.getItem('emby_serverUrl');
        if (savedServerUrl) {
            setServerUrl(savedServerUrl);
        }
        // 添加存储事件监听器，当localStorage变化时更新URL
        const handleStorageChange = (e) => {
            if (e.key === 'emby_serverUrl' && e.newValue) {
                console.log('检测到服务器URL变更:', e.newValue);
                setServerUrl(e.newValue);
                // 重置播放器状态
                playerInitializedRef.current = false;
                if (playerRef.current) {
                    playerRef.current.dispose();
                    playerRef.current = null;
                }
                // 重新获取媒体信息
                if (id) {
                    fetchPlaybackInfo(id);
                }
            }
        };
        // 监听storage事件
        window.addEventListener('storage', handleStorageChange);
        // 清理函数
        return () => {
            window.removeEventListener('storage', handleStorageChange);
        };
    }, [id]);
    // 添加一个同步函数，主动检查服务器URL和token是否有变化
    const syncServerUrl = () => {
        const currentServerUrl = localStorage.getItem('emby_serverUrl');
        const currentToken = localStorage.getItem('emby_token');
        let needsRefresh = false;
        if (currentServerUrl && currentServerUrl !== serverUrl) {
            console.log('服务器URL不同步，更新前:', serverUrl, '更新后:', currentServerUrl);
            setServerUrl(currentServerUrl);
            needsRefresh = true;
        }
        if (currentToken && currentToken !== token && token) {
            console.log('Token不同步，需要更新');
            // 这里不直接设置token，因为通常需要通过正规登录流程获取
            // 但是标记需要刷新
            needsRefresh = true;
        }
        // 如果需要刷新，执行完整的重新初始化
        if (needsRefresh) {
            // 重置播放器状态
            playerInitializedRef.current = false;
            if (playerRef.current) {
                playerRef.current.dispose();
                playerRef.current = null;
            }
            // 清除错误状态
            setError(null);
            setLoading(true);
            // 重新获取媒体信息和初始化播放器
            if (id) {
                message.info('检测到服务器/授权信息变更，正在重新加载...');
                fetchPlaybackInfo(id);
            }
        }
        return needsRefresh;
    };
    // 重置播放器状态
    const resetPlayerState = useCallback(() => {
        console.log('重置播放器状态');
        setItemInfo(null);
        setIsEpisode(false);
        setSeasonId(null);
        setSeriesId(null);
        setCurrentEpisode(null);
        // 保留seasons数据以避免重复加载
    }, []);
    // 每次ID变化时重置状态
    useEffect(() => {
        console.log('ID变化，重置播放器状态，新ID:', id);
        resetPlayerState();
        // 重置错误状态
        setError(null);
        setRetryCount(0);
        // 重置推荐内容状态，以便在新的ID下重新获取
        setRecommendedItems([]);
        setRecommendedLoading(false);
    }, [id, resetPlayerState]);
    // 全局错误处理
    useEffect(() => {
        // 添加全局未捕获错误处理
        const handleGlobalError = (event) => {
            console.error('全局错误:', event.error || event.message);
            // 检查是否为播放器相关错误
            if (event.message && (event.message.includes('video') ||
                event.message.includes('player') ||
                event.message.includes('videojs'))) {
                setError(`播放器错误: ${event.message}`);
            }
        };
        // 添加Promise未处理的rejection处理
        const handleUnhandledRejection = (event) => {
            console.error('未处理的Promise拒绝:', event.reason);
            // 检查是否为API或网络错误
            if (event.reason && ((typeof event.reason === 'object' && event.reason.message &&
                (event.reason.message.includes('network') ||
                    event.reason.message.includes('api') ||
                    event.reason.message.includes('fetch'))))) {
                setError(`网络错误: ${event.reason.message || '请检查网络连接'}`);
            }
        };
        window.addEventListener('error', handleGlobalError);
        window.addEventListener('unhandledrejection', handleUnhandledRejection);
        return () => {
            window.removeEventListener('error', handleGlobalError);
            window.removeEventListener('unhandledrejection', handleUnhandledRejection);
        };
    }, []);
    // 返回上一页
    const handleBack = () => {
        // 确保在离开页面前停止并清理播放器
        if (playerRef.current) {
            try {
                playerRef.current.pause();
                playerRef.current.dispose();
                playerRef.current = null;
            }
            catch (e) {
                console.error('返回时清理播放器失败:', e);
            }
        }
        navigate(-1);
    };
    // 恢复键盘事件处理函数 - 增强版
    const handleKeyDown = (e) => {
        if (!playerRef.current)
            return;
        switch (e.key) {
            case ' ':
            case 'k':
            case 'K':
                // 空格键或K键暂停/播放
                if (playerRef.current.paused()) {
                    playerRef.current.play();
                }
                else {
                    playerRef.current.pause();
                }
                e.preventDefault();
                break;
            case 'ArrowRight':
                // 右箭头 - 根据修饰键调整快进秒数
                const rightStep = e.ctrlKey ? 60 : e.shiftKey ? 30 : 10;
                const newTime = Math.min(playerRef.current.currentTime() + rightStep, playerRef.current.duration() || Infinity);
                playerRef.current.currentTime(newTime);
                showSeekFeedback(`快进 ${rightStep} 秒`);
                e.preventDefault();
                break;
            case 'ArrowLeft':
                // 左箭头 - 根据修饰键调整后退秒数
                const leftStep = e.ctrlKey ? 60 : e.shiftKey ? 30 : 10;
                const prevTime = Math.max(playerRef.current.currentTime() - leftStep, 0);
                playerRef.current.currentTime(prevTime);
                showSeekFeedback(`后退 ${leftStep} 秒`);
                e.preventDefault();
                break;
            case 'ArrowUp':
                // 上箭头增加音量
                const newVolume = Math.min(playerRef.current.volume() + 0.1, 1);
                playerRef.current.volume(newVolume);
                showVolumeFeedback(`音量 ${Math.round(newVolume * 100)}%`);
                e.preventDefault();
                break;
            case 'ArrowDown':
                // 下箭头减小音量
                const lowerVolume = Math.max(playerRef.current.volume() - 0.1, 0);
                playerRef.current.volume(lowerVolume);
                showVolumeFeedback(`音量 ${Math.round(lowerVolume * 100)}%`);
                e.preventDefault();
                break;
            case 'l':
            case 'L':
                // L键前进10秒
                const lTime = Math.min(playerRef.current.currentTime() + 10, playerRef.current.duration() || Infinity);
                playerRef.current.currentTime(lTime);
                showSeekFeedback('快进 10 秒');
                e.preventDefault();
                break;
            case 'j':
            case 'J':
                // J键后退10秒
                const jTime = Math.max(playerRef.current.currentTime() - 10, 0);
                playerRef.current.currentTime(jTime);
                showSeekFeedback('后退 10 秒');
                e.preventDefault();
                break;
            case 'Home':
                // Home键回到开头
                playerRef.current.currentTime(0);
                showSeekFeedback('回到开头');
                e.preventDefault();
                break;
            case 'End':
                // End键跳到结尾
                const duration = playerRef.current.duration();
                if (duration) {
                    playerRef.current.currentTime(duration);
                    showSeekFeedback('跳到结尾');
                }
                e.preventDefault();
                break;
            case 'n':
            case 'N':
                // N键播放下一集
                if (isEpisode)
                    playNextEpisode();
                break;
            case 'p':
            case 'P':
                // P键播放上一集
                if (isEpisode)
                    playPreviousEpisode();
                break;
            case 'f':
            case 'F':
                // F键全屏
                if (playerRef.current.isFullscreen()) {
                    playerRef.current.exitFullscreen();
                }
                else {
                    playerRef.current.requestFullscreen();
                }
                e.preventDefault();
                break;
            case 'm':
            case 'M':
                // M键静音/取消静音
                playerRef.current.muted(!playerRef.current.muted());
                showVolumeFeedback(playerRef.current.muted() ? '已静音' : '已取消静音');
                e.preventDefault();
                break;
            case '0':
            case '1':
            case '2':
            case '3':
            case '4':
            case '5':
            case '6':
            case '7':
            case '8':
            case '9':
                // 数字键跳转到视频进度的百分比
                const percent = parseInt(e.key) * 10;
                const duration = playerRef.current.duration();
                if (duration) {
                    const targetTime = (duration * percent) / 100;
                    playerRef.current.currentTime(targetTime);
                    showSeekFeedback(`跳转到 ${percent}%`);
                }
                e.preventDefault();
                break;
        }
    };
    // 尝试重新加载视频
    const handleRetry = () => {
        setLoading(true);
        setError(null);
        setRetryCount(count => count + 1);
        playerInitializedRef.current = false;
        if (playerRef.current) {
            try {
                playerRef.current.dispose();
                playerRef.current = null;
            }
            catch (e) {
                console.error('清理播放器失败:', e);
            }
        }
        // 短暂延迟后初始化，重新开始计数
        setTimeout(() => {
            initializePlayer(0);
        }, 500);
    };
    // 恢复原始getStreamUrl函数，支持多种格式
    const getStreamUrl = (mediaSourceId, itemId) => {
        // 始终获取最新的服务器URL和token
        const currentServerUrl = localStorage.getItem('emby_serverUrl') || serverUrl;
        const currentToken = localStorage.getItem('emby_token') || token;
        if (!currentServerUrl || !currentToken || !mediaSourceId || !itemId) {
            console.error('构建视频URL失败: 缺少必要参数', {
                serverUrl: !!currentServerUrl,
                token: !!currentToken,
                mediaSourceId: !!mediaSourceId,
                itemId: !!itemId
            });
            return '';
        }
        // 确保URL格式正确
        const baseUrl = currentServerUrl.endsWith('/')
            ? currentServerUrl.substring(0, currentServerUrl.length - 1)
            : currentServerUrl;
        // 仅使用直连模式
        const url = `${baseUrl}/Videos/${itemId}/stream?api_key=${currentToken}&Static=true&MediaSourceId=${mediaSourceId}`;
        console.log(`生成视频URL: ${url}`);
        return url;
    };
    // 获取当前媒体项信息
    useEffect(() => {
        const fetchItemInfo = async () => {
            if (!id) {
                setError('缺少媒体项ID');
                return;
            }
            if (!serverUrl || !token) {
                setLoading(false);
                return;
            }
            try {
                const apiClient = getApiClient();
                const response = await apiClient.get(`/Users/${userId}/Items/${id}`);
                if (response.data) {
                    const item = response.data;
                    setItemInfo(item);
                    if (item.Type === 'Episode') {
                        setIsEpisode(true);
                        setSeasonId(item.SeasonId);
                        setSeriesId(item.SeriesId);
                        setCurrentEpisode({
                            Id: item.Id,
                            Name: item.Name,
                            IndexNumber: item.IndexNumber,
                            SeasonId: item.SeasonId,
                            SeriesId: item.SeriesId,
                            SeasonName: item.SeasonName,
                            SeriesName: item.SeriesName,
                            Overview: item.Overview,
                            RunTimeTicks: item.RunTimeTicks,
                            ParentIndexNumber: item.ParentIndexNumber
                        });
                        await fetchEpisodesForSeason(item.SeasonId);
                    }
                    fetchPlaybackInfo(item.Id);
                    if (!recommendedItems.length && !recommendedLoading) {
                        fetchRecommendedItems();
                    }
                }
            }
            catch (error) {
                setLoading(false);
            }
        };
        if (id) {
            fetchItemInfo();
        }
    }, [id, serverUrl, token, userId, getApiClient, recommendedItems.length, recommendedLoading]);
    // 获取播放信息和媒体流
    const fetchPlaybackInfo = async (itemId) => {
        const currentServerUrl = localStorage.getItem('emby_serverUrl') || serverUrl;
        const currentToken = token;
        if (!currentServerUrl || !currentToken || !itemId) {
            setLoading(false);
            return;
        }
        if (currentServerUrl !== serverUrl) {
            setServerUrl(currentServerUrl);
        }
        try {
            const apiClient = getApiClient();
            const response = await apiClient.post(`${currentServerUrl}/emby/Items/${itemId}/PlaybackInfo`, {
                UserId: userId,
                DeviceProfile: {
                    MaxStreamingBitrate: 120000000,
                    DirectPlayProfiles: [
                        { Type: 'Video', Container: 'mp4,mkv', VideoCodec: 'h264,hevc,mpeg4' },
                        { Type: 'Audio' }
                    ],
                    TranscodingProfiles: [
                        { Type: 'Video', Container: 'ts', Protocol: 'hls', VideoCodec: 'h264' },
                        { Type: 'Video', Container: 'mp4', VideoCodec: 'h264' },
                        { Type: 'Audio' }
                    ]
                }
            }, {
                params: { api_key: currentToken }
            });
            if (response.data && response.data.MediaSources && response.data.MediaSources.length > 0) {
                const mediaSourceData = response.data.MediaSources[0];
                setMediaSource(mediaSourceData);
                const streams = [];
                streams.push({
                    id: 'auto',
                    name: '自动',
                    bitrate: 0,
                    url: getStreamUrl(mediaSourceData.Id, itemId)
                });
                streams.push({
                    id: 'direct',
                    name: '直连',
                    bitrate: mediaSourceData.Bitrate || 0,
                    url: getStreamUrl(mediaSourceData.Id, itemId)
                });
                streams.push({
                    id: 'hls',
                    name: 'HLS流',
                    bitrate: mediaSourceData.Bitrate || 0,
                    url: getStreamUrl(mediaSourceData.Id, itemId)
                });
                streams.push({
                    id: 'mp4',
                    name: 'MP4转码',
                    bitrate: mediaSourceData.Bitrate || 0,
                    url: getStreamUrl(mediaSourceData.Id, itemId)
                });
                setMediaStreams(streams);
                if (mediaSourceData.MediaStreams) {
                    const subtitleStreams = mediaSourceData.MediaStreams.filter((stream) => stream.Type === 'Subtitle');
                    if (subtitleStreams.length > 0) {
                        setSubtitleStreams(subtitleStreams);
                        fetchSubtitles(itemId, subtitleStreams);
                    }
                }
            }
        }
        catch (error) {
            if (error.response && error.response.status === 401) {
                handle401Error(error);
            }
            else {
                setLoading(false);
            }
        }
    };
    // 获取指定季的所有剧集
    const fetchEpisodesForSeason = async (seasonId) => {
        if (!seasonId || !token || !userId)
            return;
        const currentServerUrl = localStorage.getItem('emby_serverUrl') || serverUrl;
        if (!currentServerUrl)
            return;
        try {
            setEpisodesLoading(true);
            const apiClient = getApiClient();
            const response = await apiClient.get(`${currentServerUrl}/emby/Shows/${seasonId}/Episodes`, {
                params: {
                    userId: userId,
                    api_key: token,
                    fields: 'Overview,Path',
                    enableImageTypes: 'Primary',
                    limit: 100
                }
            });
            if (!response.data || !response.data.Items) {
                await fetchEpisodesAlternative(seasonId);
                return;
            }
            const episodes = response.data.Items.map((item) => ({
                Id: item.Id,
                Name: item.Name,
                IndexNumber: item.IndexNumber,
                SeasonId: item.SeasonId,
                SeriesId: item.SeriesId,
                SeasonName: item.SeasonName,
                SeriesName: item.SeriesName,
                Overview: item.Overview,
                RunTimeTicks: item.RunTimeTicks,
                ParentIndexNumber: item.ParentIndexNumber
            }));
            episodes.sort((a, b) => (a.IndexNumber || 0) - (b.IndexNumber || 0));
            setEpisodesList(episodes);
        }
        catch (error) {
            await fetchEpisodesAlternative(seasonId);
        }
        finally {
            setEpisodesLoading(false);
        }
    };
    // 备用方法获取剧集
    const fetchEpisodesAlternative = async (seasonId) => {
        try {
            // 确保使用最新的服务器URL
            const currentServerUrl = localStorage.getItem('emby_serverUrl') || serverUrl;
            if (!currentServerUrl) {
                console.error('未找到服务器URL，无法获取剧集');
                return;
            }
            console.log('使用通用Items接口获取剧集，服务器:', currentServerUrl, 'seasonId:', seasonId);
            const apiClient = getApiClient();
            const response = await apiClient.get(`${currentServerUrl}/emby/Items`, {
                params: {
                    userId: userId,
                    parentId: seasonId,
                    includeItemTypes: 'Episode',
                    recursive: true,
                    sortBy: 'SortName',
                    sortOrder: 'Ascending',
                    fields: 'Overview,Path',
                    api_key: token
                }
            });
            if (response.data && response.data.Items && response.data.Items.length > 0) {
                const episodes = response.data.Items.map((item) => ({
                    Id: item.Id,
                    Name: item.Name,
                    IndexNumber: item.IndexNumber,
                    SeasonId: item.SeasonId || seasonId,
                    SeriesId: item.SeriesId,
                    SeasonName: item.SeasonName,
                    SeriesName: item.SeriesName,
                    Overview: item.Overview,
                    RunTimeTicks: item.RunTimeTicks,
                    ParentIndexNumber: item.ParentIndexNumber
                }));
                episodes.sort((a, b) => (a.IndexNumber || 0) - (b.IndexNumber || 0));
                console.log(`备用方法获取到 ${episodes.length} 集剧集`);
                setEpisodesList(episodes);
            }
            else {
                console.error('备用方法获取剧集失败');
                message.error('获取剧集列表失败');
            }
        }
        catch (error) {
            console.error('备用方法获取剧集失败:', error);
            message.error('获取剧集列表失败');
        }
    };
    // 切换到指定剧集
    const switchToEpisode = (episode) => {
        if (!episode || !episode.Id)
            return;
        console.log('切换到剧集:', episode.Name, 'ID:', episode.Id);
        // 重置错误状态，防止错误提示跟随到新剧集
        setError(null);
        setIsPlaying(false);
        setPlaybackError(false);
        // 设置一个临时标记，避免在剧集加载过程中显示错误
        localStorage.setItem('switching_episode', 'true');
        // 延长切换标记的清除时间，确保有足够时间完成切换
        setTimeout(() => {
            localStorage.removeItem('switching_episode');
        }, 10000); // 从3秒增加到10秒
        // 停止当前播放
        if (playerRef.current) {
            try {
                playerRef.current.pause();
            }
            catch (e) {
                console.error('暂停播放器失败:', e);
            }
        }
        // 导航到新剧集
        navigate(`/player/${episode.Id}`, { replace: true });
    };
    // 播放下一集
    const playNextEpisode = () => {
        if (!isEpisode || !currentEpisode || !episodesList || episodesList.length === 0) {
            console.log('无法播放下一集，当前不是剧集或未加载剧集列表');
            return;
        }
        // 找到当前剧集的索引
        const currentIndex = episodesList.findIndex(ep => ep.Id === currentEpisode.Id);
        if (currentIndex === -1) {
            console.error('当前剧集不在列表中');
            return;
        }
        // 检查是否有下一集
        if (currentIndex < episodesList.length - 1) {
            const nextEpisode = episodesList[currentIndex + 1];
            console.log('播放下一集:', nextEpisode.Name);
            switchToEpisode(nextEpisode);
        }
        else {
            console.log('已经是最后一集');
            message.info('已经是最后一集了');
        }
    };
    // 播放上一集
    const playPreviousEpisode = () => {
        if (!isEpisode || !currentEpisode || !episodesList || episodesList.length === 0) {
            console.log('无法播放上一集，当前不是剧集或未加载剧集列表');
            return;
        }
        // 找到当前剧集的索引
        const currentIndex = episodesList.findIndex(ep => ep.Id === currentEpisode.Id);
        if (currentIndex === -1) {
            console.error('当前剧集不在列表中');
            return;
        }
        // 检查是否有上一集
        if (currentIndex > 0) {
            const prevEpisode = episodesList[currentIndex - 1];
            console.log('播放上一集:', prevEpisode.Name);
            switchToEpisode(prevEpisode);
        }
        else {
            console.log('已经是第一集');
            message.info('已经是第一集了');
        }
    };
    // 视频类型获取
    const getVideoType = () => {
        // 直连模式使用MP4类型
        return 'video/mp4';
    };
    // 修改播放器初始化的部分，确保正确处理各种格式
    const initializePlayerConfig = () => {
        // 基本播放器配置
        const videoUrl = getStreamUrl(mediaSource?.Id, id);
        const videoType = getVideoType();
        setStreamUrl(videoUrl);
        const config = {
            autoplay: true,
            controls: true,
            responsive: true,
            fluid: true,
            width: '100%',
            height: '100%',
            sources: [{
                    src: videoUrl,
                    type: videoType
                }],
            html5: {
                nativeVideoTracks: true,
                nativeAudioTracks: true,
                nativeTextTracks: true,
                hls: {
                    overrideNative: Hls.isSupported(),
                    enableLowInitialPlaylist: true,
                    smoothQualityChange: true,
                    handlePartialData: true
                },
                vhs: {
                    overrideNative: Hls.isSupported(),
                    enableLowInitialPlaylist: true,
                    smoothQualityChange: true,
                    handlePartialData: true
                }
            },
            techOrder: ['html5'],
            liveui: false,
            errorDisplay: true,
            loadingSpinner: true,
            preload: 'auto',
            controlBar: {
                volumePanel: {
                    inline: false,
                    vertical: true
                },
                // 确保进度条可见
                progressControl: {
                    seekBar: true,
                    mouseTimeDisplay: true
                }
            },
            // 缓冲设置
            playbackRates: [0.5, 0.75, 1, 1.25, 1.5, 2],
            // 确保音频可用
            language: 'zh-CN',
            muted: false,
            volume: 1.0,
            // 性能优化
            inactivityTimeout: 3000,
            scrubbing: true,
            liveTracker: {
                trackingThreshold: 30,
                liveTolerance: 15
            },
            userActions: {
                doubleClick: true,
                hotkeys: true
            }
        };
        return { config, videoUrl, videoType };
    };
    // 播放视频上一帧
    const playPreviousFrame = () => {
        if (playerRef.current) {
            try {
                const currentTime = playerRef.current.currentTime();
                playerRef.current.currentTime(Math.max(0, currentTime - 0.04)); // 约 1/25 秒
            }
            catch (e) {
                console.error('播放上一帧失败:', e);
            }
        }
    };
    // 获取字幕
    const fetchSubtitles = async (itemId, subtitleStreams) => {
        if (!subtitleStreams || subtitleStreams.length === 0)
            return;
        const urls = {};
        // 获取当前服务器URL和token
        const currentServerUrl = localStorage.getItem('emby_serverUrl') || serverUrl;
        const currentToken = localStorage.getItem('emby_token') || token;
        if (!currentServerUrl || !currentToken) {
            console.error('无法获取字幕：缺少服务器URL或令牌');
            return;
        }
        console.log('开始获取字幕文件...');
        // 构建字幕URL
        for (const stream of subtitleStreams) {
            if (stream.Index !== undefined) {
                const subtitleUrl = `${currentServerUrl}/emby/Videos/${itemId}/${itemId}/Subtitles/${stream.Index}/Stream.vtt?api_key=${currentToken}`;
                urls[stream.Index] = subtitleUrl;
                console.log(`字幕[${stream.Index}] ${stream.DisplayTitle || stream.Language}:`, subtitleUrl);
            }
        }
        setSubtitleUrls(urls);
    };
    // 切换字幕
    const switchSubtitle = (index) => {
        console.log('切换字幕到:', index);
        setCurrentSubtitleIndex(index);
        if (!playerRef.current)
            return;
        // 移除所有现有的字幕轨道
        const player = playerRef.current;
        const tracks = player.textTracks();
        if (tracks) {
            for (let i = 0; i < tracks.length; i++) {
                const track = tracks[i];
                if (track.kind === 'subtitles' || track.kind === 'captions') {
                    track.mode = 'disabled';
                }
            }
        }
        // 如果指定了字幕索引，则添加该字幕
        if (index !== null && subtitleUrls[index]) {
            // 查找对应的字幕流信息
            const subtitleInfo = subtitleStreams.find(s => s.Index === index);
            const label = subtitleInfo ?
                (subtitleInfo.DisplayTitle || subtitleInfo.Language || `字幕 ${index}`) :
                `字幕 ${index}`;
            // 移除已存在的同名字幕轨道
            const existingTrack = player.remoteTextTracks().getTrackById(`subtitle-${index}`);
            if (existingTrack) {
                player.removeRemoteTextTrack(existingTrack);
            }
            // 创建并添加新字幕轨道
            const trackEl = document.createElement('track');
            trackEl.kind = 'subtitles';
            trackEl.src = subtitleUrls[index];
            trackEl.srclang = subtitleInfo?.Language || 'und';
            trackEl.label = label;
            trackEl.id = `subtitle-${index}`;
            trackEl.default = true;
            player.addRemoteTextTrack({
                kind: 'subtitles',
                src: subtitleUrls[index],
                srclang: subtitleInfo?.Language || 'und',
                label: label,
                default: true,
                id: `subtitle-${index}`
            }, false);
            // 在短暂延迟后启用字幕显示
            setTimeout(() => {
                const tracks = player.textTracks();
                for (let i = 0; i < tracks.length; i++) {
                    const track = tracks[i];
                    if (track.id === `subtitle-${index}`) {
                        track.mode = 'showing';
                        console.log('已启用字幕:', track.label);
                        break;
                    }
                }
            }, 500);
        }
    };
    // 显示字幕选择菜单
    const showSubtitleMenu = () => {
        if (!subtitleStreams || subtitleStreams.length === 0)
            return;
        // 构建字幕菜单项
        const items = subtitleStreams.map(stream => ({
            key: `subtitle-${stream.Index}`,
            label: stream.DisplayTitle || stream.Language || `字幕 ${stream.Index}`,
            onClick: () => switchSubtitle(stream.Index)
        }));
        // 添加关闭字幕选项
        items.unshift({
            key: 'subtitle-off',
            label: '关闭字幕',
            onClick: () => switchSubtitle(null)
        });
        // 显示下拉菜单
        const menuItems = (_jsx(Menu, { children: items.map(item => (_jsx(Menu.Item, { onClick: item.onClick, children: item.label }, item.key))) }));
        // 使用message提示显示字幕选择选项
        message.info({
            content: (_jsxs("div", { className: "subtitle-selector", children: [_jsx("h4", { children: "\u9009\u62E9\u5B57\u5E55" }), _jsx(List, { size: "small", bordered: true, dataSource: items, renderItem: item => (_jsx(List.Item, { onClick: item.onClick, className: item.key === `subtitle-${currentSubtitleIndex}` ? 'active' : '', children: item.label })) })] })),
            duration: 5,
            style: {
                marginTop: '20vh'
            }
        });
    };
    // 简化播放器初始化函数
    const initializePlayer = (retryCount = 0) => {
        if (playerInitializedRef.current || !id)
            return;
        // 限制重试次数，避免无限循环
        if (retryCount > 5) {
            console.error('初始化播放器失败：达到最大重试次数');
            setError('初始化播放器失败，请刷新页面重试');
            setLoading(false);
            return;
        }
        // 如果有之前的播放器实例，先销毁
        if (playerRef.current) {
            try {
                playerRef.current.dispose();
                playerRef.current = null;
            }
            catch (e) {
                console.error('清理旧播放器失败:', e);
            }
        }
        // 等待媒体源信息可用
        if (!mediaSource && !streamUrl) {
            console.log('等待媒体源信息...');
            setTimeout(() => initializePlayer(retryCount + 1), 1000);
            return;
        }
        try {
            // 检查容器元素
            if (!videoContainerRef.current) {
                console.error('播放器容器未找到');
                setError('播放器容器未找到，请刷新页面重试');
                setLoading(false);
                setTimeout(() => initializePlayer(retryCount + 1), 1000);
                return;
            }
            // 创建一个新的div作为播放器容器
            const playerContainer = document.createElement('div');
            playerContainer.className = 'video-js-container';
            playerContainer.style.width = '100%';
            playerContainer.style.height = '100%';
            playerContainer.style.position = 'absolute';
            playerContainer.style.top = '0';
            playerContainer.style.left = '0';
            // 创建视频元素
            const videoElement = document.createElement('video');
            videoElement.className = 'video-js vjs-default-skin vjs-big-play-centered';
            videoElement.controls = true;
            videoElement.preload = 'auto';
            videoElement.style.width = '100%';
            videoElement.style.height = '100%';
            videoElement.style.display = 'block';
            // 添加交互辅助层 - 确保控制栏区域不会被点击穿透
            const interactionHelper = document.createElement('div');
            interactionHelper.className = 'player-interaction-helper';
            interactionHelper.style.position = 'absolute';
            interactionHelper.style.bottom = '0';
            interactionHelper.style.left = '0';
            interactionHelper.style.width = '100%';
            interactionHelper.style.height = '4em'; // 略高于控制栏
            interactionHelper.style.zIndex = '150'; // 低于控制栏但高于视频
            interactionHelper.style.pointerEvents = 'none'; // 默认不拦截事件
            // 控制栏区域应该允许事件穿透到控制栏
            playerContainer.appendChild(interactionHelper);
            // 清空之前的内容，保留重要UI元素
            const container = videoContainerRef.current;
            const nonPlayerElements = [];
            // 保存非播放器元素
            Array.from(container.children).forEach(child => {
                if (!child.classList.contains('video-js') &&
                    !child.classList.contains('video-js-container')) {
                    nonPlayerElements.push(child);
                }
            });
            // 移除所有子元素
            while (container.firstChild) {
                container.removeChild(container.firstChild);
            }
            // 添加回非播放器元素
            nonPlayerElements.forEach(element => {
                container.appendChild(element);
            });
            // 添加新容器
            playerContainer.appendChild(videoElement);
            container.appendChild(playerContainer);
            // 获取播放URL
            const videoUrl = getStreamUrl(mediaSource?.Id, id);
            setStreamUrl(videoUrl);
            // 配置播放器
            const config = {
                autoplay: true,
                controls: true,
                responsive: true,
                fluid: true,
                width: '100%',
                height: '100%',
                sources: [{
                        src: videoUrl,
                        type: 'video/mp4'
                    }],
                html5: {
                    nativeVideoTracks: true,
                    nativeAudioTracks: true,
                    nativeTextTracks: true,
                    hls: {
                        overrideNative: Hls.isSupported(),
                        enableLowInitialPlaylist: true,
                        smoothQualityChange: true,
                        handlePartialData: true
                    },
                    vhs: {
                        overrideNative: Hls.isSupported(),
                        enableLowInitialPlaylist: true,
                        smoothQualityChange: true,
                        handlePartialData: true
                    }
                },
                techOrder: ['html5'],
                liveui: false,
                errorDisplay: true,
                loadingSpinner: true,
                preload: 'auto',
                controlBar: {
                    volumePanel: {
                        inline: false,
                        vertical: true
                    },
                    // 确保进度条可见
                    progressControl: {
                        seekBar: true,
                        mouseTimeDisplay: true
                    }
                },
                // 缓冲设置
                playbackRates: [0.5, 0.75, 1, 1.25, 1.5, 2],
                // 确保音频可用
                language: 'zh-CN',
                muted: false,
                volume: 1.0,
                // 性能优化
                inactivityTimeout: 3000,
                scrubbing: true,
                liveTracker: {
                    trackingThreshold: 30,
                    liveTolerance: 15
                },
                userActions: {
                    doubleClick: true,
                    hotkeys: true
                }
            };
            // 初始化播放器
            const player = videojs(videoElement, config);
            // 确保控制栏正常工作
            const enhanceControlBar = () => {
                try {
                    // @ts-ignore
                    const controlBar = player.el().querySelector('.vjs-control-bar');
                    if (!controlBar)
                        return;
                    // 确保控制栏可见性和交互性
                    controlBar.style.opacity = '1';
                    controlBar.style.visibility = 'visible';
                    controlBar.style.pointerEvents = 'auto';
                    controlBar.style.zIndex = '200';
                    // 确保所有按钮可点击
                    const buttons = controlBar.querySelectorAll('button, .vjs-control');
                    buttons.forEach((button) => {
                        const buttonElement = button;
                        buttonElement.style.pointerEvents = 'auto';
                        buttonElement.style.cursor = 'pointer';
                        buttonElement.style.zIndex = '210';
                        // 添加触摸事件监听器 - 移动设备上可能需要
                        buttonElement.addEventListener('touchstart', function (e) {
                            e.stopPropagation();
                        }, { passive: false });
                    });
                    // 确保进度条可点击
                    const progressControl = controlBar.querySelector('.vjs-progress-control');
                    if (progressControl) {
                        progressControl.style.pointerEvents = 'auto';
                    }
                    // 确保音量控制可点击
                    const volumePanel = controlBar.querySelector('.vjs-volume-panel');
                    if (volumePanel) {
                        volumePanel.style.pointerEvents = 'auto';
                    }
                    console.log('已增强控制栏交互能力');
                }
                catch (e) {
                    console.error('增强控制栏失败:', e);
                }
            };
            // 定期检查并确保控制栏可点击
            const controlBarInterval = setInterval(enhanceControlBar, 2000);
            // 在播放器销毁时清理
            player.on('dispose', () => {
                clearInterval(controlBarInterval);
            });
            // 确保音频轨道可用
            player.ready(function () {
                // 尝试解除静音
                player.muted(false);
                player.volume(1.0);
                // 改进进度条点击和拖动功能
                function enhanceProgressControl() {
                    try {
                        // @ts-ignore - 类型定义不完整
                        const progressControl = player.el().querySelector('.vjs-progress-control');
                        if (!progressControl)
                            return;
                        // 确保进度条的点击事件不会被阻止
                        progressControl.style.pointerEvents = 'auto';
                        // 手动绑定点击事件以确保进度条可用
                        progressControl.addEventListener('click', function (e) {
                            // 计算点击位置占总宽度的比例
                            const rect = progressControl.getBoundingClientRect();
                            const position = (e.clientX - rect.left) / rect.width;
                            // 设置播放时间点
                            const duration = player.duration();
                            if (duration) {
                                const seekTime = duration * position;
                                player.currentTime(seekTime);
                                console.log('手动进度条点击生效，跳转到:', seekTime);
                            }
                        });
                        // 查找并增强进度条滑块
                        const seekBar = progressControl.querySelector('.vjs-progress-holder');
                        if (seekBar) {
                            // 进度条容器也需要可点击
                            seekBar.style.pointerEvents = 'auto';
                            seekBar.style.cursor = 'pointer';
                            // 进度条滑块点击事件
                            seekBar.addEventListener('click', function (e) {
                                e.stopPropagation();
                                const rect = seekBar.getBoundingClientRect();
                                const position = (e.clientX - rect.left) / rect.width;
                                // 设置播放时间点
                                const duration = player.duration();
                                if (duration) {
                                    player.currentTime(duration * position);
                                }
                            });
                        }
                        console.log('已增强进度条点击功能');
                    }
                    catch (e) {
                        console.error('增强进度条功能失败:', e);
                    }
                }
                // 在播放器准备好后增强进度条
                setTimeout(enhanceProgressControl, 500);
                // 增强音量控制
                function enhanceVolumeControl() {
                    try {
                        // @ts-ignore - 类型定义不完整
                        const volumePanel = player.el().querySelector('.vjs-volume-panel');
                        if (!volumePanel)
                            return;
                        // 确保音量面板展开时仍保持可见
                        volumePanel.addEventListener('mouseenter', function () {
                            volumePanel.classList.add('vjs-hover');
                        });
                        volumePanel.addEventListener('mouseleave', function () {
                            setTimeout(() => {
                                volumePanel.classList.remove('vjs-hover');
                            }, 500);
                        });
                        console.log('已增强音量控制功能');
                    }
                    catch (e) {
                        console.error('增强音量控制功能失败:', e);
                    }
                }
                // 增强音量控制
                setTimeout(enhanceVolumeControl, 500);
                // 检查可用音频轨道
                try {
                    // @ts-ignore - videojs类型定义中可能不包含audioTracks
                    if (player.audioTracks && typeof player.audioTracks === 'function') {
                        // @ts-ignore
                        const audioTracks = player.audioTracks();
                        if (audioTracks && audioTracks.length) {
                            console.log(`可用音频轨道: ${audioTracks.length}`);
                            // 启用第一个音频轨道
                            if (audioTracks.length > 0 && audioTracks[0]) {
                                audioTracks[0].enabled = true;
                                console.log('已启用第一个音频轨道');
                            }
                        }
                        else {
                            console.log('未检测到音频轨道');
                        }
                    }
                    else {
                        console.log('不支持音频轨道API');
                    }
                }
                catch (e) {
                    console.error('设置音频轨道时出错:', e);
                }
                // 如果有字幕流，添加字幕按钮
                if (subtitleStreams && subtitleStreams.length > 0) {
                    // 自动选择第一个字幕
                    if (currentSubtitleIndex === null && subtitleStreams.length > 0) {
                        const firstSubtitleIndex = subtitleStreams[0].Index;
                        switchSubtitle(firstSubtitleIndex);
                    }
                    else if (currentSubtitleIndex !== null) {
                        // 恢复之前选择的字幕
                        switchSubtitle(currentSubtitleIndex);
                    }
                    // 添加字幕控制按钮
                    try {
                        // @ts-ignore - 忽略TypeScript错误，videojs的类型定义不完整
                        const controlBar = player.controlBar;
                        // 创建字幕按钮
                        const subtitleButton = document.createElement('button');
                        subtitleButton.className = 'vjs-subtitle-button vjs-control vjs-button';
                        subtitleButton.innerHTML = '<span class="vjs-icon-placeholder" aria-hidden="true">字幕</span>';
                        subtitleButton.title = '选择字幕';
                        // 添加点击事件
                        subtitleButton.onclick = () => {
                            showSubtitleMenu();
                        };
                        // 在控制栏中的合适位置添加按钮
                        // @ts-ignore - 忽略TypeScript错误，videojs的类型定义不完整
                        const fullscreenButton = player.el().querySelector('.vjs-fullscreen-control');
                        // @ts-ignore - player.el()可能返回undefined
                        if (fullscreenButton && fullscreenButton.parentNode) {
                            fullscreenButton.parentNode.insertBefore(subtitleButton, fullscreenButton);
                            console.log('已添加字幕按钮');
                        }
                    }
                    catch (e) {
                        console.error('添加字幕按钮失败:', e);
                    }
                }
            });
            // 事件监听
            player.on('error', (e) => {
                const error = player.error();
                console.error('播放器错误:', error);
                // 检查是否正在切换剧集
                if (localStorage.getItem('switching_episode') === 'true') {
                    console.log('检测到剧集切换中，忽略错误提示');
                    // 不需要在这里清除标记，由switchToEpisode函数中的setTimeout处理
                    return;
                }
                // 标记有错误发生
                playerInitializedRef.current = true;
                // 如果视频实际上已经在播放，不设置错误状态
                // 这可以解决切换到mkv格式但实际可以播放的情况
                // @ts-ignore - 忽略videojs类型定义不完整的问题
                if (player.readyState() >= 3 || player.seeking() || player.hasStarted()) {
                    console.log('虽然报告了格式错误，但视频似乎可以播放，忽略错误提示');
                    return;
                }
                if (error) {
                    let errorMessage = '';
                    switch (error.code) {
                        case 1: // MEDIA_ERR_ABORTED
                            errorMessage = '播放被中止';
                            break;
                        case 2: // MEDIA_ERR_NETWORK
                            errorMessage = '网络错误导致视频下载失败';
                            break;
                        case 3: // MEDIA_ERR_DECODE
                            errorMessage = '视频解码错误';
                            break;
                        case 4: // MEDIA_ERR_SRC_NOT_SUPPORTED
                            // 检查视频是否实际上能播放
                            // @ts-ignore - 忽略videojs类型定义不完整的问题
                            if (player.currentTime() > 0 && player.readyState() >= 2) {
                                console.log('视频格式报告不支持，但实际已经在播放，忽略错误');
                                return;
                            }
                            // 如果是视频刚刚开始加载，添加延迟检查
                            setTimeout(() => {
                                // 再次检查播放状态，如果已经开始播放则忽略错误
                                if (player && player.readyState() >= 2) {
                                    console.log('延迟检查：视频已开始播放，清除错误状态');
                                    setError(null);
                                    return;
                                }
                                // 如果仍在切换剧集，继续忽略错误
                                if (localStorage.getItem('switching_episode') === 'true') {
                                    console.log('延迟检查：仍在切换剧集，继续忽略错误');
                                    return;
                                }
                                // 如果确实无法播放，才设置错误信息
                                console.log('延迟检查：视频确实无法播放，显示错误');
                                errorMessage = `格式不支持 (${mediaSource?.Container || '未知'})`;
                                setError(errorMessage);
                                setPlaybackError(true);
                                setLoading(false);
                            }, 3000); // 延迟3秒后再确认是否真的有错误
                            return; // 先不设置错误，等延迟检查结果
                        default:
                            errorMessage = `未知错误 (${error.code}): ${error.message}`;
                    }
                    setError(errorMessage);
                    setPlaybackError(true);
                    setLoading(false);
                }
                else {
                    // 同样，只有在视频确实无法播放时才设置错误
                    // @ts-ignore - 忽略videojs类型定义不完整的问题
                    if (player.currentTime() > 0 && player.readyState() >= 2) {
                        console.log('虽然报告了错误，但视频似乎可以播放，忽略错误提示');
                        return;
                    }
                    setError('视频播放出错');
                    setLoading(false);
                }
            });
            // 事件监听
            player.on('waiting', () => {
                console.log('视频缓冲中...');
                setBuffering(true);
                // 自动调整缓冲策略以减少卡顿
                try {
                    // 检查当前缓冲区
                    const bufferedTimeRanges = player.buffered();
                    let totalBufferedSeconds = 0;
                    if (bufferedTimeRanges && bufferedTimeRanges.length > 0) {
                        for (let i = 0; i < bufferedTimeRanges.length; i++) {
                            totalBufferedSeconds += bufferedTimeRanges.end(i) - bufferedTimeRanges.start(i);
                        }
                        console.log(`当前已缓冲 ${totalBufferedSeconds.toFixed(2)} 秒的内容`);
                    }
                    // 如果缓冲不足，尝试暂停一会儿以积累更多缓冲
                    if (totalBufferedSeconds < 10) {
                        console.log('缓冲不足，暂停以积累更多缓冲');
                        // 创建一个缓冲动画指示器
                        const bufferingText = document.createElement('div');
                        bufferingText.className = 'vjs-buffering-text';
                        bufferingText.textContent = '正在缓冲...';
                        bufferingText.style.position = 'absolute';
                        bufferingText.style.top = '50%';
                        bufferingText.style.left = '50%';
                        bufferingText.style.transform = 'translate(-50%, -50%)';
                        bufferingText.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
                        bufferingText.style.color = 'white';
                        bufferingText.style.padding = '10px 20px';
                        bufferingText.style.borderRadius = '5px';
                        bufferingText.style.zIndex = '100';
                        // @ts-ignore - videojs类型定义不完整
                        player.el().appendChild(bufferingText);
                        // 10秒后恢复播放，无论缓冲是否足够
                        setTimeout(() => {
                            try {
                                // @ts-ignore - videojs类型定义不完整
                                const bufferElement = player.el().querySelector('.vjs-buffering-text');
                                if (bufferElement)
                                    bufferElement.remove();
                                player.play();
                            }
                            catch (e) {
                                console.error('恢复播放失败:', e);
                            }
                        }, 10000);
                    }
                }
                catch (e) {
                    console.error('调整缓冲策略失败:', e);
                }
            });
            // 添加缓冲优化监听
            player.on('progress', () => {
                // 当缓冲增加时，记录缓冲量
                try {
                    const currentTime = player.currentTime() || 0; // 提供默认值0
                    const bufferedTimeRanges = player.buffered();
                    let closestBufferEnd = 0;
                    if (bufferedTimeRanges && bufferedTimeRanges.length > 0) {
                        // 找到当前播放点之后的缓冲区
                        for (let i = 0; i < bufferedTimeRanges.length; i++) {
                            const start = bufferedTimeRanges.start(i);
                            const end = bufferedTimeRanges.end(i);
                            if (currentTime >= start && currentTime <= end) {
                                closestBufferEnd = end;
                                break;
                            }
                        }
                        // 计算缓冲提前量
                        const bufferAhead = closestBufferEnd - currentTime;
                        console.log(`当前播放位置: ${currentTime.toFixed(2)}, 已缓冲至: ${closestBufferEnd.toFixed(2)}, 提前量: ${bufferAhead.toFixed(2)}秒`);
                        // 如果缓冲充足，确保正在播放
                        if (bufferAhead > 30 && player.paused && typeof player.paused === 'function' && player.paused()) {
                            console.log('缓冲充足，恢复播放');
                            player.play();
                        }
                    }
                }
                catch (e) {
                    console.error('监控缓冲进度失败:', e);
                }
            });
            player.on('canplay', () => {
                setBuffering(false);
            });
            player.on('playing', () => {
                setLoading(false);
                setBuffering(false);
                setIsPlaying(true); // 标记视频正在播放
                setError(null); // 清除任何错误提示
                document.body.classList.add('video-playing-state');
            });
            player.on('loadedmetadata', () => {
                console.log('视频元数据已加载');
                setLoading(false);
            });
            // 添加seeked事件监听
            player.on('seeked', () => {
                console.log('视频已跳转到新位置');
                // 如果视频在seek后可以播放，清除错误提示
                // @ts-ignore - 忽略videojs类型定义不完整的问题
                if (player.readyState() >= 3) {
                    setError(null);
                    setIsPlaying(true);
                }
            });
            player.on('ended', () => {
                console.log('视频播放结束');
                // 如果是剧集，自动播放下一集
                if (isEpisode) {
                    playNextEpisode();
                }
            });
            // 添加自定义控制按钮
            if (isEpisode) {
                addCustomControlButtons(player);
            }
            // 添加动态质量调整逻辑
            let lastPlaybackRate = 1;
            let lastPlaybackQualityCheckTime = Date.now();
            // 监控播放质量
            const playbackQualityInterval = setInterval(() => {
                try {
                    // 先确保player对象存在且有必要的方法
                    if (!player || !player.paused || typeof player.paused !== 'function')
                        return;
                    // 检查是否暂停状态
                    if (player.paused())
                        return;
                    const now = Date.now();
                    const timeSinceLastCheck = (now - lastPlaybackQualityCheckTime) / 1000;
                    lastPlaybackQualityCheckTime = now;
                    // 获取当前缓冲状态
                    if (!player.buffered || typeof player.buffered !== 'function')
                        return;
                    const bufferedTimeRanges = player.buffered();
                    if (!player.currentTime || typeof player.currentTime !== 'function')
                        return;
                    const currentTime = player.currentTime() || 0; // 提供默认值0
                    let bufferAhead = 0;
                    if (bufferedTimeRanges && bufferedTimeRanges.length > 0) {
                        for (let i = 0; i < bufferedTimeRanges.length; i++) {
                            const start = bufferedTimeRanges.start(i);
                            const end = bufferedTimeRanges.end(i);
                            if (currentTime >= start && currentTime <= end) {
                                bufferAhead = end - currentTime;
                                break;
                            }
                        }
                    }
                    // 检查playbackRate方法是否存在
                    if (!player.playbackRate || typeof player.playbackRate !== 'function')
                        return;
                    // 获取当前播放速度并提供默认值
                    const currentRate = player.playbackRate() || 1;
                    if (bufferAhead < 5 && currentRate >= 1) {
                        // 缓冲不足，降低播放速度减少卡顿
                        lastPlaybackRate = currentRate;
                        player.playbackRate(0.9);
                        console.log('缓冲不足，降低播放速度到0.9以减少卡顿');
                    }
                    else if (bufferAhead > 20 && currentRate < 1) {
                        // 缓冲充足，恢复播放速度
                        player.playbackRate(lastPlaybackRate);
                        console.log('缓冲充足，恢复播放速度');
                    }
                }
                catch (e) {
                    console.error('播放质量监控失败:', e);
                }
            }, 5000);
            // 清理定时器
            player.on('dispose', () => {
                clearInterval(playbackQualityInterval);
            });
            // 初始化缓冲管理器
            const handleBufferingChange = (buffering) => {
                setBuffering(buffering);
                // 更新UI上的缓冲状态
                if (buffering) {
                    setBufferingMessage('视频缓冲中...');
                }
                else {
                    setBufferingMessage(null);
                }
            };
            const handleBufferUpdate = (bufferAhead, totalBuffered) => {
                setBufferAhead(bufferAhead);
                setTotalBuffered(totalBuffered);
            };
            // 创建缓冲管理器实例
            if (videoElement) {
                bufferManagerRef.current = new BufferManager(player, videoElement, handleBufferingChange, handleBufferUpdate);
            }
            player.ready(function () {
                // ... 现有代码 ...
                // 移除原有的缓冲处理逻辑，交给BufferManager处理
                console.log('视频元素就绪，缓冲管理器已启动');
            });
            // 简化事件监听，让缓冲管理器处理缓冲逻辑
            player.on('error', (e) => {
                // ... 现有的错误处理代码 ...
            });
            // 移除原有的waiting处理，由BufferManager处理
            // 移除原有的progress处理，由BufferManager处理
            player.on('canplay', () => {
                console.log('视频可以播放');
                setLoading(false);
            });
            player.on('playing', () => {
                console.log('视频开始播放');
                setLoading(false);
                setBuffering(false);
                setIsPlaying(true);
                setError(null);
                document.body.classList.add('video-playing-state');
            });
            // ... 其他事件处理保持不变 ...
            playerRef.current = player;
            playerInitializedRef.current = true;
            // 保存当前视频元素引用
            videoElementRef.current = videoElement;
            // 尝试播放
            if (player && player.play && typeof player.play === 'function') {
                try {
                    const playPromise = player.play();
                    if (playPromise !== undefined && typeof playPromise.catch === 'function') {
                        playPromise.catch((err) => {
                            console.error('自动播放失败:', err);
                        });
                    }
                }
                catch (e) {
                    console.error('调用播放失败:', e);
                }
            }
            // 初始化缓冲管理器
            setTimeout(() => {
                if (videoElement && !bufferManagerRef.current) {
                    const handleBufferingChange = (buffering) => {
                        setBuffering(buffering);
                        if (buffering) {
                            setBufferingMessage('视频缓冲中...');
                        }
                        else {
                            setBufferingMessage(null);
                        }
                    };
                    const handleBufferUpdate = (bufferAhead, totalBuffered) => {
                        setBufferAhead(bufferAhead);
                        setTotalBuffered(totalBuffered);
                    };
                    bufferManagerRef.current = new BufferManager(player, videoElement, handleBufferingChange, handleBufferUpdate);
                }
            }, 1000);
        }
        catch (e) {
            setError('初始化播放器失败，请刷新页面重试');
            setLoading(false);
        }
    };
    // 添加自定义控制按钮
    const addCustomControlButtons = (player) => {
        // 自定义按钮创建函数
        const createButton = (iconClass, text, clickHandler, className) => {
            const button = document.createElement('button');
            button.className = `vjs-control vjs-button ${className}`;
            button.innerHTML = `<span class="${iconClass}"></span><span class="vjs-control-text">${text}</span>`;
            button.onclick = clickHandler;
            return button;
        };
        try {
            const controlBar = player.getChild('controlBar');
            // 添加上一集按钮
            if (controlBar && isEpisode) {
                const prevButton = createButton('vjs-icon-previous-item', '上一集', playPreviousEpisode, 'vjs-prev-button');
                controlBar.addChild('button', {
                    el: prevButton
                });
            }
            // 添加下一集按钮
            if (controlBar && isEpisode) {
                const nextButton = createButton('vjs-icon-next-item', '下一集', playNextEpisode, 'vjs-next-button');
                controlBar.addChild('button', {
                    el: nextButton
                });
            }
        }
        catch (e) {
            console.error('添加自定义控制按钮失败:', e);
        }
    };
    // 渲染码流选择菜单
    const renderStreamMenu = () => {
        return _jsx(Menu, { className: "format-select-dropdown" });
    };
    // 处理视频错误
    const handleVideoError = (e) => {
        console.error('视频元素错误:', e);
        // 获取视频元素的错误信息
        const videoError = e.target.error;
        setPlaybackError(true);
        setLoading(false);
        // 提供详细的错误信息
        if (videoError) {
            switch (videoError.code) {
                case MediaError.MEDIA_ERR_ABORTED:
                    setError('播放被中止');
                    break;
                case MediaError.MEDIA_ERR_NETWORK:
                    setError('网络错误导致视频下载失败');
                    break;
                case MediaError.MEDIA_ERR_DECODE:
                    setError('视频解码错误，格式可能不兼容');
                    break;
                case MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED:
                    setError(`视频格式不支持 (${mediaSource?.Container || '未知'})`);
                    break;
                default:
                    setError(`未知视频错误 (${videoError.code})`);
            }
        }
        else {
            setError('视频播放失败，请手动选择其他格式');
        }
    };
    // 切换信息面板折叠状态
    const toggleInfoPanel = () => {
        setInfoCollapsed(!infoCollapsed);
    };
    // 格式化运行时间
    const formatRuntime = (ticks) => {
        if (!ticks)
            return '未知';
        const seconds = Math.floor(ticks / 10000000);
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        if (hours > 0) {
            return `${hours}小时${minutes}分钟`;
        }
        else {
            return `${minutes}分钟`;
        }
    };
    // 添加检查浏览器解码能力的函数 - 详细版
    const checkBrowserCapabilities = () => {
        try {
            const videoElement = document.createElement('video');
            console.log('浏览器视频支持情况:', {
                MP4: videoElement.canPlayType('video/mp4'),
                WebM: videoElement.canPlayType('video/webm'),
                HLS: videoElement.canPlayType('application/vnd.apple.mpegurl'),
                H264: videoElement.canPlayType('video/mp4; codecs="avc1.42E01E"'),
                H265: videoElement.canPlayType('video/mp4; codecs="hev1"'),
                VP9: videoElement.canPlayType('video/webm; codecs="vp9"')
            });
        }
        catch (e) {
            console.error('检查浏览器能力失败:', e);
        }
    };
    // 确保添加事件监听器和播放器初始化
    useEffect(() => {
        if (!id || !serverUrl || !token)
            return;
        // 检查浏览器视频支持能力
        checkBrowserCapabilities();
        // 添加自定义CSS以提高控制栏可见性
        const style = document.createElement('style');
        style.textContent = `
      .video-js .vjs-control-bar {
        background-color: rgba(0, 0, 0, 0.7);
        height: 3.5em;
        bottom: 0;
        left: 0;
        right: 0;
        display: flex;
        align-items: center;
        padding: 0 1em;
        z-index: 200 !important;
        pointer-events: auto !important;
      }
      
      /* 确保所有控制按钮可点击 */
      .video-js .vjs-control {
        position: relative;
        text-align: center;
        margin: 0;
        padding: 0;
        height: 100%;
        width: 3em;
        flex: none;
        z-index: 210 !important;
        pointer-events: auto !important;
        cursor: pointer !important;
      }
      
      /* 修复按钮和图标 */
      .video-js .vjs-icon-play,
      .video-js .vjs-icon-pause,
      .video-js .vjs-icon-volume-high,
      .video-js .vjs-icon-volume-mute,
      .video-js .vjs-icon-fullscreen-enter,
      .video-js .vjs-icon-fullscreen-exit,
      .video-js button {
        pointer-events: auto !important;
        cursor: pointer !important;
        z-index: 220 !important;
      }
      
      /* 防止视频区域拦截控制栏点击 */
      .video-js .vjs-tech {
        pointer-events: auto;
        z-index: 10 !important;
      }
      
      /* 修复菜单显示 */
      .video-js .vjs-menu {
        z-index: 230 !important;
        pointer-events: auto !important;
      }
      
      /* 确保控制栏始终可见 */
      .video-js.vjs-has-started .vjs-control-bar {
        opacity: 1;
        visibility: visible !important;
        pointer-events: auto !important;
        transition: visibility 0.1s, opacity 0.1s;
      }
      
      /* 修复播放按钮样式 */
      .video-js .vjs-big-play-button {
        z-index: 20 !important;
      }
    `;
        document.head.appendChild(style);
        // 获取媒体播放信息 - 只在ID变化时获取，避免循环
        if (!mediaSource) {
            fetchPlaybackInfo(id);
        }
        // 初始化播放器，从0开始计数
        initializePlayer(0);
        // 添加键盘事件监听
        window.addEventListener('keydown', handleKeyDown);
        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            // 清理缓冲管理器
            if (bufferManagerRef.current) {
                try {
                    bufferManagerRef.current.dispose();
                    bufferManagerRef.current = null;
                }
                catch (e) {
                    console.error('清理缓冲管理器失败:', e);
                }
            }
            if (playerRef.current) {
                playerRef.current.dispose();
                playerRef.current = null;
                playerInitializedRef.current = false;
            }
            document.body.classList.remove('video-playing-state');
            // 移除样式表
            if (style.parentNode) {
                style.parentNode.removeChild(style);
            }
        };
    }, [id, serverUrl, token, mediaSource, isEpisode]);
    // 添加一个useEffect，在首次加载时尝试使用初始化播放器
    useEffect(() => {
        if (mediaSource && !playerInitializedRef.current) {
            initializePlayer(0);
        }
    }, [mediaSource]);
    // 添加重新初始化的功能，用于服务器URL变化时调用
    const reinitializePlayer = () => {
        // 清理当前播放器
        if (playerRef.current) {
            try {
                playerRef.current.pause();
                playerRef.current.dispose();
                playerRef.current = null;
            }
            catch (e) {
                console.error('清理播放器失败:', e);
            }
        }
        // 重置状态
        playerInitializedRef.current = false;
        setLoading(true);
        setError(null);
        // 更新媒体源URL
        if (mediaSource && id) {
            const updatedUrl = getStreamUrl(mediaSource.Id, id);
            setStreamUrl(updatedUrl);
        }
        // 重新初始化播放器
        initializePlayer(0);
    };
    // 添加服务器URL变化时的处理函数
    useEffect(() => {
        // 当服务器URL变化时，重新初始化播放器
        if (serverUrl && id && mediaSource) {
            reinitializePlayer();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [serverUrl]);
    // 主动从store获取服务器URL，并添加定期检查
    useEffect(() => {
        // 定期检查服务器URL是否变化
        const checkUrlInterval = setInterval(() => {
            syncServerUrl();
        }, 5000); // 每5秒检查一次
        return () => {
            clearInterval(checkUrlInterval);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [id, serverUrl]);
    // 添加一个401错误处理函数，提供更明确的指导
    const handle401Error = (error) => {
        console.error('授权错误(401):', error);
        if (error.response && error.response.data) {
            console.error('错误详情:', error.response.data);
        }
        setError('授权失败: 您的登录令牌无效或已过期。请返回首页重新登录，或点击"同步服务器"按钮尝试刷新会话。');
        setLoading(false);
        message.error('授权已过期，请返回首页重新登录或同步服务器信息');
    };
    // 添加一个立即重新登录功能，重定向到登录页
    const redirectToLogin = () => {
        // 确保在离开页面前停止并清理播放器
        if (playerRef.current) {
            try {
                playerRef.current.pause();
                playerRef.current.dispose();
                playerRef.current = null;
            }
            catch (e) {
                console.error('返回时清理播放器失败:', e);
            }
        }
        // 通知用户
        message.info('正在重定向到登录页...');
        // 重定向到登录页
        navigate('/login');
    };
    // 添加一个useEffect，专门用于处理视频元素样式
    useEffect(() => {
        // 确保视频元素和容器正确显示
        const ensureVideoVisibility = () => {
            // 检查视频元素
            if (videoElementRef.current) {
                videoElementRef.current.style.visibility = 'visible';
                videoElementRef.current.style.opacity = '1';
                videoElementRef.current.style.display = 'block';
                videoElementRef.current.style.zIndex = '10';
            }
            // 检查video-js容器
            const videoJsContainer = document.querySelector('.video-js');
            if (videoJsContainer) {
                videoJsContainer.style.width = '100%';
                videoJsContainer.style.height = '100%';
                videoJsContainer.style.display = 'block';
                videoJsContainer.style.zIndex = '5';
            }
            // 检查video元素
            const videoElement = document.querySelector('.video-js video');
            if (videoElement) {
                videoElement.style.width = '100%';
                videoElement.style.height = '100%';
                videoElement.style.display = 'block';
                videoElement.style.zIndex = '10';
            }
        };
        // 初始检查
        ensureVideoVisibility();
        // 设置定期检查，确保视频元素保持可见
        const visibilityInterval = setInterval(ensureVideoVisibility, 1000);
        return () => {
            clearInterval(visibilityInterval);
        };
    }, [playerRef.current, videoElementRef.current]);
    // 处理服务器切换
    const handleServerChange = (serverId) => {
        setActiveServer(serverId);
        message.success('已切换服务器');
    };
    // 服务器菜单项
    const serverMenuItems = {
        items: [
            ...servers.map(server => ({
                key: server.id,
                label: server.name,
                onClick: () => handleServerChange(server.id)
            })),
            {
                type: 'divider',
                key: 'divider'
            },
            {
                key: 'manage',
                label: (_jsxs("span", { children: [_jsx(SettingOutlined, {}), " \u7BA1\u7406\u670D\u52A1\u5668"] })),
                onClick: () => navigate('/settings')
            },
        ]
    };
    // 添加缓冲统计信息到界面
    const renderBufferStats = () => {
        if (!isPlaying || bufferAhead <= 0)
            return null;
        return (_jsxs("div", { className: "buffer-stats", style: { position: 'absolute', bottom: '4em', right: '10px',
                background: 'rgba(0,0,0,0.5)', padding: '5px',
                color: 'white', fontSize: '12px', borderRadius: '4px' }, children: ["\u5DF2\u7F13\u51B2: ", bufferAhead.toFixed(1), "\u79D2"] }));
    };
    // 添加获取推荐内容的函数
    const fetchRecommendedItems = async () => {
        if (!itemInfo || !id) {
            return;
        }
        setRecommendedLoading(true);
        try {
            const apiClient = getApiClient();
            if (!apiClient) {
                setRecommendedLoading(false);
                return;
            }
            // 方法1: 获取同类型内容的推荐
            const itemType = itemInfo.Type || '';
            const genreIds = itemInfo.GenreItems?.map((g) => g.Id).join(',') || '';
            // 构建请求参数 - 根据当前内容类型和流派获取相似内容
            const params = {
                SortBy: 'Random',
                SortOrder: 'Ascending',
                Recursive: true,
                Fields: 'PrimaryImageAspectRatio,BasicSyncInfo,Overview',
                ImageTypeLimit: 1,
                EnableImageTypes: 'Primary',
                Limit: 12,
                ExcludeItemIds: id, // 排除当前播放的内容
            };
            // 如果是电影，获取同类型电影
            if (itemType === 'Movie') {
                params.IncludeItemTypes = 'Movie';
                if (genreIds) {
                    params.GenreIds = genreIds;
                }
            }
            // 如果是剧集，获取相关系列
            else if (itemType === 'Episode') {
                params.IncludeItemTypes = 'Series';
                if (genreIds) {
                    params.GenreIds = genreIds;
                }
            }
            else {
                // 默认获取混合内容
                params.IncludeItemTypes = 'Movie,Series';
            }
            const response = await apiClient.get(`/Users/${userId}/Items`, { params });
            if (response.data && response.data.Items) {
                setRecommendedItems(response.data.Items);
            }
        }
        catch (error) {
            console.error('获取推荐内容失败:', error);
        }
        finally {
            setRecommendedLoading(false);
        }
    };
    // 获取图片URL的函数
    const getRecommendedImageUrl = (item) => {
        if (item.ImageTags?.Primary) {
            return `${serverUrl}/Items/${item.Id}/Images/Primary?width=200&quality=90&api_key=${token}`;
        }
        return 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTUwIiBoZWlnaHQ9IjIyNSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTUwIiBoZWlnaHQ9IjIyNSIgZmlsbD0iIzJhMmEyYSIgLz48dGV4dCB4PSI3NSIgeT0iMTEyLjUiIGZvbnQtZmFtaWx5PSJBcmlhbCIgZm9udC1zaXplPSIxMnB4IiBmaWxsPSIjOTk5IiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBhbGlnbm1lbnQtYmFzZWxpbmU9Im1pZGRsZSI+Tm8gSW1hZ2U8L3RleHQ+PC9zdmc+';
    };
    // 处理推荐项点击事件
    const handleRecommendedItemClick = (item) => {
        if (item.Type === 'Movie') {
            navigate(`/player/${item.Id}`);
        }
        else if (item.Type === 'Series') {
            navigate(`/series/${item.Id}`);
        }
    };
    // 在视频信息获取后触发推荐内容获取
    useEffect(() => {
        if (itemInfo && !recommendedItems.length && !recommendedLoading) {
            fetchRecommendedItems();
        }
    }, [itemInfo, recommendedItems.length, recommendedLoading, id]);
    // 添加一个强制初始化推荐内容的effect
    useEffect(() => {
        // 当ID变化时，重置推荐内容并重新获取
        if (id) {
            setRecommendedItems([]);
            setRecommendedLoading(false);
        }
    }, [id]);
    // 显示键盘操作反馈
    const showSeekFeedback = (message) => {
        const feedback = document.createElement('div');
        feedback.className = 'keyboard-feedback';
        feedback.textContent = message;
        feedback.style.cssText = `
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      background: rgba(0, 0, 0, 0.8);
      color: white;
      padding: 10px 20px;
      border-radius: 5px;
      font-size: 16px;
      z-index: 1000;
      pointer-events: none;
      animation: fadeInOut 0.5s ease-in-out;
    `;
        document.body.appendChild(feedback);
        setTimeout(() => {
            feedback.remove();
        }, 1500);
    };
    const showVolumeFeedback = (message) => {
        const feedback = document.createElement('div');
        feedback.className = 'volume-feedback';
        feedback.textContent = message;
        feedback.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background: rgba(0, 0, 0, 0.8);
      color: white;
      padding: 8px 16px;
      border-radius: 4px;
      font-size: 14px;
      z-index: 1000;
      pointer-events: none;
      animation: slideInOut 0.3s ease-in-out;
    `;
        document.body.appendChild(feedback);
        setTimeout(() => {
            feedback.remove();
        }, 2000);
    };
    // 主要渲染函数
    return (_jsxs("div", { className: "player-container", children: [_jsxs("div", { className: "video-area", ref: videoContainerRef, style: {
                    position: 'relative',
                    overflow: 'hidden',
                    backgroundColor: '#000',
                    width: '100%',
                    height: 'calc(100vh - 350px)', // 减去header、底部和推荐区域的高度
                    minHeight: '280px'
                }, children: [loading && (_jsx("div", { className: "player-loading", children: _jsx(Spin, { size: "large", tip: "\u6B63\u5728\u52A0\u8F7D\u89C6\u9891..." }) })), !loading && buffering && (_jsx("div", { className: "player-loading", children: _jsx(Spin, { size: "default", tip: "\u89C6\u9891\u7F13\u51B2\u4E2D..." }) })), error && !isPlaying && (_jsxs("div", { className: "player-error", children: [_jsx("div", { className: "error-message", children: error }), _jsxs("div", { className: "error-actions", children: [_jsx(Button, { type: "primary", onClick: handleRetry, children: "\u91CD\u8BD5" }), _jsx(Button, { onClick: handleBack, children: "\u8FD4\u56DE" }), _jsx(Button, { onClick: redirectToLogin, type: "default", children: "\u91CD\u65B0\u767B\u5F55" })] })] }))] }), itemInfo && !loading && (_jsxs("div", { className: "media-info-area", children: [_jsxs("div", { className: "media-info-header", children: [_jsx("h2", { children: isEpisode && itemInfo.SeriesName ? (_jsxs(_Fragment, { children: [itemInfo.SeriesName, " - S", itemInfo.ParentIndexNumber, "E", itemInfo.IndexNumber, " ", itemInfo.Name] })) : (itemInfo.Name) }), _jsx("div", { className: "header-controls", children: _jsxs("button", { className: `toggle-info-btn ${infoCollapsed ? 'collapsed' : ''}`, onClick: toggleInfoPanel, children: [infoCollapsed ? '展开' : '收起', " ", _jsx("span", { className: "arrow-icon", children: infoCollapsed ? _jsx(DownOutlined, {}) : _jsx(UpOutlined, {}) })] }) })] }), _jsxs("div", { className: `media-info-content ${infoCollapsed ? 'collapsed' : ''}`, children: [itemInfo.Overview && (_jsxs(_Fragment, { children: [_jsx("h3", { children: "\u7B80\u4ECB" }), _jsx(Paragraph, { ellipsis: { rows: 3, expandable: true, symbol: '展开' }, children: itemInfo.Overview })] })), itemInfo.RunTimeTicks && (_jsxs("p", { children: ["\u65F6\u957F: ", formatRuntime(itemInfo.RunTimeTicks)] }))] })] })), isEpisode && episodesList.length > 0 && (_jsxs("div", { className: "episodes-area", children: [_jsxs("div", { className: "episodes-header", children: [_jsx("h3", { children: "\u5267\u96C6\u9009\u62E9" }), _jsxs("div", { className: "episode-controls", children: [_jsx(Button, { icon: _jsx(StepBackwardOutlined, {}), onClick: playPreviousEpisode, disabled: !currentEpisode || episodesList.findIndex(ep => ep.Id === currentEpisode.Id) <= 0, type: "text" }), _jsx(Button, { icon: _jsx(StepForwardOutlined, {}), onClick: playNextEpisode, disabled: !currentEpisode || episodesList.findIndex(ep => ep.Id === currentEpisode.Id) >= episodesList.length - 1, type: "text" })] })] }), _jsx("div", { className: "episodes-list", children: episodesLoading ? (_jsx(Spin, { size: "small" })) : (episodesList.map((episode, index) => (_jsxs("div", { className: `episode-item ${currentEpisode && episode.Id === currentEpisode.Id ? 'active' : ''}`, onClick: () => switchToEpisode(episode), title: `${episode.Name} - ${formatRuntime(episode.RunTimeTicks)}`, children: [_jsxs("div", { className: "episode-number", children: ["\u7B2C", episode.IndexNumber, "\u96C6"] }), _jsx("div", { className: "episode-title", children: episode.Name })] }, episode.Id)))) })] })), itemInfo && (_jsxs("div", { className: "recommended-area", children: [_jsxs("div", { className: "recommended-header", children: [_jsx("h3", { children: "\u731C\u4F60\u559C\u6B22" }), _jsx(Button, { type: "text", onClick: fetchRecommendedItems, size: "small", icon: _jsx(ReloadOutlined, {}), children: "\u5237\u65B0\u63A8\u8350" })] }), _jsx("div", { className: "recommended-content", children: recommendedLoading ? (_jsx("div", { className: "loading-container", children: _jsx(Spin, { size: "default", tip: "\u52A0\u8F7D\u63A8\u8350\u5185\u5BB9..." }) })) : recommendedItems.length > 0 ? (_jsx("div", { className: "recommended-items", children: recommendedItems.map(item => (_jsx(Card, { hoverable: true, className: "recommended-item", cover: _jsx("img", { alt: item.Name, src: getRecommendedImageUrl(item) }), onClick: () => handleRecommendedItemClick(item), children: _jsx(Card.Meta, { title: item.Name, description: _jsx("div", { className: "recommended-item-info", children: _jsxs("div", { children: [item.Type === 'Movie' ? '电影' : '剧集', " ", item.ProductionYear && `· ${item.ProductionYear}`] }) }) }) }, item.Id))) })) : (_jsx("div", { className: "no-recommendations", children: "\u6682\u65E0\u63A8\u8350\u5185\u5BB9\uFF08\u8C03\u8BD5\u6A21\u5F0F\uFF09" })) })] })), renderBufferStats()] }));
};
export default Player;
