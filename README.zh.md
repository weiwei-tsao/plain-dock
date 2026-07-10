# PlainDock

一款自托管的极简双模式笔记应用。每条笔记独立运行于**纯文本**或**富文本**模式，内置三层 HTML 净化管道，确保粘贴内容安全、格式统一。完整支持手机、平板和桌面三种屏幕尺寸。

[English](README.md)

## 功能特性

- **双模式编辑** — 每条笔记独立切换纯文本（`<textarea>`）或富文本（Tiptap）模式；从富文本切换至纯文本时需确认，格式会被清除
- **三层粘贴净化** — 安全过滤 → 标签归一化 → 结构降级（表格转文本，图片/视频转占位符）
- **自动保存** — 1 秒防抖延迟，请求串行队列防止并发写入冲突
- **置顶与搜索** — 重要笔记置顶；搜索同时匹配标题和正文内容
- **复制选项** — 支持复制为纯文本或富文本 HTML
- **移动端响应式** — 手机（< 768px）单面板堆叠导航，平板（768–1023px）窄侧栏布局，桌面（1024px+）完整双栏布局
- **侧栏可折叠** — 平板/桌面支持折叠展开；手机通过返回按钮导航，无折叠按钮
- **密码保护** — 单一共享密码，JWT 会话存储于 httpOnly Cookie（有效期 30 天）
- **Edge 中间件** — 在 Edge Runtime 中进行轻量级 JWT 过期检查；完整 HMAC-SHA256 验证在 API 路由中执行
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
              └── notes/      笔记增删改查 + 详情接口

客户端组件（src/components/）
  ├── Sidebar                 笔记列表、搜索、置顶标识
  └── editor/
        ├── EditorCanvas      双模式编辑器、自动保存、粘贴处理
        └── RichToolbar       Tiptap 格式化工具栏

服务端库（src/lib/）
  ├── db.ts                   Prisma 单例；按 DATABASE_URL 使用文件 SQLite 或 Turso/libSQL
  ├── auth.ts                 JWT 签发与验证（仅服务端）
  ├── serialize.ts            Prisma 类型转客户端类型（仅服务端）
  └── sanitizer/              三层 HTML 净化管道（客户端运行）

中间件（src/middleware.ts）
  └── Edge Runtime — 对每个请求进行 JWT 结构与过期检查
```

### 净化管道详解

粘贴内容依次经过三层处理：

| 层级 | 名称 | 处理内容 |
|------|------|---------|
| Layer 1 | 安全过滤 | 移除 `script`、`style`、`iframe`、`object`、`meta` 及其所有子节点 |
| Layer 2 | 标签归一化 | `div→p`、`b→strong`、`i→em`，统一为语义化标签 |
| Layer 3 | 结构降级 | 表格转制表符分隔的 `<p>`；图片/视频转 `[TAG: src]` 占位符 |
| 最终清理 | 白名单过滤 | 仅保留许可标签和 CSS 属性；链接强制加 `target="_blank"` 和 `rel="noopener noreferrer"` |

### 响应式布局

| 断点 | 前缀 | 宽度 | 布局行为 |
|------|------|------|---------|
| 手机 | 默认 | < 768px | 单面板：笔记列表或编辑器，同一时间只显示一个 |
| 平板 | `md:` | 768–1023px | 双栏：侧栏宽度 224px，可折叠 |
| 桌面 | `lg:` | 1024px+ | 双栏：侧栏宽度 320px，可折叠 |

## 技术栈

- **Next.js 16** — App Router、Turbopack、独立输出模式
- **React 19** + **TypeScript**（strict 模式）
- **Prisma** + **SQLite/libSQL** — 本地和 Docker 使用文件 SQLite，Vercel 使用 Turso
- **Tailwind CSS v4**（PostCSS 插件，无配置文件）
- **Tiptap** — 富文本编辑器（StarterKit + Underline 扩展）
- **Lucide React** — 图标库
- **jsonwebtoken** — JWT 签发与验证
