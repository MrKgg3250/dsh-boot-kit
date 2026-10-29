# 发布

> **在线分发已停用。** 本项目改为纯本地分发：`install.cmd` + 两个 tgz 放进一个
> 文件夹，双击即装。`.github/workflows/release.yml` 已移除（打 tag 不再触发、
> 不再产生失败通知邮件）。下面的内容仅作历史记录，代码仍然可用。

分发方式：把 `install.cmd` 和两个 `.tgz` 拷到目标机器的同一个文件夹，双击
`install.cmd`。主题（`@linxin666/dsh-web-all`）来自 npm registry，装不上时会
自动降级为只装本地两项。

---

## 通道一：GitHub Release（实际在用，零账号）

打个 tag，CI 会测试、打包，把两个 tarball 挂到 Release 上：

```bash
git tag v1.0.0
git push origin v1.0.0
```

用户侧不经过 npm 也能装（`dsh-startup-screen` 就是这么分发的，它根本不在 npm 上）：

```bash
dsh plugin --profile desktop add \
  https://github.com/MrKgg3250/dsh-boot-kit/releases/download/v1.0.0/dsh-skin-boot-sync-1.0.0.tgz
```

规则：**tag 对应的版本必须先在 `package.json` 里改好**。重发同一个 tag 会删旧建新，
不会留下草稿 Release（草稿的附件对匿名用户 404）。

CLI 的默认来源（`--source release`）就是这个 tarball，所以 `--tier minimal/boot`
**完全不需要 npm 通道**。

## 通道二：GitHub Actions 发 npm（备用，目前用不了）

1. 在 <https://www.npmjs.com/settings/<你>/tokens> 建一个 **Granular Access Token**，
   权限只给「Read and write → Packages」，或建 **Automation** 型经典令牌（可绕过
   两步验证的非交互发布）
2. 仓库 **Settings → Secrets and variables → Actions → New repository secret**，
   名字必须是 `NPM_TOKEN`
3. 以后每次 `git tag v* && git push origin <tag>`，同一条流水线会先发 npm、再挂 Release

加令牌之前打的 tag 想补发 npm：**Actions → release → Run workflow**，填那个已存在的
tag 重跑一次即可。

## 通道三：本机 pnpm（备用，同样卡在发布端点）

这台机器没有 npm-cli，但有 DSH 自带的 pnpm，`pnpm publish` 与 `npm publish` 等价。
缺的不是工具，是**能访问发布端点的网络 + 账号令牌**，所以和通道二卡在同一处。

```powershell
# 你自己执行这一行，令牌不要经过聊天或提交进仓库
Add-Content $env:USERPROFILE\.npmrc "//registry.npmjs.org/:_authToken=<你的令牌>"
```

然后我来跑：

```bash
cd D:\Work\dsh_Desk\packages\dsh-skin-boot-sync
node <pnpm.mjs 路径> publish

cd ..\dsh-boot-kit
node <pnpm.mjs 路径> publish
```

---

## 顺序只有一条规则

**先发插件，再发 CLI。** CLI 运行时要按包名把 `dsh-skin-boot-sync` 装进目标
profile，插件不存在的话用户装完 CLI 就是坏的。Actions 流水线里写死了这个顺序。

## 发布前已经验证过的

| 检查 | 结果 |
|---|---|
| `pnpm pack` 两个包的文件清单 | 插件 6 文件 / 5.4 KB；CLI 9 文件 / 15.7 KB |
| 从解压后的 tarball 直接跑 CLI | `--version`、`--help` 正常，参数错误退出码 2 |
| 插件包自包含 | `lib/index.js`、`lib/client.js`、`cordis.patch.yml` 齐全 |
| 运行时依赖 | 两个包都是**零依赖** |
| `repository` / `homepage` / `bugs` | 已指向 `MrKgg3250/dsh-boot-kit` |

## 发完后验一遍

```bash
npm view dsh-skin-boot-sync version     # npm 通道
npx dsh-boot-kit --version              # npx 通道
# Release 通道：浏览器打开 Releases 页，两个 .tgz 能下载即通
```
