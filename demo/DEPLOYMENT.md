# TimeLens 演示页：本地发布与线上部署方案

> **适用范围**：`demo/` 目录下的纯静态 HTML（如 `timelens-product-showcase.html`），无构建步骤。  
> **目标**：统一「本机预览 → 公网访问」的流程与约定，便于后续沉淀为 Agent Skill 或团队规范。

---

## 1. 方案总览

| 场景 | 方式 | 典型用途 |
|------|------|----------|
| 本机浏览器预览 | 本地 HTTP 静态服务 | 开发调样式、录屏演示 |
| Cursor 内置 Simple Browser | 仅支持 `http(s)://`，**不支持** `file://` | 在 IDE 内联预览 |
| 公网访问 | Vercel 静态托管（CLI 或 Git 联动） | 对外分享、验收、宣传 |

**核心约定**：静态根路径 `/` 必须能解析到实际页面（见 [§4](#4-根路径--与-verceljson)），否则线上易出现 **404**。

---

## 2. 本地预览（推荐）

### 2.1 为什么不用 `file://` 直接打开

- **Cursor 内置浏览器**出于安全策略，**禁止**导航到 `file://` 本地文件。
- 部分页面行为（字体、相对路径、未来若加模块）在 `file://` 下与线上不一致。

因此本地也请用 **HTTP** 访问。

### 2.2 一键启动静态服务

在 **`demo/` 目录**执行（端口可自定，避免与占用 8765 等常见端口冲突）：

```bash
cd /path/to/timelines/demo
python3 -m http.server 18765
```

浏览器访问：

```text
http://127.0.0.1:18765/timelens-product-showcase.html
```

若已配置根路径重写（见 §4），也可访问：

```text
http://127.0.0.1:18765/
```

停止服务：在运行该命令的终端里 `Ctrl+C`。

### 2.3 可选替代

- Node：`npx serve -p 18765 .`（需在 `demo/` 下执行）
- 仅系统浏览器：`open` / 双击 HTML 可用，但与 Cursor 内置浏览器策略无关

---

## 3. Cursor 内置浏览器

1. 先按 **§2** 在本机起好 HTTP 服务。
2. 在 Simple Browser 地址栏输入：

   `http://127.0.0.1:18765/timelens-product-showcase.html`  
   或（已配置 index/重写后）`http://127.0.0.1:18765/`

3. 若 Agent 使用 MCP `browser_navigate`，同样只传 **http(s) URL**，不能传 `file:///...`。

---

## 4. 根路径 `/` 与 `vercel.json`

Vercel 对**纯静态目录**默认在访问 **`/`** 时查找 **`index.html`**。

若目录里**只有** `timelens-product-showcase.html`、**没有** `index.html`，则：

- `https://<项目>.vercel.app/timelens-product-showcase.html` → **正常**
- `https://<项目>.vercel.app/` → **404 NOT_FOUND**

### 推荐做法（二选一，当前仓库采用 A）

**A. 使用 `vercel.json` 重写（单文件维护、不复制大段 HTML）**

在 **`demo/vercel.json`** 中配置将 `/` 指到实际页面，例如：

```json
{
  "rewrites": [
    {
      "source": "/",
      "destination": "/timelens-product-showcase.html"
    }
  ]
}
```

**B. 提供 `index.html`**

- 将主页面复制或改名为 `index.html`，或  
- 用极简 `index.html` 做跳转（需自行避免与主文件双份维护）。

---

## 5. Vercel 线上部署（CLI）

### 5.1 前置条件

- [Vercel](https://vercel.com) 账号（建议 GitHub 登录）
- 本机已安装 Node.js，并可用 `npm i -g vercel` 或每次使用 `npx vercel`

### 5.2 首次在项目目录关联部署

在 **`demo/`** 下执行：

```bash
cd /path/to/timelines/demo
vercel login
vercel
```

按提示选择 Team、是否关联已有项目、项目名称等。  
**代码所在目录**选 **`./`**（即当前 `demo/` 为站点根）。

检测到无框架时，输出目录一般为 **`.`** 或存在时的 **`public`**——以 CLI 提示为准。

### 5.3 生产环境

```bash
vercel --prod
```

成功后控制台会给出 **Production URL** 与 **别名域名**（如 `xxx.vercel.app`）。

### 5.4 修改 `vercel.json` 或 HTML 之后

每次变更需重新部署预览或生产：

```bash
vercel          # Preview
vercel --prod   # Production
```

---

## 6. 与 GitHub 集成时的注意点

若仓库根目录是 **`timelines/`**，而静态资源在 **`demo/`**：

1. 打开 Vercel 项目 **Settings → General → Root Directory**  
2. 设为 **`demo`**（与 CLI 在 `demo` 下部署一致）

否则构建会以仓库根为根目录，`demo` 内页面不会作为站点根发布，表现为 **整站 404 或空站**。

同时确保 **`vercel.json` 位于 Root Directory 内**（即放在 `demo/vercel.json`）。

---

## 7. 故障排查清单

| 现象 | 可能原因 | 处理 |
|------|----------|------|
| 根路径 `/` 404，带路径的 `.html` 能打开 | 缺少 `index.html` 且未配置重写 | 使用 §4 的 `vercel.json` 或增加 `index.html` |
| 整站 404 | Git 部署时 Root Directory 不是 `demo` | 在 Vercel 设置中把 Root Directory 改为 `demo` |
| Cursor 里打不开本地页 | 使用了 `file://` | 改用 `http://127.0.0.1:<端口>/...` |
| 端口拒绝连接 | 本机静态服务未启动或端口错误 | 检查 `python3 -m http.server` 是否在 `demo` 下运行 |

**自检命令（部署后）**：

```bash
curl -sI "https://<你的域名>/"
curl -sI "https://<你的域名>/timelens-product-showcase.html"
```

---

## 8. 沉淀为 Skill 时的建议结构

若将本文档提炼为 Cursor / Codex **Skill**，可固定以下块：

1. **触发词**：本地预览、Vercel 部署、静态页 404、Simple Browser  
2. **硬性规则**：不用 `file://` 进内置浏览器；静态根路径必须可解析  
3. **命令模板**：`python3 -m http.server <端口>`、`vercel` / `vercel --prod`  
4. **配置文件**：`demo/vercel.json` 中 `rewrites` 示例  
5. **Git 联动**：Root Directory = `demo`

将 Skill 的 `references` 指向本文件路径即可与仓库同步迭代。

---

## 9. 命令速查

```bash
# 本地（在 demo/）
python3 -m http.server 18765

# 首次 / 预览部署（在 demo/）
vercel

# 生产部署（在 demo/）
vercel --prod
```

---

**文档版本**：与 `demo/vercel.json` 及主 HTML 文件名保持同步；若重命名主 HTML，请同步修改 `vercel.json` 中的 `destination`。
