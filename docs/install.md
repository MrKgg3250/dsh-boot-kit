# 安装图解

一次真实的 `--dry-run`，跑在一个装了插件但**没有登记进 `dsh.profile.bundles`** 的
profile 上——所以第 4、5 步确实有活干，不是空转。

![dsh-boot-kit 的 dry-run 输出](media/install-dry-run.gif)

> 输出是真实的。为了做成文档，只做了两处归一化：把本机路径换成通用路径，
> 以及去掉了「桌面端正在运行」这条临时警告（正常安装时你已经退出了应用）。

---

## 先干跑，再真装

```bash
npx dsh-boot-kit --dry-run     # 只打印，不写文件、不装包
npx dsh-boot-kit               # 真装
```

干跑和真装走的是**同一段代码**，唯一的区别是写操作被替换成打印。所以干跑看到的
计划，就是真装会做的事。

---

## 七步分别在干什么

| 步 | 你会看到 | 它在做什么 |
|---|---|---|
| 1 | `preflight` | 查 profile 是否存在、DSH 版本是否够、桌面端是否占着 profile |
| 2 | `pnpm flags` | 补 `strictDepBuilds: false`，否则 pnpm 11 会让安装以非 0 退出 |
| 3 | `install` | 一次性 `dsh plugin add`；GitHub-only 的启动动画先下 tarball |
| 4 | `reconcile` | **把装好但没登记的包补进 `dsh.profile.bundles`** |
| 5 | `opt-out rows` | 往 `cordis.patch.yml` 追加 `disabled: true` 行 |
| 6 | `verify` | 校验登记、解析、patch 文件、跨层重复 loader id |
| 7 | `report` | 汇总真实改动 + 重启提示 |

第 4 步和第 6 步是这套工具存在的理由：[../pitfalls.md](../pitfalls.md) 里第 2 条和第 3 条。

最后那份汇总里，`~` 表示这次真的改了，`·` 表示已经是想要的样子：

```
  done.
    ~ pnpmFlags: strictDepBuilds: false
    ~ install: planned
    ~ reconcile: dsh-skin-boot-sync
    ~ patch: web-ui-pet
```

---

## 装完怎么确认成功

1. **完全退出** DeepSeek Harness，再打开（不是刷新页面——插件在启动时组装）。
2. 看到启动动画，手动确认走完。
3. 主界面出现的那一刻，皮肤背景应该**从第一帧开始**。

如果第 3 条不对，先确认这两件事，再判断是不是插件的问题：

- 这次启动**确实有**启动动画（没有的话插件按设计完全不介入）
- 皮肤背景是**视频**，不是图片（图片没有播放头，本来就从第一帧开始）

---

## 常见失败

| 输出 | 原因 | 处理 |
|---|---|---|
| `E_PROFILE_LOCK` | 桌面端还在跑 | 完全退出应用再重试 |
| `E_NO_PROFILE` | profile 还没初始化 | 先打开一次应用 |
| `E_DSH_VERSION` | DSH 太旧 | 升级到 ≥ 0.2.1-rc.3 |
| `E_BUILD_SCRIPTS` | pnpm 仍拒绝构建脚本 | 在 profile 目录跑 `pnpm approve-builds` |
| `E_GITHUB_DOWNLOAD` | 拿不到启动动画 tarball | 手动下载后放进提示的路径 |
| `E_VERIFY` | 装完但校验没过 | **先别重启**，按列出的问题修 |

---

## 回滚

装之前每个被改的文件都会留一份 `*.bak-<时间戳>`。手工回滚三步：

1. 从 `package.json` 的 `dsh.profile.bundles` 删掉对应行
2. 从 `cordis.patch.yml` 删掉带 `# Disabled by dsh-boot-kit` 注释的那两行
3. `dsh plugin --profile <name> remove <包名>`

`--tier full` 装的 `@linxin666/dsh-web-all` 带 24 个子包，一起卸载即可。
