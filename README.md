# AlgoPilot

聚合 Codeforces、AtCoder、洛谷题库与练习记录，并追踪近期赛事的本地算法训练平台。

仓库：<https://github.com/ArctiCat14/algo-pilot>

当前已完成十一个阶段：

1. **题库同步**：三个平台的题目、难度、标签、通过率统一到本地 SQLite。
2. **账号同步**：绑定公开账号，同步 rating、提交记录、过题状态、活跃度和评测分布。
3. **薄弱点分析**：按标签计算通过率、AC 成本、练习新鲜度，生成训练优先级和难度舒适区。
4. **近期比赛**：Codeforces、AtCoder、牛客三平台赛程时间线，支持倒计时、日历导出和今日比赛文案复制。
5. **提交记录**：统一提交流水，支持平台、结果、题目搜索和分页。
6. **过题状态**：题库中标记未做 / 尝试未过 / 已通过，并支持状态筛选。
7. **训练计划**：按薄弱点、舒适区、目标 rating 生成每日计划，支持完成、跳过、笔记和间隔复习。
8. **总览与设置**：训练台首页、目标 rating / 每日题量 / 平台偏好 / 重点色设置。
9. **洛谷题单**：发现和导入洛谷公开题单，保留顺序、同步过题状态、加入今日训练。
10. **比赛记录**：CF / AtCoder rated 比赛历史、排名、rating 变化和走势图。
11. **补题队列**：贴题目链接进队列，自动识别平台、补全题目，支持标签、优先级、状态和备注。

![总览](docs/dashboard.png)

![题库界面](docs/problem-bank.png)

![账号同步界面](docs/accounts.png)

![薄弱点分析](docs/weakness.png)

![近期比赛](docs/contests.png)

![比赛记录](docs/contest-records.png)

![补题队列](docs/upsolve.png)

![提交记录](docs/submissions.png)

![训练计划](docs/training.png)

![洛谷题单](docs/lists.png)

![设置](docs/settings.png)

## 当前数据

最近一次全量同步结果：

| 平台 | 题目数 | 数据来源 | 难度 | 标签 |
|---|---:|---|---|---|
| Codeforces | 11,488 | 官方 `problemset.problems` API | rating | 官方标签 |
| AtCoder | 9,875 | Kenkoooo Problems + 难度模型 | 难度估值 | 暂缺 |
| 洛谷 | 17,875 | 洛谷公开题库列表 | 洛谷难度 → rating 映射 | 洛谷标签 |
| **合计** | **39,238** | | | |

数据库位置：`data/algo-training.db`（SQLite，WAL 模式）。

## 快速开始

```bash
# 0. 克隆仓库
git clone https://github.com/ArctiCat14/algo-pilot.git
cd algo-pilot

# 1. 安装依赖
npm install

# 2. 同步全部题库（首次约 3 分钟，主要耗时在洛谷）
npm run sync

# 3. 构建前端并启动
npm run build
npm start
```

打开 <http://127.0.0.1:4317>。

- 总览：<http://127.0.0.1:4317/#dashboard>
- 题库页：<http://127.0.0.1:4317/#problems>
- 账号同步页：<http://127.0.0.1:4317/#accounts>
- 薄弱点页：<http://127.0.0.1:4317/#weakness>
- 近期比赛页：<http://127.0.0.1:4317/#contests>
- 比赛记录页：<http://127.0.0.1:4317/#contest-records>
- 补题队列页：<http://127.0.0.1:4317/#upsolve>
- 提交记录页：<http://127.0.0.1:4317/#submissions>
- 训练计划页：<http://127.0.0.1:4317/#training>
- 洛谷题单页：<http://127.0.0.1:4317/#lists>
- 设置页：<http://127.0.0.1:4317/#settings>

> 本项目默认绑定 `127.0.0.1`，不会暴露到局域网。数据全部保存在本地。

## 仓库说明

- 数据库 `data/algo-training.db`、同步出来的个人数据、`data/` 下的调试截图不会提交
- 首次 clone 后需要执行 `npm run sync` 建库并拉取题库
- 账号同步只读取公开数据，不保存平台密码或登录 Cookie
- `docs/` 里使用脱敏后的演示数据截图，账号 handle / UID 已替换为 demo

### 开发模式

```bash
npm run dev
```

- 前端：<http://127.0.0.1:5173>
- API：<http://127.0.0.1:4317>
- Vite 已配置 `/api` 代理。

如果当前环境的沙箱不允许 Vite/esbuild 启动子进程，使用生产构建方式：

```bash
npm run build
npm start
```

