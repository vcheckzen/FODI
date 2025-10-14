# FODI

Fast OneDrive Index / FODI，无需服务器的 OneDrive 快速列表程序

## 预览

- [DEMO](https://logi.im/fodi.html)

## 功能

- 指定展示路径
- 特定文件夹加密
- 无需服务器免费部署
- 基本文本、图片、音视频和 Office 三件套预览

## 缺点

- 功能简单，界面简陋
- 不支持巨硬家的 IE 和 UWP 版 EDGE 浏览器

## 部署

### 一键部署

> [!CAUTION]
> Supported only for personal accounts; use alternatives for other types account. Creating your own app is recommended.<br>
> 仅支持个人版，其他版本请使用替代部署方案，建议自行创建应用。

1. [![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/vcheckzen/FODI)
2. 访问域名加上 `/deployfodi`

> [!NOTE]
> 更新仓库后需获取 [kv_namespaces id](https://dash.cloudflare.com/?to=/:account/workers/kv/namespaces) 填入 `wrangler.jsonc`

### 在线导入

1. [把项目导入到自己 Github 的私有仓库](https://docs.github.com/en/migrations/importing-source-code/using-github-importer/importing-a-repository-with-github-importer#importing-a-repository-with-github-importer)
2. 编辑 `wrangler.jsonc` 并提交修改
3. [从 Cloudflare 控制台导入你的 Github 仓库](https://dash.cloudflare.com/?to=/:account/workers-and-pages/create)

<details>
    <summary>或者</summary>

### 命令推送

```sh
git clone https://github.com/vcheckzen/FODI.git
cd FODI
# edit wrangler.jsonc, then
npm i wrangler
npm run deploy
# webdav config
npx wrangler secret put USERNAME
npx wrangler secret put PASSWORD
```

</details>

### EdgeOne 加速

[![使用 EdgeOne Pages 部署](https://cdnstatic.tencentcs.com/edgeone/pages/deploy.svg)](https://edgeone.ai/pages/new?repository-url=https%3A%2F%2Fgithub.com%2Fvcheckzen%2FFODI%2Ftree%2Fmaster%2Ffront-end)

<details>
    <summary>其它事项</summary>

## 配置

### 加密

- 方式 1：在自定义的密码文件中填入 sha256 后的哈希值
- 方式 2：环境变量 `PASSWORD` 的值

### WEBDAV

- 账号密码设置: 在 **变量和机密** 设置 **秘钥**，变量名为 `USERNAME` 与 `PASSWORD`
- 文件上传限制: FreePlan 100MB, BusinessPlan 200MB, EnterprisePlan 500MB

### 预览

- pdf: 如果需要使用本地 pdf 预览，请前往 [PDF.js](https://mozilla.github.io/pdf.js/) 下载文件并解压命名为 `pdfjs` ，注释掉 `viewer.mjs` 的 `fileOrigin !== viewerOrigin` 条件，并修改 `//mozilla.github.io/pdf.js/web/viewer.html?file=`
- markdown: 网页在 `Optional Markdown extensions` 可选择是否启用 github alert 与 katex 格式

### 下载

- 通过 `PROXY_KEYWORD` 访问可让 worker 代理
- 访问 `https://example.com/a.html?format=` 可添加转换的目标格式，[支持转换格式](https://learn.microsoft.com/zh-cn/onedrive/developer/rest-api/api/driveitem_get_content_format?view=odsp-graph-online#format-options)
- 链接携带参数名 `forceRefresh`，值为 sha256 后的 `PASSWORD` 可强制刷新缓存

## 更新

### 2025.02.12

- 实现部分 Webdav 功能（列表，上传，下载，复制，移动）

### 2024.09.15

- 支持上传（在上传目录创建 `.upload` 文件）

</details>
