# 收录进市场目录

DSH 的市场目录是 `@linxin666/dsh-client-ui-community-plugins` 里的 `community.json`：
一个扁平数组，每条 10 个字段。它由仓库 <https://github.com/zhu1090093659/dsh-web>
维护，**收录靠提 PR**。

目录里现有 148 条，其中 117 条带 `npm` 字段。

---

## 建议只提插件，不提安装器

目录是**插件**目录（用户装完就在 DSH 里生效的东西）。`dsh-boot-kit` 是个 CLI 安装器，
不在这个语义里 —— 把 CLI 塞进去会让目录变得含糊。所以只提 `dsh-skin-boot-sync`。

---

## 要追加的条目

字段顺序和现有条目保持一致，不要多写字段：

```json
  {
    "id": "dsh-skin-boot-sync",
    "name": "皮肤动画从头播",
    "nameEn": "Skin Backdrop Boot Sync",
    "author": "MrKgg3250",
    "description": "皮肤的背景动画在启动动画揭幕那一刻从第一帧开始播。皮肤中心把 manifest 的 backgroundMedia 渲染成 <video autoplay loop>，页面一加载就开播，等遮罩揭开时早已跑到循环中段；本插件在遮罩消失时把播放头拨回 0。兼容任意启动动画插件与任意视频皮肤，没有任何启动动画时完全不介入。",
    "descriptionEn": "Starts a skin's animated background on its first frame at the moment the startup animation lifts. The skin center renders backgroundMedia as an autoplay looping video from page load, so by the time the curtain rises it is already mid-loop; this plugin rewinds it when the overlay disappears. Works with any startup plugin and any video skin, and stays completely out of the way when there is no startup animation.",
    "repo": "https://github.com/MrKgg3250/dsh-boot-kit",
    "npm": "dsh-skin-boot-sync",
    "category": "ui",
    "subcategory": "render"
  }
```

`category` / `subcategory` 取自现有取值集合（`ui` / `render`），与同为渲染层的
`dsh-web-start-ui` 一致。

---

## 提交前的前置条件

**先发布到 npm**（见 [publish.md](publish.md)）。条目里的 `npm` 字段指向包名，包不存在
的话，装的人会直接失败 —— 这比不收录更糟。

---

## PR 正文（可直接用）

> **Add dsh-skin-boot-sync: start the skin backdrop on frame 1**
>
> A skin's `backgroundMedia` is rendered by the skin center as
> `<video autoplay loop muted>`, so it begins playing at page load. The startup
> animation then covers the app for several seconds — and indefinitely if the
> startup screen is interactive. By the time the overlay disappears the clip is
> already mid-loop, which reads as "the wallpaper never started".
>
> This plugin rewinds the background video to frame 0 when the curtain lifts, so
> the visible result matches clicking "try on" in the skin center (which gets it
> for free by rebuilding the media element).
>
> - Works with any startup plugin: it keys off `#dsh-startup-root` and the
>   `dsh-startup:done` event, with a polling fallback.
> - Falls back to matching the skin-center asset route when the decoration-layer
>   attribute is renamed.
> - Does nothing at all when no startup animation is present.
> - Zero runtime dependencies, 8 behaviour tests, MIT.
>
> Repo: https://github.com/MrKgg3250/dsh-boot-kit
> npm: `dsh-skin-boot-sync`

---

## 一个提醒

条目里的 `"repo"` 目前指向 monorepo 根。如果维护者希望指向子包，改成
`https://github.com/MrKgg3250/dsh-boot-kit/tree/main/packages/dsh-skin-boot-sync`
即可 —— 两种写法现有条目里都有先例。
