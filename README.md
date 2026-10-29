# dsh-boot-kit

![dsh-boot-kit：一条命令换掉 DSH 的开机画面](docs/media/cover.png)

[![ci](https://github.com/MrKgg3250/dsh-boot-kit/actions/workflows/ci.yml/badge.svg)](https://github.com/MrKgg3250/dsh-boot-kit/actions/workflows/ci.yml)
[![price](docs/media/badge-price.svg)](https://github.com/MrKgg3250/dsh-boot-kit)
[![license](docs/media/badge-license.svg)](LICENSE)
[![dsh](docs/media/badge-dsh.svg)](docs/compatibility.md)

把「启动动画 + 皮肤背景从头播 + 关掉右下角宠物/余额挂件」这套 DSH 启动体验，
做成一条命令装好。**免费、MIT、无遥测。**

> One command to install a DSH startup animation, make the skin backdrop start on
> its first frame when the curtain lifts, and switch off the floating pet and
> balance widget.

![dsh-boot-kit 的 dry-run 输出](docs/media/install-dry-run.gif)

> 一次真实的 `--dry-run`。逐步说明见 [docs/install.md](docs/install.md)。

---

## 快速开始

```bash
# 先完全退出 DeepSeek Harness（桌面端会占用 profile 的 package.json）
npx dsh-boot-kit

# 装完再打开应用
```

> 还没发布到 npm 之前，`npx` 会找不到包。先 clone 再从仓库跑，行为完全一样：
>
> ```bash
> git clone https://github.com/MrKgg3250/dsh-boot-kit.git
> node dsh-skin/packages/dsh-boot-kit/bin.mjs --dry-run
> ```

只想要皮肤动画同步，不要启动动画和全家桶：

```bash
npx dsh-boot-kit --tier minimal
```

先看它打算做什么，不写任何文件：

```bash
npx dsh-boot-kit --dry-run
```

---

## 三个档位

| 档位 | 装什么 | 适合 |
|---|---|---|
| `--tier minimal` | `dsh-skin-boot-sync` | 已有自己的启动动画/皮肤 |
| `--tier boot` | + `dsh-startup-screen@1.2.0` | 要启动动画 + 皮肤同步 |
| `--tier full`（默认） | + `@linxin666/dsh-web-all`，并关掉 `web-ui-pet` | 开箱即用 |

`full` **不会**安装 `dsh-whale-widget`（那个右下角余额挂件）。想要就加
`--with-widget`，它会装但保持关闭。

---

## 它到底改了什么

1. `pnpm-workspace.yaml` 里加 `strictDepBuilds: false`
2. 往 profile 装上面那些包
3. **把装好但没登记的包补进 `dsh.profile.bundles`**
4. 在 `cordis.patch.yml` 追加 `- id: web-ui-pet` / `disabled: true` 之类的行
5. 校验：每个计划内的包都登记了、能解析、patch 文件在、没有重复的 loader id
6. 每次改动前备份原文件（`*.bak-<时间戳>`）

第 3 步和第 5 步是这套东西存在的理由，理由写在
[docs/pitfalls.md](docs/pitfalls.md)。

想撤销：

```bash
npx dsh-boot-kit --revert --dry-run   # 先看计划
npx dsh-boot-kit --revert
```

它按意图反做（删掉本工具登记的行和禁用行、卸载本工具装的包），不还原备份——
备份可能早于你自己的编辑。详见 [docs/install.md](docs/install.md#回滚)。

---

## 为什么不是一个插件

因为**插件没法修自己的安装**。下面每一条都会让「装上了但没生效」，而且插件代码
在那时还没机会运行：

- `dsh-startup-screen` 不在 npm，只有 GitHub Release —— `dependencies` 表达不了
- pnpm 11 默认 `strictDepBuilds: true`，原生构建脚本未批准时安装直接非 0 退出
- `dsh plugin` 只在「pnpm 退出 0 且本次新增了依赖」时回写 `bundles`
- desktop profile 由 Electron 托管，CLI 连 `--dump-config` 都被拒绝

所以是「运行时小插件 + 安装器」的组合，而不是一个包。

---

## 仓库结构

```
packages/
  dsh-skin-boot-sync/   运行时插件：揭幕时把皮肤背景视频拨回第一帧（5.7 KB，零依赖）
  dsh-boot-kit/         安装器 CLI：七步流水线 + 校验 + 回滚备份
docs/
  install.md            安装图解（含 GIF）
  pitfalls.md           四个坑的复盘（含实测证据）
  compatibility.md      版本矩阵与非官方契约
  media/                封面、徽章、截图，全部由 tools/ 下的脚本生成
tools/
  make-brand.py         生成封面 PNG 与自托管徽章 SVG（需要 Edge/Chrome）
  make-docs-media.py    从真实输出重生成安装截图/GIF（需要 Edge/Chrome + Pillow）
```

## 开发

```bash
# 全部测试（node --test 默认发现，别传目录——见 docs/pitfalls.md）
node --test

# 单个包
node --test "packages/dsh-skin-boot-sync/test/*.test.mjs"
node --test "packages/dsh-boot-kit/test/*.test.mjs"

# 用本仓库的插件源码装（不依赖 npm 发布）
node packages/dsh-boot-kit/bin.mjs --source local --repo-root . --dry-run
```

文档配图不要手改，改完 CLI 输出后重跑：

```bash
python tools/make-brand.py
python tools/make-docs-media.py --input transcript.txt
```

## 许可

MIT。仓库不含任何第三方代码或皮肤素材，第三方组件与许可见 [NOTICE](NOTICE)。

**皮肤不随本仓库分发**：请自行在 DSH 皮肤中心安装（例如 `whale-fantasy`，
其许可为 CC BY-NC-SA 4.0，不可镜像或再分发）。
