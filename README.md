# FODI

Fast OneDrive Index / FODI，无需服务器的 OneDrive 快速列表程序

#### 预览

- [DEMO](https://logi.im/fodi.html)

#### 功能

- 指定展示路径
- 特定文件夹加密
- 无需服务器免费部署
- 基本文本、图片、音视频和 Office 三件套预览

#### 缺点

- 功能简单，界面简陋
- 不支持巨硬家的 IE 和 UWP 版 EDGE 浏览器
- 可能不支持包含千级数量以上文件的文件夹展示

#### 更新

#### 2024.09.15

- 支持上传（在上传目录创建 `.upload` 文件）

##### 2019.12.23

- 进一步提升速度
- 增加 Cloudflare Workers 后端

##### 2019.12.07

- 进一步提升速度
- 增加 Python3.6 后端

#### 安装

- [在 Cloudflare 部署 FODI 后端](https://logi.im/back-end/fodi-on-cloudflare.html)
- [FODI Deployment Helper](https://logi.im/fodi/get-code/)

#### 说明

- 如果需要使用本地 pdf 预览，请前往 [PDF.js](https://mozilla.github.io/pdf.js/) 下载文件并解压命名为 `pdfjs` ，注释掉 `viewer.mjs` 的 `fileOrigin !== viewerOrigin` 条件