## 同步命令

```bash
# 全部平台
npm run sync

# 只同步某个平台
npm run sync -- --platform codeforces
npm run sync -- --platform atcoder
npm run sync -- --platform luogu

# 多个平台
npm run sync -- --platform codeforces,atcoder

# 调试洛谷：只抓前 10 页，并指定并发数
npm run sync -- --platform luogu --pages 10 --concurrency 3
```

同步是**幂等覆盖**：以 `(platform, problem_key)` 为主键 upsert，同步成功后再清理该平台已不存在的旧题。中途失败不会清空旧数据。

## 账号同步

进入 **账号同步** 页面，在对应平台卡片里填写：

| 平台 | 填写内容 | 例子 |
|---|---|---|
| Codeforces | handle，也支持粘贴 profile 链接 | `tourist` |
| AtCoder | handle，也支持粘贴用户主页链接 | `tourist` |
| 洛谷 | 数字 UID，不是用户名 | `377873` |

点击“连接”后会立即拉取并入库。之后可以单独同步某个平台，或使用“同步全部账号”。

同步范围：

- **Codeforces**：rating / max rating / 段位、全部提交、题目标签、verdict、语言、时间。
- **AtCoder**：rating 历史、全部提交、verdict、语言、时间；题目信息通过本地题库补齐。
- **洛谷**：用户资料、公开过题列表、难度；**不包含逐题提交时间和 verdict**，因为洛谷公开接口只提供过题集合。

账号数据只读取公开信息，不要求密码、不保存 Cookie，也不会代替你提交代码。

### 账号能力

- 三平台累计过题、记录总数、活跃天数、连续训练天数
- 最近 20 周提交热力图
- AC / WA / TLE / RE / CE 等评测分布
- 最近提交记录，支持跳转原题
- 单独同步 / 全部同步 / 更换账号 / 解除绑定

## 薄弱点分析

进入 **薄弱点** 页面，系统会基于本地提交记录计算：

- **训练优先级**：0–100，综合题目通过率、平均 AC 成本、最近练习时间和难度水平
- **标签通过率**：该标签下去重题目的 AC 比例
- **AC 成本**：平均多少次提交才能过一道题
- **平均难度**：该标签已过题目的平均 rating
- **最近练习**：距离最后一次提交该标签过去了多久
- **能力雷达**：最常练习的 6 个标签的掌握度
- **难度舒适区**：按 rating 分段统计提交量、通过率和舒适上限
- **训练建议**：优先补强的 3 个标签，以及还没碰过的高频标签

点击“去练这个标签”会跳回题库并自动应用该标签筛选。

### 数据口径

- 标签主要来自 Codeforces 官方标签和洛谷标签。
- AtCoder 没有官方算法标签，因此不会被计入标签分析。
- 洛谷只提供公开过题集合，没有失败提交；相关标签会标记为低置信。
- 提交通过率 = AC 提交数 / 总提交数。
- 洛谷过题没有提交时间，不参与“最近练习”和活跃度计算。

## 近期比赛

进入 **近期比赛** 页面，展示：

- **Codeforces**：未来 60 天与近 30 天赛事
- **AtCoder**：官方 Upcoming / Recent 赛程
- **牛客**：练习赛、周赛、小白月赛等公开赛事
- 下一场比赛卡片与实时倒计时
- 按日期分组的赛事时间线
- 进行中赛事高亮
- 近 30 天赛后列表，可直接打开比赛页补题
- 一键导出 `.ics` 日历
- **今日比赛文案**：自动按“今日比赛 / 平台 / 名称 / 链接 / 时间 / 时长”格式生成，可编辑后一键复制；多场比赛自动用空行分隔

文案框可以直接修改，像 QOJ 这类不在自动赛程里的比赛可以手动补进去。

赛事数据缓存 10 分钟，页面可手动刷新。**不包含洛谷比赛。**

## 提交记录

进入 **提交记录** 页面，可以：

- 按平台筛选：全部 / Codeforces / AtCoder / 洛谷
- 按 verdict 筛选：AC / WA / TLE / MLE / RE / CE / PARTIAL 等
- 搜索题目名或题号
- 查看提交时间、题目、结果、语言、rating
- 点击行直接打开原题
- 每页 25 / 50 / 100 条，支持翻页
- 顶部显示总提交、AC 题目、提交通过率、活跃天数

洛谷的过题记录没有提交时间，时间列会显示“题目导入”。

## 训练计划

训练计划是本项目当前的核心闭环：

