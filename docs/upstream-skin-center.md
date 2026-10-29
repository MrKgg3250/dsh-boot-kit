# 上游提案：让皮肤背景在揭幕时从第一帧开始

给 `@linxin666/dsh-client-ui-skin-center` 的 issue / PR 草案。
它一旦合入，`dsh-skin-boot-sync` 就可以降级为 no-op。

---

## 标题

`backgroundMedia`：增加 `restartOnReveal`，让背景视频在遮罩揭幕时从第一帧开始

## 现象

皮肤 manifest 的 `contributes.backgroundMedia`（`type: "video"`）会被渲染成：

```js
const video = doc.createElement('video')
video.src = `${assetBase}/${layer.src}`
video.muted = true
video.loop = true
video.autoplay = true
video.playsInline = true
```

`autoplay` 意味着**页面一加载就开播**，而 DSH 的启动动画要在这之上盖若干秒
（`dsh-startup-screen` 这类交互式启动界面，还会一直盖到用户点完确认为止）。

等遮罩揭开，这段 25 秒的循环已经跑到中段了。用户看到的是「皮肤动画没有从头开始」，
但严格说它从没停过 —— 它一直在播，只是没人看见开头。

## 为什么现有的「试用」没有这个问题

皮肤中心的试用按钮会**重建媒体元素**，新元素天然从 0 播。所以同一个皮肤在面板里
预览是正常的，开机却不对 —— 差异不在播放策略，而在元素是新是旧。

## 建议的接口

在 `backgroundMedia` 上加一个可选布尔值，默认 `false`（保持现有行为）：

```json
"contributes": {
  "backgroundMedia": {
    "dark": {
      "type": "video",
      "src": "assets/loop.mp4",
      "restartOnReveal": true
    }
  }
}
```

语义：**首次绘制到揭幕之间，播放头保持在 0**；揭幕时刻开始播放。

如果更希望做成全局行为而不是皮肤开关，等价做法是在 `document` 上派发一个标准化事件：

```js
document.dispatchEvent(new CustomEvent('dsh:shell-revealed'))
```

skin-center 监听它、把当前背景视频的 `currentTime` 归零即可。

## 实现位置

`lib/client.js` 里 `buildBackgroundMedia()` 与 `createSkinController()` 之间：

- 建出视频后先 `video.pause()`，记录为「待启动」
- 收到揭幕信号时 `currentTime = 0` 再 `play()`
- 如果 60 秒内没有任何揭幕信号（比如启动动画被关掉），直接放行，别把背景永久按住

## 为什么应该做在上游

1. 播放策略是皮肤中心的职责，每个下游插件各写一份 seek 逻辑，迟早互相打架
2. 下游只能靠**非公开契约**判断揭幕时刻（`#dsh-startup-root` 节点、`dsh-startup:done`
   事件），这两样都不是 API，随时可能改名
3. 现在这个行为要额外装一个插件才能得到，而它本该是皮肤的默认表现

## 在此之前

`dsh-skin-boot-sync` 是这个提案的过渡实现：靠观察遮罩出现/消失来归零播放头，
并对三处非官方契约都做了降级（见
[compatibility.md](compatibility.md)）。上游合入后，它应当降级为 no-op 并标注废弃。
