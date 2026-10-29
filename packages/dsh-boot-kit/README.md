# dsh-boot-kit（CLI）

把启动动画、皮肤背景同步和一组「关掉」的行装进一个 DSH profile，并且**校验安装
结果**——这是它和不写脚本直接敲 `dsh plugin add` 的唯一区别，也是全部区别。

```bash
npx dsh-boot-kit --dry-run     # 先看计划
npx dsh-boot-kit               # 装（默认 --tier full）
```

装完**完全退出 DeepSeek Harness 再打开**。插件在启动时组装，刷新页面没用。

---

## 选项

```
--tier <minimal|boot|full>   装哪些（默认 full）
--profile <name>             profile 名（默认 $DSH_PROFILE 或 desktop）
--dsh <path>                 dsh 入口（默认 $DSH_CLI 或 PATH 上的 dsh）
--dsh-home <path>            DSH home（默认 $DSH_HOME 或 ~/.dsh）
--source <npm|local>         本插件的来源（默认 npm）
--repo-root <path>           --source local 时必填
--with-widget                额外安装 dsh-whale-widget（保持关闭）
--dry-run                    只打印，不写文件、不跑安装
--force                      桌面端在跑也继续（可能被应用覆盖写）
```

退出码：`0` 成功 · `1` 失败 · `2` 参数错误。

---

## 七步

| # | 步骤 | 幂等做法 |
|---|---|---|
| 1 | `preflight` | 校验 profile 存在、DSH 版本、桌面端是否在跑，不通过就**不开工** |
| 2 | `pnpm flags` | 只在缺 `strictDepBuilds: false` 时追加；显式写了 `true` 只告警不覆盖 |
| 3 | `install` | 一次性 `dsh plugin add`；遇到 `IGNORED_BUILDS` 修好 flags 后重试一次 |
| 4 | `reconcile` | 只补**本计划负责的**包，已在列表里的不重复加 |
| 5 | `patch` | 只关**确实装了**的包对应的行；已有关闭行时不动（尊重用户选择） |
| 6 | `verify` | 登记缺失、无法解析、patch 文件缺失、跨层重复 loader id |
| 7 | `report` | 打印实际改动 + 重启提示 |

重复运行只会输出「unchanged」。

---

## 为什么第 4 步必需

`dsh plugin add` 的 bundle 回写有两个前提：pnpm 退出码为 0，且**本次 run 新增了
依赖**。先失败过一次的安装，第二次重跑时依赖已在 `package.json` 里，diff 为空，
于是**永远不回写**——包装好了、`bundles` 里没有、启动时静默不加载。

这一点无法从插件侧解决，只能由安装器补。详见 [../../docs/pitfalls.md](../../docs/pitfalls.md)。

---

## 失败码

| 码 | 含义 | 怎么办 |
|---|---|---|
| `E_NO_PROFILE` | profile 目录不存在 | 先打开一次桌面端让它初始化 |
| `E_PROFILE_LOCK` | 桌面端在跑 | 完全退出；或 `--force` |
| `E_DSH_VERSION` | DSH 太旧 | 升级到 ≥ 0.2.1-rc.3 |
| `E_BUILD_SCRIPTS` | pnpm 仍拒绝构建脚本 | 在 profile 里 `pnpm approve-builds` |
| `E_PACKAGE_NOT_FOUND` | 某个包解析不到 | 看提示里的包名 |
| `E_GITHUB_DOWNLOAD` | 拿不到启动动画 tarball | 手动下载放到提示的路径 |
| `E_VERIFY` | 装完但校验不通过 | 按列出的问题修，别重启 |

---

## 回滚

每一步写文件前都会留 `*.bak-<时间戳>`。手工回滚：

1. 从 `package.json` 的 `dsh.profile.bundles` 删掉对应行
2. 从 `cordis.patch.yml` 删掉带注释的那两行
3. `dsh plugin --profile <name> remove <包名>`

`--tier full` 装的 `@linxin666/dsh-web-all` 有 24 个子包，一起卸载即可。
