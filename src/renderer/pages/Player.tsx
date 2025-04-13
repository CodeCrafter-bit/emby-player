import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Button, Spin, message, Drawer, List, Typography, Tabs, Collapse, Dropdown, Menu, Card } from 'antd';
import { 
  ArrowLeftOutlined, 
  UnorderedListOutlined, 
  StepBackwardOutlined, 
  StepForwardOutlined,
  DownOutlined,
  UpOutlined,
  PlayCircleOutlined,
  InfoCircleOutlined,
  SettingOutlined,
  UserOutlined,
  LoginOutlined,
  ReloadOutlined,
  MinusOutlined,
  BorderOutlined,
  CloseOutlined
} from '@ant-design/icons';
import { useEmbyStore } from '../stores/embyStore';
import { useServerStore } from '../stores/serverStore'; // 添加导入
import SearchBar from '../components/SearchBar'; // 添加导入
import './Player.scss';
import videojs from 'video.js';
import 'video.js/dist/video-js.css';
import Hls from 'hls.js';

const { Title, Text, Paragraph } = Typography;
const { TabPane } = Tabs;
const { Panel } = Collapse;

// 定义剧集类型
interface Episode {
  Id: string;
  Name: string;
  IndexNumber: number; // 集号
  SeasonId: string;
  SeriesId: string;
  SeasonName?: string;
  SeriesName?: string;
  Overview?: string;
  RunTimeTicks?: number;
  ParentIndexNumber?: number; // 季号
}

// 定义季类型
interface Season {
  Id: string;
  Name: string;
  IndexNumber: number; // 季号
  SeriesId: string;
  SeriesName?: string;
  ChildCount?: number; // 集数
  episodes?: Episode[];
}

// 码流类型
interface MediaStream {
  id: string;
  name: string;
  bitrate: number;
  url: string;
}

// 在文件开头添加全局接口声明
declare global {
  interface Window {
    _playerIntervals?: number[];
  }
}

// 改进缓冲管理器类，增强空值检查
class BufferManager {
  private player: any;
  private videoElement: HTMLVideoElement | null = null;
  private bufferTarget: number = 30; // 目标缓冲秒数
  private minPlayBuffer: number = 5; // 最小播放所需缓冲秒数
  private isLoading: boolean = false;
  private isBuffering: boolean = false;
  private onBufferingChange: (buffering: boolean) => void;
  private onBufferUpdate: (bufferAhead: number, totalBuffered: number) => void;
  private bufferCheckInterval: number | null = null;
  private loadingTimeout: number | null = null;
  private pausedForBuffering: boolean = false;
  private lastPlaybackRate: number = 1;
  private isDisposed: boolean = false;

  constructor(
    player: any, 
    videoElement: HTMLVideoElement | null,
    onBufferingChange: (buffering: boolean) => void,
    onBufferUpdate: (bufferAhead: number, totalBuffered: number) => void
  ) {
    this.player = player;
    this.videoElement = videoElement;
    this.onBufferingChange = onBufferingChange;
    this.onBufferUpdate = onBufferUpdate;
    this.initialize();
  }

  // 初始化缓冲管理器
  private initialize(): void {
    try {
      if (!this.player || !this.videoElement) {
        console.log('缓冲管理器: 初始化失败，播放器或视频元素不存在');
        return;
      }

      // 确保事件绑定方法存在
      if (typeof this.player.on !== 'function') {
        console.error('缓冲管理器: 播放器对象不支持事件绑定，初始化失败');
        return;
      }

      // 绑定事件前先解绑，防止重复
      try {
        if (typeof this.player.off === 'function') {
          this.player.off('waiting', this.handleWaiting.bind(this));
          this.player.off('canplay', this.handleCanPlay.bind(this));
          this.player.off('progress', this.handleProgress.bind(this));
          this.player.off('dispose', this.dispose.bind(this));
        }
      } catch (e) {
        console.error('缓冲管理器: 解绑事件失败', e);
      }

      // 绑定方法到this，避免上下文问题
      const boundHandleWaiting = this.handleWaiting.bind(this);
      const boundHandleCanPlay = this.handleCanPlay.bind(this);
      const boundHandleProgress = this.handleProgress.bind(this);
      const boundDispose = this.dispose.bind(this);

      // 监听缓冲事件
      this.player.on('waiting', boundHandleWaiting);
      this.player.on('canplay', boundHandleCanPlay);
      this.player.on('progress', boundHandleProgress);
      
      // 监听播放器销毁事件
      this.player.on('dispose', () => {
        console.log('缓冲管理器: 检测到播放器销毁，清理资源');
        boundDispose();
      });
      
      // 启动缓冲检查定时器
      this.startBufferCheck();
      console.log('缓冲管理器: 初始化成功');
    } catch (e) {
      console.error('缓冲管理器: 初始化失败', e);
    }
  }

  // 检查播放器是否有效
  private isPlayerValid(): boolean {
    // 首先检查已释放标志
    if (this.isDisposed) return false;
    
    // 检查播放器对象是否存在
    if (!this.player) return false;
    
    try {
      // 检查播放器是否有有效的技术实现(tech)对象
      // video.js在技术实现被销毁时可能会保留player对象，但内部tech为null
      if (this.player.tech && typeof this.player.tech === 'function') {
        const tech = this.player.tech(true);
        if (!tech || !tech.el_) return false;
      }
      
      // 尝试访问播放器的基本属性，确保对象有效
      // 有些情况下player对象可能存在，但已经在内部被销毁
      if (typeof this.player.el !== 'function') return false;
      
      // 尝试执行一个简单的方法调用来验证
      const playerEl = this.player.el();
      return !!playerEl;
    } catch (e) {
      // 如果访问属性或调用方法时出错，说明播放器已经无效
      console.error('缓冲管理器: 检查播放器有效性时出错', e);
      return false;
    }
  }

  // 开始定时检查缓冲区
  private startBufferCheck(): void {
    if (this.bufferCheckInterval) {
      clearInterval(this.bufferCheckInterval);
    }
    
    // 使用较长的间隔减少CPU使用
    this.bufferCheckInterval = window.setInterval(() => {
      if (this.isPlayerValid()) {
        this.checkBuffer();
      } else {
        console.log('缓冲管理器: 播放器已失效，停止缓冲检查');
        this.stopBufferCheck();
      }
    }, 3000);
  }

