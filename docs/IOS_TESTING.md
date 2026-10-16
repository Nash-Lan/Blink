# Windows 与 iPhone 验证方案

更新日期：2026-10-15。本文针对 Blink、Expo SDK 57 和个人自用场景。本文只记录可执行路径；本阶段没有登录 Expo/Apple 账户、没有创建 EAS Build，也没有完成真实 iPhone 或 iOS Simulator 测试。

## 现在可在 Windows 完成的验证

Windows 可以完成 TypeScript、ESLint、Vitest、Playwright Web、Expo Web export 和 `expo-doctor`。当前项目不得把 App Store 版 iOS Expo Go 视为 SDK 57 的可用真机路径；即使 `expo-sqlite` 属于 Expo Go 内置模块，也不能据此声称 Blink 能直接扫码运行或验证本地通知。SDK 57 的生产项目应使用 development build。[Expo SDK 57](https://expo.dev/changelog/sdk-57)

因此，Windows 上只能完成 Mock 适配器、Web 和静态配置验证。真实 iPhone SQLite 与本地通知验证必须等待一个正确签名、包含当前原生模块和 config plugin 的 Blink development build。

## iOS Simulator 与真机安装的区别

iOS Simulator 只能安装在 macOS；Windows 本机不能运行 Xcode Simulator。Expo 官方给出的 Windows 选择是物理 iOS 设备或远程 Expo Simulators。[Expo iOS Simulator](https://docs.expo.dev/workflow/ios-simulator/)

Simulator build 是为模拟器架构生成的应用，可以在没有 Apple Developer 账户时由 EAS Build 生成，但它不能安装到 iPhone。即使已经下载到 Windows，也仍需要 macOS 上的 iOS Simulator，或另行使用远程模拟器服务。[Expo Simulator builds](https://docs.expo.dev/build-reference/simulators/)

真机安装需要设备可接受的签名和 provisioning profile。`.ipa` 只是容器格式；生成或下载一个 `.ipa` 不代表它已用适用于该 iPhone 的证书和 profile 签名，也不代表能够成功安装。

## EAS Build 免费额度与签名

Expo Free plan 提供按月重置的免费构建额度；额度用尽后不会产生自动超额费用，只能等待重置或主动升级。[Expo billing FAQ](https://docs.expo.dev/billing/faq/)

免费构建额度只解决云端编译资源，不会提供 Apple 签名资格。Expo 的 iOS 真机开发构建流程要求 Apple Developer 账户、签名凭据和设备 provisioning profile；当前 Expo 环境指南进一步要求有效的 Apple Developer Program 订阅。[EAS iOS device build](https://docs.expo.dev/tutorial/eas/ios-development-build-for-devices/)、[Expo iOS development environment](https://docs.expo.dev/get-started/set-up-your-environment/?device=physical&mode=development-build&platform=ios)

因此，在“不加入 Apple Developer Program”的约束下，EAS 免费额度不能独立解决 Blink 自定义开发包在 iPhone 上的签名安装。不要为了试验运行 `eas build`：它可能消耗免费额度，并且仍会在签名环节要求合格凭据。

## 免费 Apple ID 与 Personal Team

Apple 允许在 Xcode 中用免费 Apple Account 创建 Personal Team，并把个人应用安装到自己的设备。官方限制是：最多 10 个 App ID、最多 3 台设备、每台设备最多 3 个应用；App ID、设备注册和 provisioning profile 均在 7 天后到期，之后必须重新构建并安装。[Apple Developer account overview](https://developer.apple.com/help/account/basics/about-your-developer-account)

Personal Team 不能用于 App Store 提交或常规分发。[Apple QA1915](https://developer.apple.com/library/archive/qa/qa1915/)

这条免费侧载路径实际需要一台支持当前 iPhone/iOS 的 Mac 和相应版本的 Xcode：

1. 在 Mac 安装 Xcode并登录免费 Apple Account，选择 Personal Team。
2. 将 iPhone 连接到 Mac、信任电脑并启用 Developer Mode。iOS 16 及以上的开发构建需要 Developer Mode。[Expo iOS Developer Mode](https://docs.expo.dev/guides/ios-developer-mode/)
3. 在 Mac 上获取 Blink 源码并安装依赖。
4. 使用 Expo 的本地 iOS 流程生成临时原生工程并部署到连接的设备；Blink 使用 CNG，不应把生成的 `ios/` 提交回仓库。
5. 7 天后重新签名、构建和安装。

Windows 不能完成上述 Xcode 签名步骤。Expo 也不正式支持 Windows 本地 EAS Build，且 iOS 构建仍依赖 Xcode、CocoaPods 和 macOS 工具链。[EAS local builds](https://docs.expo.dev/build-reference/local-builds/)

## 推荐顺序与成本

| 顺序 | 方案 | 现金成本 | 能验证什么 | 主要限制 |
| --- | --- | ---: | --- | --- |
| 1 | Windows 自动化与 Web 验证 | 0 | 业务逻辑、Mock 通知适配器、Web 回归和配置检查 | 不验证任何 iOS 原生行为 |
| 2 | 临时借用 Mac + Xcode Personal Team | 0 | Blink 自定义开发构建、真机 SQLite和本地通知 | 需要 Mac；签名 7 天到期；不能 TestFlight/App Store |
| 3 | EAS iOS Simulator build | 可落在免费额度内 | 独立模拟器构建 | 不能装 iPhone；Windows 还需要远程模拟器服务或一台 Mac |
| 4 | EAS iOS device build | Expo 构建可能免费 | 云端生成可装真机的开发构建 | 仍需有效 Apple Developer Program 会员及签名凭据 |

当前先完成方案 1。需要验证 SQLite 和本地通知时，优先短期借用 Mac 走方案 2；暂不购买 Apple Developer Program，也不创建收费构建。

## Blink development build 真机清单

1. 确认构建来自当前 SDK 57 lockfile，且 `app.json` 已包含 `expo-notifications` config plugin。
2. 记录 iPhone 型号、iOS 版本、Xcode 版本、Blink commit 和签名到期时间。
3. 首次启动分别测试允许、临时允许和拒绝权限；确认拒绝后应用内 Banner 正常。
4. 测试前台仅 Banner、锁屏系统通知、后台系统通知和应用终止后的系统通知。
5. 测试创建、连续编辑、关闭提醒、完成、删除、Undo、重启和备份恢复。
6. 点击通知时确认能定位事项；事项已删除时确认安全回到 Deadlines。
7. 检查系统时间与时区变化、Focus 模式、通知被手动清除和 7 天 Personal Team 重签后的行为。
8. 每一项分别记录“已调度”“已在系统展示”“已点击”，禁止把三者合并为一个结果。

## 当前无法确认的能力

- Blink 独立签名包在该 iPhone 上的安装、首次启动和升级保留数据。
- iOS 原生 SQLite 文件在独立应用容器中的实际迁移与故障恢复。
- 本地通知权限、前台/后台/终止状态投递、Focus 模式和时区变化行为。
- Personal Team 对下一阶段所需通知能力的实际签名限制；应在 Mac 真机构建前用当前 Xcode 再确认。
- App Store、TestFlight、ad hoc 分发和推送通知，因为当前未加入 Apple Developer Program。