- 根据薄弱点、优势标签和目标 rating 生成每日 1–6 题
- 默认结构：1 道弱项补强 + 1 道舒适区 + 1 道拉伸
- 生成时排除已通过、尝试过、近 7 天已安排的题目
- 任务状态：待做 / 已完成 / 已跳过
- 每道题可以写思路、复杂度和卡点
- 完成后进入间隔复习：1 / 3 / 7 / 14 / 30 / 60 天
- 复习到期后出现在训练计划侧栏，点击“已复习”推进阶段
- 总览页直接显示今日任务和完成进度

设置页可以调整：

- 目标 rating（800–3500）
- 每日题量（1–6）
- 优先训练平台（CF / AtCoder / 洛谷，至少一个）
- 重点色：6 个预设 + 自定义颜色，保存后全局生效

## 洛谷题单

**洛谷题单**页面支持：

- 输入题单 ID 或 `luogu.com.cn/training/{id}` 链接导入
- **按题号新建**：输入多个洛谷题号或题目链接，创建自定义题单
- 在已有题单中继续追加题号
- 发现页内置洛谷官方题单目录，可一键导入
- 保留洛谷题单的题目顺序
- 自动标记：未做 / 尝试未过 / 已通过
- 显示题单完成进度
- 单题加入今日训练，或按每日题量批量加入
- 本地删除题单，不影响洛谷原题单

只支持公开题单；未公开题单需要登录态，当前不会要求输入洛谷 Cookie。

## 比赛记录

**比赛记录**页汇总 Codeforces 和 AtCoder 的公开 rated 比赛：

- 参赛场次、最佳排名、最高 rating、最近比赛
- **段位区间**：完整展示 Codeforces / AtCoder 每个段位的 rating 范围，并高亮当前档位
- CF / AtCoder 分别的 rating 走势图，背景按段位区间着色，图例显示对应区间
- 每场比赛的日期、排名、rating 变化、performance、赛后 rating
- 点击比赛名直接打开比赛页
- 账号同步时自动更新比赛记录

数据来源是 Codeforces `user.rating` 和 AtCoder rating history，不包含洛谷和牛客的个人比赛记录。

## 补题队列

**补题队列**用于收集比赛没做出来、或平时看到想补的题：

- 粘贴任意题目链接
- 自动识别 Codeforces / AtCoder / 洛谷 / 牛客 / CodeChef / AcWing / VJudge
- 其他平台链接也可以加入，自动从域名和路径生成标题
- CF / AtCoder / 洛谷会从本地题库补全题目名、难度、标签
- 可手动添加标签、难度、备注和优先级
- 状态：待补 / 进行中 / 已补完
- 按平台、标签、关键词筛选
- **比赛补题队列**：从比赛记录里选一场，或输入比赛 ID，批量导入这场比赛在本地题库中的题目
- **只加未通过**：自动跳过已经 AC 的题
- 按比赛分组、查看每场补题进度，并单独筛选一场比赛
- 记录补完时间，并统计近 7 天补题数

题目链接会自动规范化，重复题目不会重复入队。

## 页面能力

- 总题数、各平台题数、最近同步状态
- 平台切换、题目搜索、难度区间、标签筛选
- 难度升序/降序、通过率、最近同步、标题排序
- 分页与每页条数
- 一键跳转原题
- 同步进度实时轮询、平台级失败提示
- 难度分布柱状图、高频标签

## API