  // 停止缓冲检查
  public stopBufferCheck(): void {
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
  public dispose(): void {
    if (this.isDisposed) {
      // 已经释放过了，避免重复操作
      return;
    }
    
    console.log('缓冲管理器: 开始释放资源');
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
    } catch (e) {
      console.error('缓冲管理器: 移除事件监听器失败', e);
    }
    
    this.player = null;
    this.videoElement = null;
    console.log('缓冲管理器: 已释放资源');
  }

  // 处理等待缓冲事件
  private handleWaiting(): void {
    if (!this.isPlayerValid()) return;
    
    console.log('缓冲管理器: 检测到视频等待缓冲');
    this.isBuffering = true;
    this.onBufferingChange(true);
    
    // 安全地检查播放器状态
    try {
      // 如果播放器处于播放状态但缓冲不足，暂停播放器以积累更多缓冲
      if (this.player && typeof this.player.paused === 'function' && 
          !this.player.paused() && this.getBufferAhead() < this.minPlayBuffer) {
        console.log('缓冲管理器: 缓冲不足，暂停播放以积累缓冲');
        this.pauseForBuffering();
      }
    } catch (e) {
      console.error('缓冲管理器: 处理缓冲等待时出错', e);
    }
  }

  // 处理可以播放事件
  private handleCanPlay(): void {
    console.log('缓冲管理器：视频可以播放');
    
    // 如果之前因缓冲不足而暂停，且现在有足够缓冲，则恢复播放
    if (this.pausedForBuffering && this.getBufferAhead() >= this.minPlayBuffer) {
      this.resumeFromBuffering();
    }
    
    this.isBuffering = false;
    this.onBufferingChange(false);
  }

  // 处理progress事件（浏览器在加载更多视频数据时触发）
  private handleProgress(): void {
    const bufferInfo = this.getBufferInfo();
    this.onBufferUpdate(bufferInfo.bufferAhead, bufferInfo.totalBuffered);
    
    // 如果之前因缓冲不足而暂停，且现在有足够缓冲，则恢复播放
    if (this.pausedForBuffering && bufferInfo.bufferAhead >= this.minPlayBuffer) {
      this.resumeFromBuffering();
    }
  }

  // 检查缓冲状态并做出相应调整
  private checkBuffer(): void {
    // 多重检查以确保安全
    if (this.isDisposed) return;
    if (!this.player) return;
    if (!this.isPlayerValid()) return;
    
    try {
      // 先验证player的技术实现是否有效，避免"Cannot read properties of null"错误
      let techValid = false;
      try {
        if (this.player.tech && typeof this.player.tech === 'function') {
          const tech = this.player.tech(true);
          techValid = !!(tech && tech.el_);
        }
      } catch (e) {
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
        } else if (this.videoElement) {
          isPaused = this.videoElement.paused;
        }
      } catch (e) {
        console.error('缓冲管理器: 获取播放状态失败', e);
        isPaused = true; // 出错时假设已暂停
      }
      
      // 执行缓冲策略
      try {
        // 缓冲不足，暂停以积累更多缓冲
        if (bufferAhead < this.minPlayBuffer && !isPaused) {
          console.log(`缓冲管理器: 缓冲不足 (${bufferAhead.toFixed(2)}秒)，暂停播放以积累缓冲`);
          this.pauseForBuffering();
        } 
        // 已暂停且缓冲充足，恢复播放
        else if (bufferAhead >= this.minPlayBuffer && this.pausedForBuffering) {
          console.log(`缓冲管理器: 缓冲充足 (${bufferAhead.toFixed(2)}秒)，恢复播放`);
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
          } catch (e) {
            console.error('缓冲管理器: 获取播放速度失败', e);
          }
          
          if (currentRate < this.lastPlaybackRate) {
            this.adjustPlaybackRate(this.lastPlaybackRate);
          }
        }
      } catch (e) {
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
          } catch (e) {
            console.error('缓冲管理器: 获取视频就绪状态失败', e);
          }
          
