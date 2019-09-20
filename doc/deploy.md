# 10 分钟部署 FODI

## SCF 简介

腾讯云云函数（Serverless Cloud Function，SCF）是腾讯云为企业和开发者们提供的无服务器执行环境，帮助您在无需购买和管理服务器的情况下运行代码，是实时文件处理和数据处理等场景下理想的计算平台。您只需使用 SCF 平台支持的语言编写核心代码并设置代码运行的条件，即可在腾讯云基础设施上弹性、安全地运行代码。

无服务器（Serverless）不是表示没有服务器，而表示当您在使用 Serverless 时，您无需关心底层资源，也无需登录服务器和优化服务器，只需关注最核心的代码片段，即可跳过复杂的、繁琐的基本工作。核心的代码片段完全由事件或者请求触发，平台根据请求自动平行调整服务资源。Serverless 拥有近乎无限的扩容能力，空闲时，不运行任何资源。代码运行无状态，可以轻易实现快速迭代、极速部署。

腾讯云 SCF 目前仍在 [公测](https://cloud.tencent.com/document/product/583/17299) 阶段，所有用户可免费使用，结束日期待定。公测结束后，每月仍可享受足量的 [免费资源使用量和免费调用次数](https://cloud.tencent.com/document/product/583/12282)，但收取 `外网出流量` 费用。

| 资源类型   | 每月免费额度 |
| ---------- | ------------ |
| 资源使用量 | 40 万 GBs    |
| 调用次数   | 100 万次     |

所谓外网出流量，即程序通过 SCF 访问外部网络的流量，对于本程序即请求微软 API 的流量，每次调用从几 B 到几 KB 不等；文件上传下载直接与微软交互，不经过 SCF。

下图是我一天的使用量，大概调用了 10000 次，如果是 30 天就是 30 万次，还不到免费额度的 1/3。资源使用量 1000 GBs，30 天就是 3 万 GBs，远低于 40 万 GBs。外网出流量 0.05G ，一个月大概是 1.5 G，按照 [正式收费标准](https://cloud.tencent.com/document/product/583/12281) 0.8 元/G，每月要支付 1.2 元的出流量费用，完全可以接受（目前不会收取）。

![@YL51PJT6NML6PZW{TAI.png](https://img13.360buyimg.com/img/jfs/t1/80717/30/8984/127477/5d6be0f4E2d3ddd41/affd65fa8e220bf2.png)

## 获取 Onedrive 账号

既然是利用 Onedrive，首先要获取一个账号，支持个人、企业和教育版。打个广告，我的 [杂货铺](https://logi.ml/store.html) 里有含 5T 空间的 Onedrive 教育账号，限时优惠 1 元/个，购买后可直接使用。

## 创建函数服务

有了账号后就可以创建函数了。登录 [腾讯云 SCF 控制台](https://console.cloud.tencent.com/scf/list)（在此之前要完成腾讯云 [实名认证](https://cloud.tencent.com/document/product/378/10495)），点击左侧菜单栏的 `函数服务`，接着点击顶栏的地区选择下拉框，选择 `香港或新加坡`，因为大陆区域在绑定域名时需要备案，如果你拥有已备案的域名，则可以选择国内，当然不绑定域名也可以使用。接着点击蓝色的 `新建` 按钮，创建函数。

![create_a_function](https://img12.360buyimg.com/img/jfs/t1/78335/19/8782/41051/5d6b779bEd3525463/c193a7a039e82f6e.png)

随后在新建函数页面填写 `函数名称`，名字随意；`运行环境` 选择 `Nodejs 8.9`；`创建方式` 选择 `模板函数`；选择 `helloworld` 模板，最后点击最下方的 `下一步`。进入 `② 函数配置` 页面后不做任何修改，直接点击 `完成`。（下面这张是之前的老图，按文字描述选择）

![GX`VWO~RYU4QSIHM`EE_{PG.png](https://img11.360buyimg.com/img/jfs/t1/67123/11/8810/58169/5d6b7c32E1b6db7b4/aac10c9eab43d942.png)

## 上传函数代码

下载并解压 [FODI](https://github.com/vcheckzen/FODI/archive/master.zip) 源码。随后，进入 SCF `函数代码` 面板，将 `提交方法下拉框` 的值改为 `本地上传文件夹`。点击 `上传`，选择 `解压文件夹内的 back-end`，待上传完毕后点击 `保存`。注意，上传的是 `back-end` 文件夹，不是整个项目。

![D5OFS6O`X7}$VW)B3$UTQA.png](https://img11.360buyimg.com/img/jfs/t1/62901/35/8995/35468/5d6b7f28Eeff3c58a/1d30dd4b9ce9d475.png)

## 添加触发方式

进入函数服务的 `触发方式` 面板，点击 `添加触发方式`。选择触发方式下拉框中的 `API网关触发器`，勾选下方的 `启用集成响应`，点击 `保存`。

![SC6P6_()$O$FK7_IB_S3(}4.png](https://img14.360buyimg.com/img/jfs/t1/83154/3/8875/52837/5d6b92e5E4b004249/7cbe89ce911aff9f.png)

稍等片刻，下方会出现一个 `访问路径`，先留个印象，待会要用到。

![2UV{Q5H@V13S956@IWG7`2.png](https://img10.360buyimg.com/img/jfs/t1/40554/26/13645/35452/5d6b9534E00ac9179/b2977f4e630803b3.png)

## 获取并填写 refresh_token

通过 [该网页](https://login.microsoftonline.com/common/oauth2/v2.0/authorize?scope=https%3A%2F%2Fgraph.microsoft.com%2FFiles.ReadWrite.All+offline_access&response_type=code&client_id=4da3e7f2-bf6d-467c-aaf0-578078f0bf7c&redirect_uri=https://scfonedrive.github.io&state=https%3A%2F%2Fservice-36wivxsc-1256127833.ap-hongkong.apigateway.myqcloud.com%2Frelease%2Fscf_onedrive_filelistor%2F) 登录微软账号，稍等片刻便会返回 `refresh_token`，复制它备用。

![C6QSEL5POOL75U](https://img14.360buyimg.com/img/jfs/t1/56678/37/9552/59863/5d6b977cE8dd2360f/220f0d790f980277.png)

进入 SCF `函数代码` 面板，选中 `index.js`，将得到的 `refresh_token` 粘贴进，下图所示的 `ONEDRIVE_REFRESH_TOKEN` 对应的单引号之间。

如需设置网盘展示的根目录，则填写第一行的 `EXPOSE_PATH` 变量，如 `/媒体/电影`，全盘展示请留空。填写完毕后点击靠近左下方的 `保存`。

![UUU{L_%MUDV1I}YSTPXZ2.png](https://img10.360buyimg.com/img/jfs/t1/70214/5/10718/105075/5d842c9bEae60a42a/9674329e857c873b.png)

## 通过 Github Pages 部署前端

前端仅是一个 HTML 文件，可放到任意静态服务器，此处通过 Github Pages 部署，部署完成后可通过 `username.github.io` 打开你的网盘。

注册并登录 [Github](https://github.com/join)，随后打开 [该仓库](https://github.com/vcheckzen/FODI-FRONT-END)，点击靠近右上角的 `Fork`。稍等片刻，打开页面中部的 `index.html`。

![YSG)}(}WF$V6(I8Z(RF7FK.png](https://img10.360buyimg.com/img/jfs/t1/63296/3/10845/44575/5d843ba8Ec2da5821/4a9ce41b6920475d.png)

点击靠近 `右上角` 的 `铅笔` 按钮，编辑该文件。

![fafdafdafQA.png](https://img12.360buyimg.com/img/jfs/t1/51803/8/11319/37410/5d843be4E33160f4e/743de165e87e8bab.png)

将你的 `函数 API 网关访问路径` 填写到 `index.html` 的 `SCF_GATEWAY` 变量对应的引号中。`SITE_NAME` 变量是 `站点名称`，可以随意修改。

![%{$U69~_}~DAL0($(U9@D`9.png](https://img13.360buyimg.com/img/jfs/t1/46806/25/11384/34880/5d843c23E7098294e/69db0a328c6c3e03.png)

![abc](https://img11.360buyimg.com/img/jfs/t1/50078/40/11457/18344/5d843c5bE88466c43/87175f85c8403942.png)

填写完毕后点击靠近页面最下方的 `Commit changes`。

![`56PL$O1D}(V2P@4WR%P6B.png](https://img13.360buyimg.com/img/jfs/t1/46300/14/9374/21791/5d6ba442E58d82ba6/72e92de2f4ad12f1.png)

点击靠近页面右上角的 `Settings`，将 `Repository name` 改成 `你的 Github 用户名.github.io`，随后点击 `Rename`。

![@(S16VV$)48~O8MHD6KYB5D.png](https://img10.360buyimg.com/img/jfs/t1/73112/17/10816/54933/5d843db5E3b381802/67833a2afe813604.png)

下拉该页面，找到 `Github Pages`，将 `Source` 下拉框的值改成 `master branch`，如果已经是则无需修改。

![}`R6~2N@)LINVXYJ5LEP59.png](https://img12.360buyimg.com/img/jfs/t1/43663/2/13575/33132/5d6ba655E9e64f8c4/b8a6c84311f74234.png)

现在，就可以通过 `你的 Github 用户名.github.io` 访问网盘了。
