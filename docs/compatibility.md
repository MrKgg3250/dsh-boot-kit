# 兼容性与依赖的契约

## 版本矩阵

| 组件 | 版本 | 说明 |
|---|---|---|
| DeepSeek Harness | **0.2.1-rc.3**（实测） | 最低要求也是它；`dsh-web-all` 与 `skin-center` 都声明 `>=0.2.1-rc.3` |
| pnpm | 11.28.5（随应用内置） | 见 [pitfalls 第 1 条](pitfalls.md) |
| Node | 24.21.0（随应用内置）；插件要求 `^22.19 \|\| >=24` | 安装器自身也跑在这个 Node 上 |
| 平台 | Windows（实测） | 桌面端与 `dsh web` 均由同一套 Host 组装 |

> 桌面端只打包了这一个 Node 与 pnpm；用系统里的其他版本很可能不行，
> 因为 profile 的依赖是由应用自带的 pnpm 装的。

---

## 运行时要依赖的非官方契约

`dsh-skin-boot-sync` 的整个功能建立在三个**不是公开 API** 的东西上。任何一处变化
都会让它退化，所以每一处都有降级路径：

| 契约 | 出自 | 失效时 |
|---|---|---|
| `#dsh-startup-root` 遮罩节点 | `dsh-startup-screen/lib/splash.js` | 靠 `dsh-startup:done` 事件 |
| `dsh-startup:done` 窗口事件 | 同上，`root.remove()` 之后派发 | 靠轮询节点消失 |
| `[data-dsh-skin-layer="background"] video` | `@linxin666/dsh-client-ui-skin-center` | 靠 `src` 含 `/skin-center/` 识别 |

三者全失效的结果是「什么都不做」，不是报错——所以**装好之后没有任何视觉变化，
不代表插件坏了**，先确认这次启动确实有启动动画，且皮肤背景是视频而不是图片。

降级顺序是刻意设计的：先试最精确的信号（事件），再试结构最稳的信号（节点 id），
最后试「内容特征」（资源路径）。加新的锚点时请保持这个顺序。

---

## 不兼容的情况

| 情况 | 结果 |
|---|---|
| 皮肤背景是**图片**（`type: "image"`） | 无效果，也不需要——图片没有播放头 |
| 启动动画被关掉 / 本次策略不播 | 插件完全不介入，普通刷新行为不变 |
| 换成别的启动动画插件，遮罩 id 变了 | 事件或轮询都收不到，退化为「什么都不做」 |
| DSH < 0.2.1-rc.3 | 安装器在 preflight 直接拒绝 |

---

## 上游修好之后

理想形态是 skin-center 给 `backgroundMedia` 加一个 `restartOnReveal`，或者统一派发
一个 `dsh:shell-revealed` 事件。那样这个插件就该降级为 no-op。

在它发生之前，本仓库承担的是兼容层的角色。