          if (readyState >= 3) {
            this.preloadMore();
          }
        }
      } catch (e) {
        console.error('缓冲管理器: 检查预加载失败', e);
      }
    } catch (e) {
      console.error('缓冲管理器: 检查缓冲状态失败', e);
    }
  }

  // 获取缓冲区信息
  private getBufferInfo(): { bufferAhead: number, totalBuffered: number } {
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
      } catch (e) {
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
        } else if (this.videoElement) {
          currentTime = this.videoElement.currentTime || 0;
        }
      } catch (e) {
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
        } else if (this.videoElement) {
          buffered = this.videoElement.buffered;
        }
      } catch (e) {
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
      } catch (e) {
        console.error('缓冲管理器: 计算缓冲量失败', e);
      }
      
      return { bufferAhead, totalBuffered };
    } catch (e) {
      console.error('缓冲管理器: 获取缓冲信息失败', e);
      return { bufferAhead: 0, totalBuffered: 0 };
    }
  }

  // 获取前方缓冲秒数
  private getBufferAhead(): number {
    return this.getBufferInfo().bufferAhead;
  }

  // 因缓冲不足暂停播放
  private pauseForBuffering(): void {
    // 多重检查确保安全
    if (this.isDisposed) return;
    if (!this.player) return;
    if (!this.isPlayerValid()) return;
    
    // 验证player的技术实现是否有效
    let techValid = false;
    try {
      if (this.player.tech && typeof this.player.tech === 'function') {
        const tech = this.player.tech(true);
        techValid = !!(tech && tech.el_);
      }
    } catch (e) {
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
        } else if (this.videoElement) {
          isAlreadyPaused = this.videoElement.paused;
        }
      } catch (e) {
        console.error('缓冲管理器: 获取播放状态失败', e);
        return; // 如果无法确定状态，不执行暂停
      }
      
      if (isAlreadyPaused || this.pausedForBuffering) return;
      
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
      
      console.log('缓冲管理器：已暂停播放以积累缓冲');
      
      // 创建缓冲指示器
      this.createBufferingIndicator();
      
      // 设置超时保护，防止长时间无法恢复
      this.loadingTimeout = window.setTimeout(() => {
        if (this.pausedForBuffering) {
          console.log('缓冲管理器：缓冲超时，强制恢复播放');
          this.resumeFromBuffering();
        }
      }, 15000); // 15秒后强制恢复
    } catch (e) {
      console.error('缓冲管理器：暂停播放失败', e);
    }
  }

  // 从缓冲暂停中恢复
  private resumeFromBuffering(): void {
    if (!this.isPlayerValid() || !this.pausedForBuffering) return;
    
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
          playPromise.catch((err: Error) => {
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
    } catch (e) {
      console.error('缓冲管理器: 恢复播放失败', e);
    }
  }

  // 调整播放速度
  private adjustPlaybackRate(rate: number): void {
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
        console.log(`缓冲管理器：调整播放速度到 ${rate}`);
      }
    } catch (e) {
      console.error('缓冲管理器：调整播放速度失败', e);
    }
  }

  // 创建缓冲指示器
  private createBufferingIndicator(): void {
    try {
      if (!this.player || !this.player.el) return;
      
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
    } catch (e) {
      console.error('缓冲管理器：创建缓冲指示器失败', e);
    }
  }

  // 移除缓冲指示器
  private removeBufferingIndicator(): void {
    try {
      if (!this.player || !this.player.el) return;
      
      const bufferElement = this.player.el().querySelector('.vjs-buffering-text');
      if (bufferElement) {
        bufferElement.remove();
      }
    } catch (e) {
      console.error('缓冲管理器：移除缓冲指示器失败', e);
    }
  }

  // 尝试预加载更多内容
  private preloadMore(): void {
    if (!this.player || !this.videoElement || this.isLoading) return;
    
    try {
      this.isLoading = true;
      
      // 使用Media Source Extensions或其他技术请求更多内容
      // 对于HTML5 video标签，可以通过调整currentTime来触发浏览器加载更多内容
      const currentTime = this.player.currentTime();
      const duration = this.player.duration();
      
      if (duration && currentTime < duration) {
        // 在后台"触摸"缓冲区末尾附近，促使浏览器预加载更多内容
        const bufferInfo = this.getBufferInfo();
        if (bufferInfo.bufferAhead > 0) {
          // 查找当前缓冲区的结束位置
          const buffered = this.player.buffered();
          if (buffered && buffered.length > 0) {
            for (let i = 0; i < buffered.length; i++) {
              if (currentTime >= buffered.start(i) && currentTime <= buffered.end(i)) {
                const endPos = buffered.end(i);
                
                // 如果我们不在视频末尾，尝试"触摸"结束位置来促使预加载
                if (endPos < duration - 1) {
                  console.log(`缓冲管理器：预加载更多内容，触摸位置 ${endPos}`);
                  
                  // 创建一个临时的音频元素来预加载，而不影响主播放器
                  const tempAudio = new Audio();
                  tempAudio.src = this.videoElement.src;
                  tempAudio.muted = true;
                  tempAudio.preload = 'auto';
                  
                  // 设置开始位置在缓冲区末尾
                  tempAudio.addEventListener('loadedmetadata', () => {
                    tempAudio.currentTime = endPos;
                    // 触发预加载后立即停止
                    setTimeout(() => {
                      tempAudio.pause();
                      tempAudio.src = '';
                      this.isLoading = false;
                    }, 1000);
                  });
                  
                  tempAudio.load();
                  // 防止任何可能的噪音
                  tempAudio.volume = 0;
                  // 短暂播放以触发加载
                  const playPromise = tempAudio.play();
                  if (playPromise !== undefined && typeof playPromise.catch === 'function') {
                    playPromise.catch(() => {
                      // 忽略自动播放错误
                      tempAudio.pause();
                      this.isLoading = false;
                    });
                  }
                  
                  break;
                }
              }
            }
          }
        }
      }
      
      // 短暂延迟后重置加载状态
      setTimeout(() => {
        this.isLoading = false;
      }, 3000);
    } catch (e) {
      console.error('缓冲管理器：预加载更多内容失败', e);
      this.isLoading = false;
    }
  }
}