| 方法 | 路径 | 说明 |
|---|---|---|
| `GET` | `/api/health` | 健康检查 |
| `GET` | `/api/meta` | 题库统计、平台计数、标签、难度桶、最近同步 |
| `GET` | `/api/problems` | 题库查询 |
| `GET` | `/api/accounts` | 已绑定账号、总览统计、活跃度、最近提交 |
| `PUT` | `/api/accounts/:platform` | 绑定并同步账号，body：`{ "handle": "tourist" }` |
| `POST` | `/api/accounts/:platform/sync` | 重新同步单个平台 |
| `POST` | `/api/accounts/sync` | 同步全部已绑定账号 |
| `DELETE` | `/api/accounts/:platform` | 解除绑定并删除该平台本地提交 |
| `GET` | `/api/submissions` | 提交记录查询，支持 `platform` / `verdict` / `q` / 分页 |
| `GET` | `/api/weakness` | 薄弱点报告：标签统计、雷达、难度分布、训练建议 |
| `GET` | `/api/contests` | 近期比赛：CF / AtCoder / 牛客，支持 `?refresh=1` |
| `GET` | `/api/contest-records` | 我的 rated 比赛记录与汇总，支持 `?platform=` |
| `GET` | `/api/upsolve` | 补题队列、统计与标签 |
| `POST` | `/api/upsolve` | 添加补题，body：`{ "url": "...", "tags": "DP, 二分" }` |
| `PATCH` | `/api/upsolve/:id` | 更新状态、标签、备注、优先级 |
| `DELETE` | `/api/upsolve/:id` | 从补题队列删除 |
| `GET` | `/api/upsolve/contest?platform=&contestId=` | 查看一场比赛在本地题库中的题目 |
| `POST` | `/api/upsolve/contest` | 按比赛批量导入补题 |
| `GET` | `/api/tasks` | 今日任务、到期复习、历史记录、训练设置 |
| `POST` | `/api/tasks/generate` | 生成今日计划，body：`{ "force": false }` |
| `PATCH` | `/api/tasks/:id` | 更新任务状态或笔记 |
| `POST` | `/api/tasks/:id/review` | 完成一次间隔复习 |
| `GET` | `/api/settings` | 读取训练偏好 |
| `PUT` | `/api/settings` | 保存训练偏好 |
| `GET` | `/api/lists` | 已导入的题单 |
| `GET` | `/api/lists/discover` | 洛谷官方题单目录 |
| `POST` | `/api/lists/import` | 导入题单，body：`{ "input": "100" }` |
| `POST` | `/api/lists/custom` | 按题号新建题单，body：`{ "input": "P1001, B2002", "name": "可选" }` |
| `POST` | `/api/lists/:id/items` | 向已有题单追加题号 |
| `GET` | `/api/lists/:id` | 题单详情与题目状态 |
| `DELETE` | `/api/lists/:id` | 删除本地题单 |
| `POST` | `/api/lists/:id/plan` | 把题单题目加入今日训练 |
| `GET` | `/api/sync/status` | 当前题库同步进度 |
| `POST` | `/api/sync` | 启动题库同步，body：`{ "platforms": ["codeforces"] }` |
| `GET` | `/api/runs` | 最近题库同步记录 |

`/api/problems` 查询参数：

```text
platform=codeforces|atcoder|luogu
q=关键字
min=1000&max=1599
tags=dp,greedy
sort=default|difficulty_asc|difficulty_desc|acceptance|title|newest
page=1&pageSize=20
```

## 目录结构

```text
algo-training/
├─ apps/
│  ├─ server/
│  │  └─ src/
│  │     ├─ db.ts                 # 题库 schema / 查询
│  │     ├─ accounts/
│  │     │  ├─ db.ts              # 账号、提交、统计 schema / 查询
│  │     │  └─ types.ts
│  │     ├─ analysis/
│  │     │  └─ weakness.ts        # 标签画像、优先级、雷达、难度分布
│  │     ├─ training/
│  │     │  ├─ db.ts              # 任务、复习、设置、选题查询
│  │     │  └─ plan.ts            # 每日计划生成
│  │     ├─ lists/
│  │     │  ├─ db.ts              # 题单与题目本地存储
│  │     │  ├─ service.ts         # 洛谷题单导入 / 加入训练
│  │     │  └─ types.ts
│  │     ├─ contests/
│  │     │  ├─ codeforces.ts      # CF 赛程
│  │     │  ├─ atcoder.ts         # AtCoder 官方赛程
│  │     │  ├─ nowcoder.ts        # 牛客赛程
│  │     │  ├─ db.ts              # 比赛缓存
│  │     │  └─ sync.ts
│  │     ├─ sync/
│  │     │  ├─ codeforces.ts      # 题库：CF 适配器
│  │     │  ├─ atcoder.ts         # 题库：AtCoder 适配器
│  │     │  ├─ luogu.ts           # 题库 + 洛谷账号适配器
│  │     │  ├─ account-codeforces.ts
│  │     │  ├─ account-atcoder.ts
│  │     │  ├─ account.ts         # 账号同步编排
│  │     │  └─ index.ts           # 题库同步编排
│  │     ├─ cli/sync-problems.ts  # 命令行题库同步
│  │     └─ index.ts              # Fastify API + 静态托管
│  └─ web/
│     └─ src/                     # React 题库界面
├─ data/                          # SQLite 数据库
└─ docs/                          # 脱敏演示截图
```

## 数据模型

`problems` 表的核心字段：

