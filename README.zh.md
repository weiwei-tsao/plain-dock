# PlainDock

一款自托管的极简 Markdown 笔记应用。所有笔记都在同一个 CodeMirror Markdown 编辑器中编辑，支持编辑/预览切换和标题大纲，内容以规范化的 Markdown 存储。粘贴内容始终以纯文本插入，剪贴板中的 HTML 会被有意忽略。完整支持手机、平板和桌面三种屏幕尺寸。

[English](README.md)

## 功能特性

- **Markdown 编辑与预览** — 基于 CodeMirror 6 的 Markdown 编辑器，带格式化工具栏和编辑/预览切换；预览渲染未保存的草稿（笔记中的原始 HTML 按文本显示），标题大纲可跳转到对应章节
- **文件夹** — 在「All Notes」之外用文件夹整理笔记；可直接新建、重命名、删除文件夹（删除文件夹后，其中的笔记回到 All Notes）
- **纯文本粘贴** — 粘贴内容始终以纯文本插入，剪贴板中的 HTML 会被有意忽略
- **自动保存** — 1 秒防抖延迟，请求串行队列防止并发写入冲突
- **置顶与搜索** — 重要笔记置顶；搜索同时匹配标题和正文内容
- **复制与下载** — 复制笔记的 Markdown 到剪贴板；下载为 `.md` 文件，标题作为开头的 `# H1`
- **多标签页与链接** — 每个标签页的文件夹/笔记记录在 URL 中，刷新后恢复；右键（或 Cmd/Ctrl/中键点击）笔记或文件夹可在新标签页打开；切回窗口时列表自动刷新
- **响应式三栏布局** — 桌面（1024px+）为 文件夹 | 笔记列表 | 编辑器 三栏，各栏宽度可拖动调整并记住，文件夹栏可折叠；平板（768–1023px）为 笔记列表 + 编辑器 两栏，文件夹以浮层打开；手机（< 768px）为 笔记列表 → 文件夹 → 编辑器 的堆叠导航
- **密码保护** — 单一共享密码，JWT 会话存储于 httpOnly Cookie（有效期 30 天）
- **Edge 中间件** — 在 Edge Runtime 中用 Web Crypto API 对每个请求验证会话 JWT 的 HMAC-SHA256 签名与过期时间
- **SQLite 兼容存储** — 本地和 Docker 使用文件 SQLite；Vercel 可使用 Turso/libSQL
- **Docker 就绪** — 多阶段 Dockerfile，Next.js 独立输出；容器启动时自动执行数据库迁移

## 快速开始

**前置条件：** Node.js 20+

1. 安装依赖：
   ```bash
   npm install
   ```

2. 在项目根目录创建 `.env` 文件，填入以下配置：
   ```
   DATABASE_URL="file:./dev.db"
   APP_PASSWORD="你的密码"
   JWT_SECRET="你的签名密钥"
   ```
   这是本地文件 SQLite 路径。只有当 `DATABASE_URL` 指向 Turso/libSQL 时才需要 `TURSO_AUTH_TOKEN`。

   > Prisma CLI 默认读取 `.env`。如果使用 `.env.local`，需在 Prisma 命令后追加 `--env-file .env.local`。两个文件均已加入 `.gitignore`。

3. 初始化数据库：
   ```bash
   npx prisma migrate dev
   ```

4. 启动开发服务器：
   ```bash
   npm run dev
   ```
   访问 `http://localhost:3000`。

## Docker 部署

1. 在项目根目录创建 `.env` 文件：
   ```
   APP_PASSWORD="你的密码"
   JWT_SECRET="你的签名密钥"
   ```
   > Docker 不需要手动设置 `DATABASE_URL`，`docker-compose.yml` 已固定为 `file:/app/data/notes.db`。

2. 构建并启动容器：
   ```bash
   docker compose up -d
   ```

3. 访问 `http://localhost:3000`。

**常用命令：**

| 命令 | 说明 |
|------|------|
| `docker compose down` | 停止容器 |
| `docker compose up -d --build` | 代码变更后重新构建并启动 |
| `docker compose logs -f` | 实时查看容器日志 |

数据通过卷挂载持久化到宿主机 `./data/notes.db`，重启和重建均不丢失数据。每次容器启动时自动执行数据库迁移。

Docker Compose 会根据 project 和 service 自动生成容器名。如果旧版本创建的 PlainDock 容器仍然占用了固定名称 `plaindock`，`docker compose up -d` 可能报错：`container name "/plaindock" is already in use`。先检查并删除这个旧容器，再启动：

```bash
docker ps -a --filter "name=^/plaindock$"
docker rm -f plaindock
docker compose up -d
```

删除旧容器不会删除 `./data/notes.db`。

### 手动从 Turso 同步到 Docker

如果要用线上 Turso 数据替换本地 Docker SQLite 数据，在 `.env` 中增加 Turso 同步配置：

```env
TURSO_DATABASE_URL="libsql://your-db.turso.io"
TURSO_AUTH_TOKEN="your-token"
```

然后停止容器并手动执行同步命令：

```bash
docker compose down
npm run docker:sync-from-turso
docker compose up -d
```

该命令会读取 `.env`，准备 `./data/notes.db`，把已有数据库及存在的 SQLite WAL 边车文件备份到 `./data/backups/`，然后用 Turso 快照替换本地 Docker 的 `Folder` 和 `Note` 数据。

如果宿主机只使用 Docker、没有本地 Node 依赖，可以重新构建镜像后在一次性容器中执行同一个脚本：