// VideoJS播放器组件
const Player: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { token, userId, getApiClient, isLoggedIn, username, login, logout } = useEmbyStore();
  const { servers, activeServerId, setActiveServer } = useServerStore(); // 添加state
  const [serverUrl, setServerUrl] = useState<string>('');
  const videoContainerRef = useRef<HTMLDivElement>(null);
  // 不再将videoElementRef作为React ref，而是普通变量，避免只读问题
  const videoElementRef = { current: null as HTMLVideoElement | null };
  const playerRef = useRef<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const [buffering, setBuffering] = useState(false);
  const [currentFormat, setCurrentFormat] = useState(0); // 0=直连
  const playerInitializedRef = useRef(false);
  
  // 播放信息状态
  const [itemInfo, setItemInfo] = useState<any>(null);
  const [isEpisode, setIsEpisode] = useState(false);
  const [seasonId, setSeasonId] = useState<string | null>(null);
  const [seriesId, setSeriesId] = useState<string | null>(null);
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [currentEpisode, setCurrentEpisode] = useState<Episode | null>(null);
  const [drawerVisible, setDrawerVisible] = useState(false);
  const [episodesLoading, setEpisodesLoading] = useState(false);
  
  // 优化缓冲状态显示
  const [showLoadingIndicator, setShowLoadingIndicator] = useState(true);
  const [bufferingMessage, setBufferingMessage] = useState<string | null>(null);
  
  // 新增状态 - 三层布局
  const [infoCollapsed, setInfoCollapsed] = useState(false);
  const [mediaStreams, setMediaStreams] = useState<MediaStream[]>([]);
  const [selectedStream, setSelectedStream] = useState<string>('auto');
  const [episodesList, setEpisodesList] = useState<Episode[]>([]);

  // 添加缺失的状态变量
  const [playbackError, setPlaybackError] = useState(false);
  const [errorRetry, setErrorRetry] = useState(false);
  const [streamUrl, setStreamUrl] = useState<string>('');
  const [mediaSource, setMediaSource] = useState<any>(null);
  const [isPlaying, setIsPlaying] = useState(false); // 添加新状态变量

  // 添加禁用自动尝试的状态
  const [autoRetryDisabled, setAutoRetryDisabled] = useState(true); // 默认禁用自动尝试
  
  // 添加字幕流状态
  const [subtitleStreams, setSubtitleStreams] = useState<any[]>([]);
  const [subtitleUrls, setSubtitleUrls] = useState<{[key: string]: string}>({});
  const [currentSubtitleIndex, setCurrentSubtitleIndex] = useState<number | null>(null);

  // 缓冲管理相关状态
  const [bufferAhead, setBufferAhead] = useState(0);
  const [totalBuffered, setTotalBuffered] = useState(0);
  const bufferManagerRef = useRef<BufferManager | null>(null);
  
  // 添加推荐项目类型定义
  interface RecommendedItem {
    Id: string;
    Name: string;
    Type: string;
    ImageTags?: {
      Primary?: string;
    };
    ProductionYear?: number;
    Overview?: string;
    RunTimeTicks?: number;
    SeriesName?: string;
  }
  
  // 添加推荐内容状态
  const [recommendedItems, setRecommendedItems] = useState<RecommendedItem[]>([]);
  const [recommendedLoading, setRecommendedLoading] = useState<boolean>(false);
  
  // 获取服务器URL
  useEffect(() => {
    // 从localStorage获取服务器URL
    const savedServerUrl = localStorage.getItem('emby_serverUrl');
    if (savedServerUrl) {
      setServerUrl(savedServerUrl);
    }
    
    // 添加存储事件监听器，当localStorage变化时更新URL
    const handleStorageChange = (e: StorageEvent) => {
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
    const handleGlobalError = (event: ErrorEvent) => {
      console.error('全局错误:', event.error || event.message);
      
      // 检查是否为播放器相关错误
      if (event.message && (
        event.message.includes('video') || 
        event.message.includes('player') || 
        event.message.includes('videojs')
      )) {
        setError(`播放器错误: ${event.message}`);
      }
    };
    
    // 添加Promise未处理的rejection处理
    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      console.error('未处理的Promise拒绝:', event.reason);
      
      // 检查是否为API或网络错误
      if (event.reason && (
        (typeof event.reason === 'object' && event.reason.message && 
         (event.reason.message.includes('network') || 
          event.reason.message.includes('api') || 
          event.reason.message.includes('fetch')))
      )) {
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
      } catch (e) {
        console.error('返回时清理播放器失败:', e);
      }
    }
    navigate(-1);
  };

  // 恢复键盘事件处理函数
  const handleKeyDown = (e: KeyboardEvent) => {
    if (!playerRef.current) return;
    
    switch (e.key) {
      case ' ':
        // 空格键暂停/播放
        if (playerRef.current.paused()) {
          playerRef.current.play();
        } else {
          playerRef.current.pause();
        }
        e.preventDefault();
        break;
      case 'ArrowRight':
        // 右箭头前进10秒
        playerRef.current.currentTime(playerRef.current.currentTime() + 10);
        e.preventDefault();
        break;
      case 'ArrowLeft':
        // 左箭头后退10秒
        playerRef.current.currentTime(playerRef.current.currentTime() - 10);
        e.preventDefault();
        break;
      case 'ArrowUp':
        // 上箭头增加音量
        playerRef.current.volume(Math.min(playerRef.current.volume() + 0.1, 1));
        e.preventDefault();
        break;
      case 'ArrowDown':
        // 下箭头减小音量
        playerRef.current.volume(Math.max(playerRef.current.volume() - 0.1, 0));
        e.preventDefault();
        break;
      case 'n':
      case 'N':
        // N键播放下一集
        if (isEpisode) playNextEpisode();
        break;
      case 'p':
      case 'P':
        // P键播放上一集
        if (isEpisode) playPreviousEpisode();
        break;
      case 'f':
      case 'F':
        // F键全屏
        if (playerRef.current.isFullscreen()) {
          playerRef.current.exitFullscreen();
        } else {
          playerRef.current.requestFullscreen();
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
      } catch (e) {
        console.error('清理播放器失败:', e);
      }
    }
    
    // 短暂延迟后初始化，重新开始计数
    setTimeout(() => {
      initializePlayer(0);
    }, 500);
  };

  // 恢复原始getStreamUrl函数，支持多种格式
  const getStreamUrl = (mediaSourceId: string | undefined, itemId: string | undefined): string => {
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
      
      // 每次请求前同步一次服务器URL
      syncServerUrl();
      
      if (!serverUrl) {
        // 显示友好的错误信息，让用户自行决定
        console.log('服务器URL不存在，无法获取媒体信息');
        setLoading(false);
        setError('正在连接到服务器，请稍等');
        return;
      }
      
      if (!token) {
        // 显示友好的错误信息，让用户自行决定
        console.log('未找到登录凭证，无法继续播放');
        setLoading(false);
        setError('登录凭证已失效，请返回首页重新登录');
        return;
      }
      
      try {
        console.log('开始获取媒体项信息，ID:', id);
        const apiClient = getApiClient();
        const response = await apiClient.get(`/Users/${userId}/Items/${id}`);
        
        if (response.data) {
          const item = response.data;
          setItemInfo(item);
          console.log('媒体项信息获取成功:', item.Name, '类型:', item.Type);
          
          // 检查是否为剧集
          if (item.Type === 'Episode') {
            console.log('检测到剧集类型，设置isEpisode=true');
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
            console.log('已设置当前剧集:', item.SeriesName, 'S' + item.ParentIndexNumber + 'E' + item.IndexNumber);
            
            // 获取该剧集所在季的所有剧集
            await fetchEpisodesForSeason(item.SeasonId);
          } else {
            // 不是剧集时，重置状态
            console.log('非剧集类型，设置isEpisode=false');
            setIsEpisode(false);
            setSeasonId(null);
            setSeriesId(null);
          }
          
          // 获取播放信息和媒体流
          fetchPlaybackInfo(item.Id);
          
          // 获取推荐内容
          setTimeout(() => {
            if (!recommendedItems.length && !recommendedLoading) {
              console.log('延迟获取推荐内容');
              fetchRecommendedItems();
            }
          }, 1000);
        }
      } catch (error) {
        console.error('获取媒体项信息失败:', error);
        setError('获取媒体信息失败，请检查网络连接或刷新重试');
        setLoading(false);
      }
    };
    
    if (id) {
    fetchItemInfo();
    }
  }, [id, serverUrl, token, userId, getApiClient, recommendedItems.length, recommendedLoading]);
  
  // 获取播放信息和媒体流
  const fetchPlaybackInfo = async (itemId: string) => {
    // 确保使用最新的服务器URL
    const currentServerUrl = localStorage.getItem('emby_serverUrl') || serverUrl;
    const currentToken = token; // 缓存当前token，避免在请求过程中变化
    
    if (!currentServerUrl || !currentToken || !itemId) {
      setError('缺少必要参数，请确保已登录并选择正确的服务器');
      setLoading(false);
      return;
    }
    
    // 如果服务器URL已变更，则更新状态
    if (currentServerUrl !== serverUrl) {
      console.log('检测到服务器URL不匹配，正在更新:', currentServerUrl);
      setServerUrl(currentServerUrl);
    }
    
    try {
      console.log(`获取播放信息，使用服务器: ${currentServerUrl}, ID: ${itemId}`);
      const apiClient = getApiClient();
      
      // 显式构建完整URL，确保使用最新服务器地址
      const playbackInfoUrl = `${currentServerUrl}/emby/Items/${itemId}/PlaybackInfo`;
      console.log('请求URL:', playbackInfoUrl);
      
      const response = await apiClient.post(playbackInfoUrl, {
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
        console.log('获取到完整媒体源信息:', JSON.stringify(mediaSourceData, null, 2).substring(0, 500) + '...');
        setMediaSource(mediaSourceData);
        
        // 提取不同码率的媒体流
        const streams: MediaStream[] = [];
        
        // 添加自动选择选项
        streams.push({
          id: 'auto',
          name: '自动',
          bitrate: 0,
          url: getStreamUrl(mediaSourceData.Id, itemId)
        });
        
        // 添加直连选项
        streams.push({
          id: 'direct',
          name: '直连',
          bitrate: mediaSourceData.Bitrate || 0,
          url: getStreamUrl(mediaSourceData.Id, itemId)
        });
        
        // 添加HLS选项
        streams.push({
          id: 'hls',
          name: 'HLS流',
          bitrate: mediaSourceData.Bitrate || 0,
          url: getStreamUrl(mediaSourceData.Id, itemId)
        });
        
        // 添加MP4转码选项
        streams.push({
          id: 'mp4',
          name: 'MP4转码',
          bitrate: mediaSourceData.Bitrate || 0,
          url: getStreamUrl(mediaSourceData.Id, itemId)
        });
        
        setMediaStreams(streams);
        console.log('设置媒体流:', streams);
        
        // 提取并处理字幕流
        if (mediaSourceData.MediaStreams) {
          // 找出所有字幕流
          const subtitleStreams = mediaSourceData.MediaStreams.filter(
            (stream: any) => stream.Type === 'Subtitle'
          );
          
          console.log(`找到 ${subtitleStreams.length} 个字幕流`);
          
          // 如果有字幕流，准备加载字幕
          if (subtitleStreams.length > 0) {
            // 将字幕流信息保存起来，以便后续使用
            setSubtitleStreams(subtitleStreams);
            fetchSubtitles(itemId, subtitleStreams);
          }
        }
      } else {
        console.error('未获取到媒体源信息');
      }
    } catch (error: any) {
      console.error('获取播放信息失败:', error);
      
      // 检查是否为401授权错误
      if (error.response && error.response.status === 401) {
        handle401Error(error);
      } else {
        // 其他类型错误
        setError(`获取媒体信息失败: ${error.message || '未知错误'}`);
        setLoading(false);
      }
    }
  };

  // 获取指定季的所有剧集
  const fetchEpisodesForSeason = async (seasonId: string) => {
    if (!seasonId || !token || !userId) return;
    
    // 确保使用最新的服务器URL
    const currentServerUrl = localStorage.getItem('emby_serverUrl') || serverUrl;
    if (!currentServerUrl) {
      console.error('未找到服务器URL，无法获取剧集');
      return;
    }
    
    try {
      setEpisodesLoading(true);
      console.log('开始获取季节剧集，服务器:', currentServerUrl, '季节ID:', seasonId);
      
      const apiClient = getApiClient();
      
      // 直接使用标准的Episodes接口，更可靠
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
        console.error('获取剧集响应异常:', response);
        message.error('获取剧集失败: 响应格式不正确');
        setEpisodesLoading(false);
        
        // 尝试备用方法获取剧集
        console.log('尝试备用方法获取剧集...');
        await fetchEpisodesAlternative(seasonId);
        return;
      }
      
      const episodes = response.data.Items.map((item: any) => ({
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
      
      // 按集数排序
      episodes.sort((a: Episode, b: Episode) => 
        (a.IndexNumber || 0) - (b.IndexNumber || 0)
      );
      
      console.log(`获取到 ${episodes.length} 集剧集`);
      setEpisodesList(episodes);
    } catch (error) {
      console.error('获取季节剧集失败:', error);
      message.error('获取剧集列表失败，尝试备用方法...');
      
      // 尝试备用方法获取剧集
      await fetchEpisodesAlternative(seasonId);
    } finally {
      setEpisodesLoading(false);
    }
  };

  // 备用方法获取剧集
  const fetchEpisodesAlternative = async (seasonId: string) => {
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
        const episodes = response.data.Items.map((item: any) => ({
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
        
        episodes.sort((a: Episode, b: Episode) => 
              (a.IndexNumber || 0) - (b.IndexNumber || 0)
            );
            
        console.log(`备用方法获取到 ${episodes.length} 集剧集`);
        setEpisodesList(episodes);
          } else {
        console.error('备用方法获取剧集失败');
        message.error('获取剧集列表失败');
          }
        } catch (error) {
      console.error('备用方法获取剧集失败:', error);
      message.error('获取剧集列表失败');
    }
  };

  // 切换到指定剧集
  const switchToEpisode = (episode: Episode) => {
    if (!episode || !episode.Id) return;
    
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
      } catch (e) {
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
    } else {
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
    } else {
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
      } catch (e) {
        console.error('播放上一帧失败:', e);
      }
    }
  };
  
  // 获取字幕
  const fetchSubtitles = async (itemId: string, subtitleStreams: any[]) => {
    if (!subtitleStreams || subtitleStreams.length === 0) return;
    
    const urls: {[key: string]: string} = {};
    
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
  const switchSubtitle = (index: number | null) => {
    console.log('切换字幕到:', index);
    setCurrentSubtitleIndex(index);
    
    if (!playerRef.current) return;
    
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
    if (!subtitleStreams || subtitleStreams.length === 0) return;
    
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
    const menuItems = (
      <Menu>
        {items.map(item => (
          <Menu.Item key={item.key} onClick={item.onClick}>
            {item.label}
          </Menu.Item>
        ))}
      </Menu>
    );
    
    // 使用message提示显示字幕选择选项
    message.info({
      content: (
        <div className="subtitle-selector">
          <h4>选择字幕</h4>
          <List
            size="small"
            bordered
            dataSource={items}
            renderItem={item => (
              <List.Item 
                onClick={item.onClick}
                className={item.key === `subtitle-${currentSubtitleIndex}` ? 'active' : ''}
              >
                {item.label}
              </List.Item>
            )}
          />
        </div>
      ),
      duration: 5,
      style: {
        marginTop: '20vh'
      }
    });
  };
  
  // 简化播放器初始化函数
  const initializePlayer = (retryCount = 0) => {
    if (playerInitializedRef.current || !id) return;
    
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
      } catch (e) {
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
      const nonPlayerElements: Array<Element> = [];
      
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
      
      console.log(`初始化播放器，URL: ${videoUrl}`);
      
      // 初始化播放器
      const player = videojs(videoElement, config);
      
      // 确保控制栏正常工作
      const enhanceControlBar = () => {
        try {
          // @ts-ignore
          const controlBar = player.el().querySelector('.vjs-control-bar');
          if (!controlBar) return;
          
          // 确保控制栏可见性和交互性
          (controlBar as HTMLElement).style.opacity = '1';
          (controlBar as HTMLElement).style.visibility = 'visible';
          (controlBar as HTMLElement).style.pointerEvents = 'auto';
          (controlBar as HTMLElement).style.zIndex = '200';
          
          // 确保所有按钮可点击
          const buttons = controlBar.querySelectorAll('button, .vjs-control');
          buttons.forEach((button) => {
            const buttonElement = button as HTMLElement;
            buttonElement.style.pointerEvents = 'auto';
            buttonElement.style.cursor = 'pointer';
            buttonElement.style.zIndex = '210';
            
            // 添加触摸事件监听器 - 移动设备上可能需要
            buttonElement.addEventListener('touchstart', function(e) {
              e.stopPropagation();
            }, {passive: false});
          });
          
          // 确保进度条可点击
          const progressControl = controlBar.querySelector('.vjs-progress-control');
          if (progressControl) {
            (progressControl as HTMLElement).style.pointerEvents = 'auto';
          }
          
          // 确保音量控制可点击
          const volumePanel = controlBar.querySelector('.vjs-volume-panel');
          if (volumePanel) {
            (volumePanel as HTMLElement).style.pointerEvents = 'auto';
          }
          
          console.log('已增强控制栏交互能力');
        } catch (e) {
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
      player.ready(function() {
        // 尝试解除静音
        player.muted(false);
        player.volume(1.0);
        console.log('播放器就绪，音量:', player.volume(), '静音状态:', player.muted());
        
        // 改进进度条点击和拖动功能
        function enhanceProgressControl() {
          try {
            // @ts-ignore - 类型定义不完整
            const progressControl = player.el().querySelector('.vjs-progress-control') as HTMLElement;
            if (!progressControl) return;
            
            // 确保进度条的点击事件不会被阻止
            progressControl.style.pointerEvents = 'auto';
            
            // 手动绑定点击事件以确保进度条可用
            progressControl.addEventListener('click', function(e: MouseEvent) {
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
            const seekBar = progressControl.querySelector('.vjs-progress-holder') as HTMLElement;
            if (seekBar) {
              // 进度条容器也需要可点击
              seekBar.style.pointerEvents = 'auto';
              seekBar.style.cursor = 'pointer';
              
              // 进度条滑块点击事件
              seekBar.addEventListener('click', function(e: MouseEvent) {
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
      } catch (e) {
            console.error('增强进度条功能失败:', e);
          }
        }
        
        // 在播放器准备好后增强进度条
        setTimeout(enhanceProgressControl, 500);
        
        // 增强音量控制
        function enhanceVolumeControl() {
          try {
            // @ts-ignore - 类型定义不完整
            const volumePanel = player.el().querySelector('.vjs-volume-panel') as HTMLElement;
            if (!volumePanel) return;
            
            // 确保音量面板展开时仍保持可见
            volumePanel.addEventListener('mouseenter', function() {
              volumePanel.classList.add('vjs-hover');
            });
            
            volumePanel.addEventListener('mouseleave', function() {
              setTimeout(() => {
                volumePanel.classList.remove('vjs-hover');
              }, 500);
            });
            
            console.log('已增强音量控制功能');
          } catch (e) {
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
            } else {
              console.log('未检测到音频轨道');
            }
          } else {
            console.log('不支持音频轨道API');
          }
        } catch (e) {
          console.error('设置音频轨道时出错:', e);
        }

        // 检查并报告视频状态
        console.log('视频元素就绪:', {
          音量: player.volume(),
          静音: player.muted(),
          自动播放: player.autoplay()
        });

        // 如果有字幕流，添加字幕按钮
        if (subtitleStreams && subtitleStreams.length > 0) {
          console.log(`播放器准备好，发现${subtitleStreams.length}个字幕流`);
          
          // 自动选择第一个字幕
          if (currentSubtitleIndex === null && subtitleStreams.length > 0) {
            const firstSubtitleIndex = subtitleStreams[0].Index;
            switchSubtitle(firstSubtitleIndex);
          } else if (currentSubtitleIndex !== null) {
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
          } catch (e) {
            console.error('添加字幕按钮失败:', e);
          }
        }
      });
      
      // 事件监听
      player.on('error', (e: any) => {
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
          switch(error.code) {
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
        } else {
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
                if (bufferElement) bufferElement.remove();
                player.play();
              } catch (e) {
                console.error('恢复播放失败:', e);
              }
            }, 10000);
          }
        } catch (e) {
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
        } catch (e) {
          console.error('监控缓冲进度失败:', e);
        }
      });
      
      player.on('canplay', () => {
        console.log('视频可以播放');
        setBuffering(false);
      });
      
      player.on('playing', () => {
        console.log('视频开始播放');
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
          if (!player || !player.paused || typeof player.paused !== 'function') return;
          
          // 检查是否暂停状态
          if (player.paused()) return;
          
          const now = Date.now();
          const timeSinceLastCheck = (now - lastPlaybackQualityCheckTime) / 1000;
          lastPlaybackQualityCheckTime = now;
          
          // 获取当前缓冲状态
          if (!player.buffered || typeof player.buffered !== 'function') return;
          
          const bufferedTimeRanges = player.buffered();
          
          if (!player.currentTime || typeof player.currentTime !== 'function') return;
          
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
          if (!player.playbackRate || typeof player.playbackRate !== 'function') return;
          
          // 获取当前播放速度并提供默认值
          const currentRate = player.playbackRate() || 1;
          
          if (bufferAhead < 5 && currentRate >= 1) {
            // 缓冲不足，降低播放速度减少卡顿
            lastPlaybackRate = currentRate;
            player.playbackRate(0.9);
            console.log('缓冲不足，降低播放速度到0.9以减少卡顿');
          } else if (bufferAhead > 20 && currentRate < 1) {
            // 缓冲充足，恢复播放速度
            player.playbackRate(lastPlaybackRate);
            console.log('缓冲充足，恢复播放速度');
          }
        } catch (e) {
          console.error('播放质量监控失败:', e);
        }
      }, 5000);
      
      // 清理定时器
      player.on('dispose', () => {
        clearInterval(playbackQualityInterval);
      });

      // 初始化缓冲管理器
      const handleBufferingChange = (buffering: boolean) => {
        setBuffering(buffering);
        // 更新UI上的缓冲状态
        if (buffering) {
          setBufferingMessage('视频缓冲中...');
        } else {
          setBufferingMessage(null);
        }
      };
      
      const handleBufferUpdate = (bufferAhead: number, totalBuffered: number) => {
        setBufferAhead(bufferAhead);
        setTotalBuffered(totalBuffered);
      };
      
      // 创建缓冲管理器实例
      if (videoElement) {
        bufferManagerRef.current = new BufferManager(
          player,
          videoElement,
          handleBufferingChange,
          handleBufferUpdate
        );
      }

      player.ready(function() {
        // ... 现有代码 ...

        // 移除原有的缓冲处理逻辑，交给BufferManager处理
        console.log('视频元素就绪，缓冲管理器已启动');
      });
      
      // 简化事件监听，让缓冲管理器处理缓冲逻辑
      player.on('error', (e: any) => {
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
            playPromise.catch((err: Error) => {
              console.error('自动播放失败:', err);
            });
          }
        } catch (e) {
          console.error('调用播放失败:', e);
        }
      }
      
      // 在这里添加缓冲管理器的初始化代码
      console.log('播放器就绪，开始设置缓冲管理器');
      
      // 确保视频元素准备就绪
      setTimeout(() => {
        // 创建缓冲管理器实例
        if (videoElement && !bufferManagerRef.current) {
          try {
            const handleBufferingChange = (buffering: boolean) => {
              setBuffering(buffering);
              // 更新UI上的缓冲状态
              if (buffering) {
                setBufferingMessage('视频缓冲中...');
              } else {
                setBufferingMessage(null);
              }
            };
            
            const handleBufferUpdate = (bufferAhead: number, totalBuffered: number) => {
              setBufferAhead(bufferAhead);
              setTotalBuffered(totalBuffered);
            };
            
            bufferManagerRef.current = new BufferManager(
              player,
              videoElement,
              handleBufferingChange,
              handleBufferUpdate
            );
            
            console.log('缓冲管理器创建完成');
          } catch (e) {
            console.error('创建缓冲管理器失败:', e);
          }
        }
      }, 1000); // 延迟创建缓冲管理器，确保播放器和视频元素都已准备就绪
    } catch (e) {
      console.error('初始化播放器失败:', e);
      setError('初始化播放器失败，请刷新页面重试');
      setLoading(false);
    }
  };

  // 添加自定义控制按钮
  const addCustomControlButtons = (player: any) => {
    // 自定义按钮创建函数
    const createButton = (
      iconClass: string, 
      text: string, 
      clickHandler: () => void,
      className: string
    ) => {
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
      } catch (e) {
      console.error('添加自定义控制按钮失败:', e);
    }
  };

  // 渲染码流选择菜单
  const renderStreamMenu = () => {
    return <Menu className="format-select-dropdown"></Menu>;
  };

  // 处理视频错误
  const handleVideoError = (e: React.SyntheticEvent<HTMLVideoElement, Event>) => {
    console.error('视频元素错误:', e);
    
    // 获取视频元素的错误信息
    const videoError = (e.target as HTMLVideoElement).error;
    setPlaybackError(true);
    setLoading(false);
    
    // 提供详细的错误信息
    if (videoError) {
      switch(videoError.code) {
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
    } else {
      setError('视频播放失败，请手动选择其他格式');
    }
  };

  // 切换信息面板折叠状态
  const toggleInfoPanel = () => {
    setInfoCollapsed(!infoCollapsed);
  };

  // 格式化运行时间
  const formatRuntime = (ticks?: number) => {
    if (!ticks) return '未知';
    
    const seconds = Math.floor(ticks / 10000000);
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    
    if (hours > 0) {
      return `${hours}小时${minutes}分钟`;
    } else {
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
    } catch (e) {
      console.error('检查浏览器能力失败:', e);
    }
  };

  // 确保添加事件监听器和播放器初始化
  useEffect(() => {
    if (!id || !serverUrl || !token) return;
    
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
        } catch (e) {
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
      console.log('首次加载尝试初始化播放器');
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
      } catch (e) {
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
      console.log('服务器URL已变更，重新初始化播放器');
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
  const handle401Error = (error: any) => {
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
      } catch (e) {
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
        (videoJsContainer as HTMLElement).style.width = '100%';
        (videoJsContainer as HTMLElement).style.height = '100%';
        (videoJsContainer as HTMLElement).style.display = 'block';
        (videoJsContainer as HTMLElement).style.zIndex = '5';
      }
      
      // 检查video元素
      const videoElement = document.querySelector('.video-js video');
      if (videoElement) {
        (videoElement as HTMLElement).style.width = '100%';
        (videoElement as HTMLElement).style.height = '100%';
        (videoElement as HTMLElement).style.display = 'block';
        (videoElement as HTMLElement).style.zIndex = '10';
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
  const handleServerChange = (serverId: string) => {
    setActiveServer(serverId);
    message.success('已切换服务器');
  };

  // 服务器菜单项
  const serverMenuItems = {
    items: [
      ...servers.map(server => ({
        key: server.id,
        label: server.name as React.ReactNode,
        onClick: () => handleServerChange(server.id)
      })),
      {
        type: 'divider' as const,
        key: 'divider'
      },
      {
        key: 'manage',
        label: (
          <span>
            <SettingOutlined /> 管理服务器
          </span>
        ) as React.ReactNode,
        onClick: () => navigate('/settings')
      },
    ]
  };

  // 添加缓冲统计信息到界面
  const renderBufferStats = () => {
    if (!isPlaying || bufferAhead <= 0) return null;
    
    return (
      <div className="buffer-stats" style={{ position: 'absolute', bottom: '4em', right: '10px', 
                                           background: 'rgba(0,0,0,0.5)', padding: '5px', 
                                           color: 'white', fontSize: '12px', borderRadius: '4px' }}>
        已缓冲: {bufferAhead.toFixed(1)}秒
      </div>
    );
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
      const genreIds = itemInfo.GenreItems?.map((g: any) => g.Id).join(',') || '';
      
      // 构建请求参数 - 根据当前内容类型和流派获取相似内容
      const params: any = {
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
      } else {
        // 默认获取混合内容
        params.IncludeItemTypes = 'Movie,Series';
      }
      
      const response = await apiClient.get(`/Users/${userId}/Items`, { params });
      
      if (response.data && response.data.Items) {
        setRecommendedItems(response.data.Items);
      }
    } catch (error) {
      console.error('获取推荐内容失败:', error);
    } finally {
      setRecommendedLoading(false);
    }
  };
  
  // 获取图片URL的函数
  const getRecommendedImageUrl = (item: RecommendedItem) => {
    if (item.ImageTags?.Primary) {
      return `${serverUrl}/Items/${item.Id}/Images/Primary?width=200&quality=90&api_key=${token}`;
    }
    return 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTUwIiBoZWlnaHQ9IjIyNSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTUwIiBoZWlnaHQ9IjIyNSIgZmlsbD0iIzJhMmEyYSIgLz48dGV4dCB4PSI3NSIgeT0iMTEyLjUiIGZvbnQtZmFtaWx5PSJBcmlhbCIgZm9udC1zaXplPSIxMnB4IiBmaWxsPSIjOTk5IiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBhbGlnbm1lbnQtYmFzZWxpbmU9Im1pZGRsZSI+Tm8gSW1hZ2U8L3RleHQ+PC9zdmc+';
  };
  
  // 处理推荐项点击事件
  const handleRecommendedItemClick = (item: RecommendedItem) => {
    if (item.Type === 'Movie') {
      navigate(`/player/${item.Id}`);
    } else if (item.Type === 'Series') {
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
  
  // 主要渲染函数
  return (
    <div className="player-container">
      {/* 顶部区域 - 视频播放器 */}
      <div 
        className="video-area" 
        ref={videoContainerRef} 
        style={{ 
          position: 'relative', 
          overflow: 'hidden', 
          backgroundColor: '#000',
          width: '100%', 
          height: 'calc(100vh - 350px)', // 减去header、底部和推荐区域的高度
          minHeight: '280px'
        }}
      >
        {/* 视频加载状态指示器 */}
        {loading && (
          <div className="player-loading">
            <Spin size="large" tip="正在加载视频..." />
          </div>
        )}
        
        {/* 缓冲状态指示器 */}
        {!loading && buffering && (
          <div className="player-loading">
            <Spin size="default" tip="视频缓冲中..." />
        </div>
        )}
        
        {/* 错误状态指示器 */}
        {error && !isPlaying && (
          <div className="player-error">
            <div className="error-message">{error}</div>
            <div className="error-actions">
              <Button type="primary" onClick={handleRetry}>
                重试
              </Button>
              <Button onClick={handleBack}>返回</Button>
              <Button onClick={redirectToLogin} type="default">重新登录</Button>
            </div>
          </div>
        )}
              </div>
      
      {/* 中间区域 - 视频信息详情 */}
      {itemInfo && !loading && (
        <div className="media-info-area">
          <div className="media-info-header">
            <h2>
              {isEpisode && itemInfo.SeriesName ? (
                <>{itemInfo.SeriesName} - S{itemInfo.ParentIndexNumber}E{itemInfo.IndexNumber} {itemInfo.Name}</>
              ) : (
                itemInfo.Name
              )}
            </h2>
            <div className="header-controls">
              <button 
                className={`toggle-info-btn ${infoCollapsed ? 'collapsed' : ''}`} 
                onClick={toggleInfoPanel}
              >
                {infoCollapsed ? '展开' : '收起'} <span className="arrow-icon">{infoCollapsed ? <DownOutlined /> : <UpOutlined />}</span>
              </button>
            </div>
          </div>
          
          <div className={`media-info-content ${infoCollapsed ? 'collapsed' : ''}`}>
            {itemInfo.Overview && (
              <>
                <h3>简介</h3>
                <Paragraph ellipsis={{ rows: 3, expandable: true, symbol: '展开' }}>
                  {itemInfo.Overview}
                </Paragraph>
              </>
            )}
            
            {itemInfo.RunTimeTicks && (
              <p>时长: {formatRuntime(itemInfo.RunTimeTicks)}</p>
            )}
                </div>
      </div>
      )}
      
      {/* 底部区域 - 剧集选择 */}
      {isEpisode && episodesList.length > 0 && (
        <div className="episodes-area">
          <div className="episodes-header">
            <h3>剧集选择</h3>
            <div className="episode-controls">
            <Button 
                icon={<StepBackwardOutlined />} 
                onClick={playPreviousEpisode}
                disabled={!currentEpisode || episodesList.findIndex(ep => ep.Id === currentEpisode.Id) <= 0}
                type="text"
              />
              <Button 
                icon={<StepForwardOutlined />} 
                onClick={playNextEpisode}
                disabled={!currentEpisode || episodesList.findIndex(ep => ep.Id === currentEpisode.Id) >= episodesList.length - 1}
                type="text"
              />
          </div>
                </div>
          
          <div className="episodes-list">
            {episodesLoading ? (
              <Spin size="small" />
            ) : (
              episodesList.map((episode, index) => (
                <div 
                      key={episode.Id}
                  className={`episode-item ${currentEpisode && episode.Id === currentEpisode.Id ? 'active' : ''}`}
                      onClick={() => switchToEpisode(episode)}
                  title={`${episode.Name} - ${formatRuntime(episode.RunTimeTicks)}`}
                >
                  <div className="episode-number">第{episode.IndexNumber}集</div>
                  <div className="episode-title">{episode.Name}</div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
      
      {/* 新增: 底部区域 - 推荐内容 */}
      {itemInfo && (
        <div className="recommended-area">
          <div className="recommended-header">
            <h3>猜你喜欢</h3>
            <Button 
              type="text" 
              onClick={fetchRecommendedItems}
              size="small"
              icon={<ReloadOutlined />}
            >
              刷新推荐
            </Button>
          </div>
          
          <div className="recommended-content">
            {recommendedLoading ? (
              <div className="loading-container">
                <Spin size="default" tip="加载推荐内容..." />
              </div>
            ) : recommendedItems.length > 0 ? (
              <div className="recommended-items">
                {recommendedItems.map(item => (
                  <Card
                    key={item.Id}
                    hoverable
                    className="recommended-item"
                    cover={<img alt={item.Name} src={getRecommendedImageUrl(item)} />}
                    onClick={() => handleRecommendedItemClick(item)}
                  >
                    <Card.Meta 
                      title={item.Name} 
                      description={
                        <div className="recommended-item-info">
                          <div>{item.Type === 'Movie' ? '电影' : '剧集'} {item.ProductionYear && `· ${item.ProductionYear}`}</div>
                        </div>
                      } 
                    />
                  </Card>
                ))}
              </div>
            ) : (
              <div className="no-recommendations">
                暂无推荐内容（调试模式）
              </div>
            )}
          </div>
        </div>
      )}

      {/* 添加缓冲统计 */}
      {renderBufferStats()}
    </div>
  );
};

export default Player; 