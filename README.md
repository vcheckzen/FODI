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

#### 更新

##### 2025.02.12

- 实现部分 Webdav 功能（列表，上传，下载，复制，移动）

##### 2024.09.15

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

##### WEBDAV

- 账号密码设置: 在 **变量和机密** 设置 **秘钥**，变量名为 `WEBDAV`, 形如

```json
{
  "user1": "password",
  "user2": "password"
}
```

- 文件上传限制: FreePlan 100MB, BusinessPlan 200MB, EnterprisePlan 500MB

##### 预览

- pdf: 如果需要使用本地 pdf 预览，请前往 [PDF.js](https://mozilla.github.io/pdf.js/) 下载文件并解压命名为 `pdfjs` ，注释掉 `viewer.mjs` 的 `fileOrigin !== viewerOrigin` 条件，并修改 `//mozilla.github.io/pdf.js/web/viewer.html?file=`
- markdown: 网页在 `Optional Markdown extensions` 可选择是否启用 github alert 与 katex 格式

##### 下载

- `return downloadFile(file, requestUrl.searchParams.get('format'), true);` 可加上第三个参数让 worker 代理
- 访问 `https://example.com/a.html?format=` 可添加转换的目标格式，[支持转换格式](https://learn.microsoft.com/zh-cn/onedrive/developer/rest-api/api/driveitem_get_content_format?view=odsp-graph-online#format-options)
