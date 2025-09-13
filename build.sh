#!/bin/bash

# Emby桌面播放器构建脚本
# 用法：./build.sh [mac|mac-universal|win|all]

# 设置颜色输出
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m' # 无颜色

# 清理函数
clean_build() {
  echo -e "${YELLOW}清理历史构建文件...${NC}"
  rm -rf dist dist_electron
  if [ $? -eq 0 ]; then
    echo -e "${GREEN}清理完成${NC}"
  else
    echo -e "${RED}清理失败，请检查文件权限${NC}"
    exit 1
  fi
}

# 构建基础函数 - 使用正确的构建命令
build_base() {
  echo -e "${BLUE}开始Vite构建...${NC}"
  npx vite build
  
  if [ $? -ne 0 ]; then
    echo -e "${RED}构建失败${NC}"
    exit 1
  fi
  
  echo -e "${GREEN}基础构建完成${NC}"
}

# 构建macOS ARM版本
build_mac() {
  echo -e "${BLUE}开始构建macOS ARM版本...${NC}"
  npx electron-builder --mac
  
  if [ $? -eq 0 ]; then
    echo -e "${GREEN}macOS ARM版本构建完成${NC}"
  else
    echo -e "${RED}macOS ARM版本构建失败${NC}"
    exit 1
  fi
}

# 使用指定的命令构建（npx vite build && npx electron-builder --mac）
build_direct() {
  echo -e "${BLUE}开始直接构建...${NC}"
  npx vite build && npx electron-builder --mac
  
  if [ $? -eq 0 ]; then
    echo -e "${GREEN}直接构建完成${NC}"
  else
    echo -e "${RED}直接构建失败${NC}"
    exit 1
  fi
}

# 构建macOS通用版本
build_mac_universal() {
  echo -e "${BLUE}开始构建macOS通用版本...${NC}"
  npx electron-builder --mac --universal
  
  if [ $? -eq 0 ]; then
    echo -e "${GREEN}macOS通用版本构建完成${NC}"
  else
    echo -e "${RED}macOS通用版本构建失败${NC}"
    exit 1
  fi
}

# 构建Windows版本
build_win() {
  echo -e "${BLUE}开始构建Windows版本...${NC}"
  npx electron-builder --win
  
  if [ $? -eq 0 ]; then
    echo -e "${GREEN}Windows版本构建完成${NC}"
  else
    echo -e "${RED}Windows版本构建失败${NC}"
    exit 1
  fi
}

# 显示构建结果
show_results() {
  echo -e "${BLUE}构建结果:${NC}"
  ls -lh dist_electron/
}

# 主函数
main() {
  # 检查是否有参数
  if [ $# -eq 0 ]; then
    echo -e "${YELLOW}未指定构建目标，默认使用直接构建方式${NC}"
    TARGET="direct"
  else
    TARGET=$1
  fi
  
  # 清理历史文件
  clean_build
  
  # 执行基础构建
  build_base
  
  # 根据目标构建相应版本
  case $TARGET in
    mac)
      build_mac
      ;;
    direct)
      build_direct
      ;;
    mac-universal)
      build_mac_universal
      ;;
    win)
      build_win
      ;;
    all)
      build_mac
      build_mac_universal
      build_win
      ;;
    *)
      echo -e "${RED}未知的构建目标: $TARGET${NC}"
      echo -e "${YELLOW}可用目标: mac, direct, mac-universal, win, all${NC}"
      exit 1
      ;;
  esac
  
  # 显示构建结果
  show_results
  
  echo -e "${GREEN}构建过程完成！${NC}"
}

# 执行主函数
main "$@" 