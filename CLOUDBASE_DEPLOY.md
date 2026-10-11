# CloudBase 云托管部署

本应用需要同一个 Node.js 服务处理网页、登录、群聊、地图代理和照片。选择 **云托管**，不要只创建静态网站托管。

## 从 GitHub 部署

1. 在 CloudBase 创建环境和云托管服务，选择「公开 Git 仓库 URL」，填写 `https://github.com/haoy69954-dotcom/travel-map-collab`，分支 `main`。
2. Dockerfile 名称填 `Dockerfile.cloudbase`，容器端口填 `4173`；环境变量设置 `AMAP_JS_KEY` 和 `AMAP_SECURITY_CODE`。不要把安全密钥写进 GitHub。
3. **在真实用户注册或创建行程前**，为服务启用持久化存储挂载。可使用私有读写的对象存储，实例挂载路径填 `/mnt/travel-data`。此目录存放 `auth.json`、`state.json` 和上传的照片。公开读的存储桶不适合存放账号文件。
4. 此版使用文件存储和进程内同步，服务实例数应保持为 **1**。若以后需要多实例，再迁移到数据库和独立的实时消息服务。
5. 在云托管服务的公网地址打开 `/healthz`，应返回 `{"ok":true}`；再测试注册、创建旅行、上传照片和重新部署后的数据保留。
6. 将正式访问域名添加到高德 Web 端 Key 的域名白名单。CloudBase 默认域名适合测试；正式分享时建议配置自定义域名。

本地 `data/` 目录中的账号和行程不会自动进入云端。迁移前应备份，并确认云端存储权限与数据目录已配置完成。
