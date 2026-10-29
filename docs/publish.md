# 发布到 npm

发布需要**你的 npm 账号**，仓库里没有、也不应该有凭据。这一步只能你来做，下面是
已经验证过的清单和确切命令。

---

## 发布前已经验证的

| 检查 | 结果 |
|---|---|
| `pnpm pack` 产出的 tarball 内容 | `dsh-skin-boot-sync` 6 个文件 / 5.4 KB；`dsh-boot-kit` 9 个文件 / 15.7 KB |
| 从解压后的 tarball 直接跑 CLI | `--version`、`--help` 正常，参数错误退出码 2 |
| 插件包自包含 | `lib/index.js`、`lib/client.js`、`cordis.patch.yml` 全在 |
| 两个包有无运行时依赖 | 都是**零依赖**，`npx` 不会拖慢 |
| `repository` / `homepage` / `bugs` | 已指向 `MrKgg3250/dsh-boot-kit` |

也就是说：**除了往 registry 推那一步，其余都验过了。**

---

## 顺序：先插件，后 CLI

`dsh-boot-kit` 运行时要按包名安装 `dsh-skin-boot-sync`，所以插件必须先存在。

```bash
npm login          # 浏览器或 OTP

cd packages/dsh-skin-boot-sync
npm publish        # 无 scope，默认 public

cd ../dsh-boot-kit
npm publish
```

用 pnpm 也行（`pnpm publish`），行为一致。

---

## 发布后验一遍

```bash
npm view dsh-skin-boot-sync version
npm view dsh-boot-kit version
npx dsh-boot-kit --version    # 应该打印 0.1.0
```

再跑一次干跑，确认 `npx` 通道真的通了：

```bash
npx dsh-boot-kit --dry-run
```

---

## 之后每次发版

1. 改 `package.json` 的 `version`（两个包各自独立版本，不必同步）
2. 重新 `npm publish`
3. 在 GitHub 打 tag 并写 Release，附件可以挂 `pnpm pack` 出来的 tgz ——
   这样不装 npm 的人也能 `dsh plugin add <tgz>` 装

> 版本号的取舍：`dsh-skin-boot-sync` 走语义化版本（`1.0.x` 修 bug，`1.x` 加功能）；
> `dsh-boot-kit` 还在 `0.x`，改 CLI 参数就升 minor。

---

## 一个容易忘的点

`packages/dsh-boot-kit/package.json` 里没有把 `dsh-skin-boot-sync` 写成依赖，这是
**故意的**：CLI 是把它装进**目标 profile**，不是装在自己身上。所以 CLI 必须保持
零依赖，否则 `npx` 会先拖一堆东西下来。
