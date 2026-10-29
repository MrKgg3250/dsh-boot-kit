# dsh-skin-boot-sync

让皮肤的背景动画**在启动动画揭幕那一刻从第一帧开始播**。

DeepSeek Harness（DSH）插件，零运行时依赖，只有 5.7 KB。

> Restarts a skin's animated background video on its first frame when the DSH
> startup animation lifts, so the wallpaper does not appear mid-loop.

---

## 它解决什么

皮肤中心（skin-center）会把皮肤 manifest 里的 `backgroundMedia` 渲染成一段
`<video autoplay loop muted>`。这段视频**页面一加载就开播**，而启动动画还要在上面
盖好几秒——如果启动界面是要手动确认的那种，可能一盖就是十几秒。

等遮罩揭开，视频早就跑到循环中段了，看起来就像皮肤动画「没有从头开始」。

皮肤中心里点「试用」之所以正常，是因为它**重建了媒体元素**，新元素天然从 0 播。
本插件做的是同一件事的可观察等价形式：遮罩消失的瞬间把播放头拨回 0。

---

## 安装

```bash
dsh plugin --profile desktop add dsh-skin-boot-sync
```

然后**完全退出 DSH 再打开**（插件在启动时组装，热改不生效）。

卸载：

```bash
dsh plugin --profile desktop remove dsh-skin-boot-sync
```

---

## 它依赖哪些非官方契约

这些东西都不是公开 API，所以插件对每一处都做了降级，任一处改名都不会静默失效：

| 依赖点 | 来源 | 取不到时 |
|---|---|---|
| `#dsh-startup-root` 遮罩节点 | `dsh-startup-screen` | 改为监听事件，再不行就什么都不做 |
| `dsh-startup:done` 窗口事件 | `dsh-startup-screen` 移除遮罩后派发 | 退回轮询节点是否消失 |
| `[data-dsh-skin-layer="background"] video` | `@linxin666/dsh-client-ui-skin-center` | 退回按 `src` 含 `/skin-center/` 识别 |

**没有任何启动动画时，插件完全不介入**——普通刷新页面的行为与装之前一致。

---

## 它不会做什么

- 不修改皮肤文件（皮肤来自市场，会被更新覆盖）
- 不接管播放策略：不改变音量、不暂停、不改循环
- 不支持 `backgroundMedia` 是图片的皮肤（图片没有播放头，本来就从第一帧开始）

---

## 测试

```bash
node --test test/
```

8 组用例，覆盖一个**实测踩到的回归**：客户端 bundle 会在
`/dsh-startup/splash.js` 之前执行，所以不能在 `apply()` 里判断「此刻有没有启动动画」。
那一版会导致插件永远不生效。用例名里写着 `the v1 bug`。

---

## 长期方案

本插件是过渡桥。真正干净的做法是给 skin-center 增加一个
`backgroundMedia.restartOnReveal`，或者标准化一个 `dsh:shell-revealed` 事件。
上游合入后本插件即可降级为 no-op。

MIT License.
