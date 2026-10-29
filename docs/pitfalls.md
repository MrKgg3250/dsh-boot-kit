# 四个坑

这套工具存在的唯一理由。每一条都是实测撞出来的，不是推测；每一条都会表现为
「装上了，但没生效」，而且都不在插件代码能触及的范围里。

---

## 1. pnpm 11 把未批准的构建脚本升级成硬错误

**现象**：`dsh plugin add` 打印了完整的 `+ 包名` 列表，最后却以退出码 1 结束，
并给出：

```
[ERR_PNPM_IGNORED_BUILDS] Ignored build scripts: cloudflared@0.7.3, cpu-features@0.0.10, ssh2@1.17.0
Run "pnpm approve-builds" to pick which dependencies should be allowed to run scripts.
```

**为什么**：`@linxin666/dsh-web-all` 依赖 `ssh2` / `cpu-features` / `cloudflared`，
它们都带原生构建脚本。pnpm 11 的 `strictDepBuilds` **默认为 true**，把「有构建脚本
但没被批准」从警告升级成错误。

**试过但无效**：把 `ignoredBuiltDependencies` 写进 `pnpm-workspace.yaml`
**和** `package.json` 的 `pnpm` 字段都不行——pnpm 11 里这个键已是 legacy。

**有效**：

```yaml
strictDepBuilds: false
```

**后果**（关键）：退出码非 0 会连带跳过第 2 个坑里的 bundle 回写。

---

## 2. `bundles` 只在「退出 0 且本次有新增」时回写

**现象**：`node_modules` 里包是齐的，`package.json` 的 `dependencies` 也写了，
但 `dsh.profile.bundles` 里没有——启动时静默不加载。

**为什么**：`dsh plugin` 的回写逻辑按「本次 run 新增的依赖」做 diff。先失败过一次的
安装，第二次重跑时依赖已经在 `package.json` 里，diff 为空，于是**永远不回写**。

实测记录：同一批包，`add` 失败后重跑 `add`、再跑 `install`，退出码都变成 0 了，
`bundles` 依旧没变。

**结论**：这一步只能由外部补齐。本仓库的 `reconcile` 就是它。

顺带一个约束：**只补本计划负责的包**。按「所有声明了 `dsh.bundle.patch` 的依赖」扫
会误伤——`dsh-qoder-connect` 就是声明了 patch 却从没被任何 profile 列进 bundles 的
真实例子，把它「修」进 bundles 等于擅自启用一个用户没要的插件。

---

## 3. 桌面端托管 profile，CLI 拒绝读它

**现象**：

```
$ dsh --profile desktop --dump-config
error: profile "desktop" is managed exclusively by the Electron application
```

`dsh plugin add/remove` 反而能用。所以：**能写，但没法用官方途径校验组装结果**。

**后果**：`verify` 只能自己做——读 `package.json`、读各包的 `cordis.patch.yml`、
自己算注册缺失和 id 冲突。

安装期间桌面端在跑也有风险：官方文档写的是「先完全退出（`desktop-plugins.lock.json`
记着谁装了什么），运行中写进去会被覆盖」。本 CLI 检测到进程在跑就拒绝开工，除非
`--force`。

---

## 4. 客户端 bundle 比启动动画的遮罩先执行

**现象**：插件装好了、浏览器也真的下发了
`/plugins/??…,dsh-skin-boot-sync/client.js`（200），但什么都没发生。

**为什么**：网络时序（实测，同一页面加载）：

| 时间 | 事件 |
|---|---|
| `…981717` | 客户端 bundle 执行 → 插件 `apply()` 在这一刻跑 |
| `…981721` | 才去拉 `/dsh-startup/splash.js` |

也就是说 `apply()` 里 `document.getElementById('dsh-startup-root')` 必然为 null。
第一版用它做守卫：

```js
if (!hasSplash && !window.__DSH_STARTUP__) return   // ← 永远在这里退出
```

**正确做法**：不要在 `apply()` 里判断「此刻有没有启动动画」。改成观察——
等遮罩出现，再等它消失；从没出现过就完全不介入。

这条现在是 `dsh-skin-boot-sync` 的回归用例，名字就叫
`rewinds when the bundle runs BEFORE the splash exists (the v1 bug)`。

---

## 一个不是坑，但容易误判

皮肤中心的「试用」按钮能让背景从第一帧开始，看起来像是「它有个 API 可以调」。
其实不是：skin-center 的客户端代码里**没有任何 `currentTime` / `play()` 调用**，
它只是**重建了背景媒体元素**，新元素天然从 0 播。

所以本插件的做法（遮罩消失时 seek 回 0）是可观察等价，不是调用同一路径。
如果将来 seek 在某些环境里被吞掉，备选方案就是照「试用」的原样做：把 `<video>`
节点整个换成一个同 `src` 的新元素。