```text
platform            平台
problem_key         统一题目标识，例如 cf:1234A / at:abc300_c / lg:P1001
external_id         平台内 ID
title               题名
url                 原题链接
difficulty          统一 0–3000+ 数值难度
platform_difficulty 平台原始难度（CF rating / 洛谷 1–7 / AtCoder 估值）
difficulty_label    中文难度档位
tags_json           展示用标签 JSON
total_submit        提交数（洛谷提供）
total_accepted      通过数（洛谷提供）
synced_at           同步时间
last_sync_token     用于清理过期题
```

`problem_tags` 单独建表，用于标签筛选，避免每次查询解析 JSON。

账号部分：

```text
accounts              每平台一行：handle、显示名、头像、rating、段位、
                      过题数、记录数、最后同步时间、状态
submissions           统一提交：(platform, external_id) 唯一
                      problem_key / verdict / language / submitted_at /
                      rating / tags / source
account_sync_runs     每次账号同步的结果和耗时
contests              比赛缓存：平台、比赛 ID、名称、开始/结束、时长、链接、
                      备注、最后同步时间
training_tasks        每日任务、状态、笔记、复习阶段 / 到期时间
app_settings          目标 rating、每日题量、优先平台、重点色
problem_lists         导入的洛谷题单元数据
problem_list_items    题单内题目、顺序、难度、标签
contest_records       CF / AtCoder 的比赛、排名、rating 变化
upsolve_items         补题队列、标签、优先级、状态
```

> 比赛平台是独立枚举：`codeforces | atcoder | nowcoder`，不与题库 / 账号的三平台混用。
> `training_tasks` 用 `(problem_key, scheduled_for)` 唯一键防止同一天重复安排同一道题。

洛谷的过题记录使用 `luogu-solved:<pid>` 作为 `external_id`，`submitted_at` 为空，因此不会计入活跃天数和连击。

## 同步实现要点

- **Codeforces**：直接调用官方 API，请求失败自动退避重试。
- **AtCoder**：合并 `problems.json`、`problem-models.json`、`contests.json`。每日训练复用题会优先还原到原始比赛 ID，避免题号和标题错位。
- **洛谷**：
  - 公开题库列表需要先经过 `C3VK` Cookie challenge；
  - 358 页，3 并发抓取，带随机延迟、429 退避和 Cookie 刷新；
  - 标签通过 `/_lfe/tags` 映射；
  - 不使用登录态，只访问公开数据。
- 所有平台最终写入同一套 `ProblemRecord`，账号提交再通过 `problem_key` 回填题目信息。

账号同步：

- **Codeforces**：`user.info` + `user.status`，超过 10000 条时继续翻页；`OK` 统一归一化为 `AC`。
- **AtCoder**：官方 rating history + Kenkoooo submissions，分页拉全量；提交的题目信息通过本地题库补齐。
- **洛谷**：主页 CSRF Token + `/user/{uid}/practice` 获取公开过题列表；用户关闭公开记录时会给出明确错误。
- 账号提交以 `(platform, external_id)` upsert，同步成功后删除该平台已不存在的旧记录。

比赛同步：

- **Codeforces**：官方 `contest.list`，过滤未来 60 天和过去 30 天。
- **AtCoder**：解析官方 `/contests/` 页面的 Upcoming / Recent 表格。
- **牛客**：解析 `ac.nowcoder.com/acm/contest/vip-index` 页面中的 `data-json` 比赛节点。
- 三个平台独立刷新；某个平台失败不会清空其他平台赛程。
- 结果缓存 10 分钟，页面支持强制刷新。

## 已知限制

- 洛谷题库接口是网页内嵌 JSON，不是正式公开 API，页面结构调整可能导致同步失败。
- 洛谷全量题库约 3 分钟，不建议高频全量刷新。
- 洛谷账号只同步公开过题集合，不提供逐题提交时间和 verdict。
- AtCoder 题目没有官方算法标签，当前只同步难度，标签筛选暂时为空。
- 账号同步是公开数据读取；如果用户关闭了做题记录公开，需要先去平台设置中打开。
- 牛客和 AtCoder 的赛程都来自页面解析，页面结构变化时可能出现同步失败；失败时会保留上次缓存。
- 洛谷题单只支持公开题单；题单页面结构变化时导入可能失败。

## 下一步

1. rating 曲线和每周训练报告。
2. 题目笔记全文搜索、错题本。
3. 比赛赛后自动生成补题清单。
4. PWA / 移动端和浏览器插件快速加入训练队列。

## 技术栈

- 前端：React 19 + TypeScript + Vite
- 后端：Node.js + Fastify + TypeScript
- 数据库：Node 内置 `node:sqlite`（WAL）
- 图标：lucide-react
- 测试：待补充（同步映射与统计逻辑适合 Vitest）