```bash
docker compose build
docker compose down
docker compose run --rm plaindock node scripts/sync-turso-to-docker.mjs
docker compose up -d
```

## Vercel + Turso 部署

Vercel 的 Serverless 函数不能把本地 SQLite 文件当作持久存储。部署到 Vercel 时使用 Turso/libSQL，本地和 Docker 仍然继续使用文件 SQLite。

1. 创建 Turso 数据库，复制它的 `libsql://` URL，并创建 auth token。

2. 在 Vercel 设置环境变量：
   ```env
   DATABASE_URL="libsql://your-db.turso.io"
   TURSO_AUTH_TOKEN="your-token"
   APP_PASSWORD="你的访问密码"
   JWT_SECRET="你的 JWT 密钥"
   ```

3. 使用 Turso CLI 或 Turso 控制台 SQL Console，把 Prisma 迁移 SQL 文件手动应用到 Turso。新数据库按时间顺序执行：
   ```bash
   turso db shell your-database < prisma/migrations/20260214025810_init/migration.sql
   turso db shell your-database < prisma/migrations/20260628035117_empty_title_default/migration.sql
   turso db shell your-database < prisma/migrations/20260719031554_add_note_folders/migration.sql
   ```

   以后每次新增 `prisma/migrations/*/migration.sql` 后，都要先用同样方式应用到 Turso，再部署依赖这些迁移的代码。

4. 部署到 Vercel。

如果要迁移已有的本地 SQLite 数据，请先备份数据库文件，再用 Turso CLI 工具导入数据，确认远程 `Note` 记录无误后，再应用导入数据中尚未包含的迁移 SQL 文件。不要依赖 Vercel 的本地文件系统保存笔记。

## 开发命令

| 命令 | 说明 |
|------|------|
| `npm run dev` | 以 Turbopack 启动开发服务器（端口 3000） |
| `npm run build` | 生产环境构建 |
| `npm run start` | 启动生产服务器（端口 3000） |
| `npm run lint` | ESLint 检查 |
| `npm run lint:fix` | ESLint 自动修复 |
| `npm run format` | Prettier 格式化 |
| `npm run format:check` | Prettier 格式检查（不写入） |
| `npm run docker:sync-from-turso` | 手动用已备份的 Turso 快照替换 Docker SQLite 数据 |
| `npm test` | 运行 Vitest 测试套件 |
| `npm run test:watch` | 以监听模式运行 Vitest |
| `npm run test:e2e` | 运行 Playwright E2E 测试（准备步骤见 `e2e/README.md`） |
| `npm run typecheck` | TypeScript 类型检查 |
| `npx prisma migrate dev` | 创建并应用数据库迁移 |
| `npx prisma studio` | 打开数据库可视化界面 |

## 架构概览

```
浏览器
  └── Next.js App Router（src/app/）
        ├── /login            登录页
        ├── /                 主编辑页
        └── /api/
              ├── auth/       登录 · 登出
              ├── notes/      笔记增删改查 + 详情接口
              └── folders/    文件夹列表（含笔记数）· 新建 · 重命名 · 删除

客户端组件（src/components/）
  ├── sidebar/
  │     ├── FolderSidebar     All Notes + 文件夹，行内新建/重命名/删除
  │     ├── NotesList         笔记列表、搜索、置顶标识、下拉刷新
  │     └── ResizeHandle      栏间可拖动分隔条
  └── editor/
        ├── EditorCanvas      编辑器外壳：编辑/预览切换、自动保存、粘贴处理、笔记操作
        ├── MarkdownEditor    CodeMirror 6 封装
        ├── MarkdownPreview   预览面板（唯一的 HTML 渲染边界）+ MarkdownOutline
        └── RichToolbar       Markdown 格式化工具栏

服务端库（src/lib/）
  ├── db.ts                   Prisma 单例；按 DATABASE_URL 使用文件 SQLite 或 Turso/libSQL
  ├── auth.ts                 JWT 签发与验证（仅服务端）
  ├── serialize.ts            Prisma 类型转客户端类型（仅服务端）
  └── markdown/               共用的 Markdown 处理函数（粘贴检测、纯文本投影、格式化、搜索、预览 HTML）

中间件（src/middleware.ts）
  └── Edge Runtime — 对每个请求验证 JWT 的 HMAC-SHA256 签名与过期时间
```

### 响应式布局

| 断点 | 前缀 | 宽度 | 布局行为 |
|------|------|------|---------|
| 手机 | 默认 | < 768px | 堆叠导航：笔记列表 → 文件夹（全屏）→ 编辑器，同一时间只显示一个 |
| 平板 | `md:` | 768–1023px | 两栏：笔记列表 + 编辑器；文件夹栏自动收起，以浮层打开 |
| 桌面 | `lg:` | 1024px+ | 三栏：文件夹 + 笔记列表 + 编辑器，各栏可拖动调整宽度，文件夹栏可折叠 |

## 技术栈

- **Next.js 16** — App Router、Turbopack、独立输出模式
- **React 19** + **TypeScript**（strict 模式）
- **Prisma** + **SQLite/libSQL** — 本地和 Docker 使用文件 SQLite，Vercel 使用 Turso
- **Tailwind CSS v4**（PostCSS 插件，无配置文件）
- **CodeMirror 6** — Markdown 编辑器，带语法高亮
- **Lucide React** — 图标库
- **jsonwebtoken** — JWT 签发与验证
