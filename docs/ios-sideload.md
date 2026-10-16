# Windows → GitHub macOS → Sideloadly

适用：Blink v0.2.0 / Expo SDK 57。准备日期：2026-10-16。

本工作流只生成未签名的 iPhone IPA；Apple ID、证书、provisioning profile 均不进入 GitHub。签名和安装在 Windows 的 Sideloadly 中完成。不使用 EAS、TestFlight、App Store 或其他云端构建平台。

## 分支、仓库与应用标识

- 构建分支：`chore/ios-sideload`，从 `113accec74cac7522de4c3f820018e76c0ddb8ad` 创建。
- `feat/v0.2.0` 保持在基线；没有修改既有 checkpoint 引用。
- `origin`：`https://github.com/Nash-Lan/Blink.git`。只读 API 检查确认仓库已存在、当前为 **公开**，默认分支为 `main`；本次没有创建仓库或改变可见性。
- 固定 Bundle ID：`com.nashlan.blink`，根据 GitHub 所有者 `Nash-Lan` 规范化为合法反向域名格式。不会加入日期、run ID 或提交号。这是项目内稳定标识，尚未向 Apple 注册，也不代表验证过全球唯一性。
- `package.json`、lockfile、业务代码、SQLite 模式、通知算法和 DeepSeek 安全设计均不修改。Router 入口仍为 `expo-router/entry`，页面位于 `src/app/`。

## 工作流做什么

1. 使用 GitHub 标准 `macos-26` Runner 和 Node 22。检查 Runner 默认 Xcode 至少为 26.4，不满足则停止；不下载 Xcode 或执行外部安装脚本。
2. 使用只读仓库权限检出代码，不持久化 checkout 凭据。三个 Action 均来自 GitHub 官方 `actions/*`，固定到已核对的 v4 commit SHA。
3. 拒绝 Git 跟踪的环境文件、数据库、常见凭据文件；通过 `EXPO_NO_DOTENV=1` 禁止 Expo 自动加载 `.env`。仅保留空值说明文件 `.env.example`。
4. `npm ci --include=dev` 安装现有 lockfile，运行 SDK 依赖兼容检查、lint 和 typecheck。
5. `expo prebuild --platform ios --clean --no-install` 通过 CNG 生成原生工程，检查 Expo 的 `export:embed` bundling phase，再运行 Runner 自带的 CocoaPods。不会提交或手工修改 `ios/`。Prebuild 在临时 checkout 中可正常重写启动脚本，但任何依赖或 lockfile 改动都会让构建失败。
6. `xcodebuild` 构建 `Blink` workspace / scheme、`Release`、`iphoneos`、`generic/platform=iOS`，明确设置 `CODE_SIGNING_ALLOWED=NO`，不允许自动获取签名配置。
7. `scripts/verify-ios-app.py` 检查唯一的 `Blink.app`、Info.plist 中的 Bundle ID / 版本 / iPhoneOS 平台 / iPhone 支持、Mach-O arm64 架构及每个 slice 的 `IOS` 平台，同时要求非空 `main.jsbundle`、`Assets.car`、Expo 静态资源和图标字体。再次拒绝包内常见凭据或数据库文件。模拟器 arm64 包不能通过平台检查。
8. 仅把通过检查的 `.app` 放入 `Payload/Blink.app`，ZIP 为 `Blink-unsigned.ipa`。检查 ZIP 完整性并输出 SHA256。只上传该 IPA，artifact 名称为 `Blink-unsigned`，保留 7 天。任务最长 90 分钟，同分支新运行会取消旧运行。

## 首次启动与后续操作

当前只准备本地文件，没有 commit、push、远端 Actions 运行、Release 或 Tag。审阅后可自行执行以下命令；它们在本次准备中没有执行：

```powershell
git switch chore/ios-sideload
git diff --check
git add app.json .gitignore .github/workflows/build-ios-unsigned.yml scripts/verify-ios-app.py docs/ios-sideload.md
git commit -m "chore: prepare unsigned iPhone IPA workflow"
git push -u origin chore/ios-sideload
```

只有专用分支的 push 会自动构建（首次及后续 push）。没有 PR、tag 或默认分支 push 触发器；job 也限制到该构建分支。

保留 `workflow_dispatch`，但 GitHub 的手动入口依赖工作流位于默认分支。因此首次以专用分支 push 启动，不依赖 “Run workflow” 按钮。以后若需要稳定使用手动入口，可另行审阅后把工作流引入默认分支，再选择 `chore/ios-sideload` 运行；本次不修改 `main` 或默认分支设置。[GitHub 触发规则](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#workflow_dispatch)

在 Actions 中打开成功的运行，下载 `Blink-unsigned` artifact，解开 GitHub 外层 ZIP，获得内部 `Blink-unsigned.ipa`。将 **IPA 文件** 导入 Windows 的 Sideloadly，用本地 Apple ID 签名并安装；不把 Apple ID 或密钥配置到 GitHub Secrets。

## 已做的 Windows 检查

- lint、TypeScript typecheck：通过。
- `expo install --check`：通过，现有依赖符合 SDK 57 兼容清单，没有升级依赖。
- `expo config --type introspect`：插件解析成功；现有 Router、SecureStore、SQLite、Notifications、Font 插件齐全。
- actionlint 1.7.12：工作流语法通过；工具来自官方 release，下载后核对 SHA256。另以 Git Bash 检查每段 shell 的语法。验证工具仅在被忽略的 `tmp/`，不进入工作流或项目依赖。
- iOS production `expo export:embed`：通过，1,849 个模块、41 个静态资源，确认包含图标字体。输出仅留在被忽略的 `tmp/`，不会上传。此项是 JS/资源导出，并非 Xcode 编译或独立运行测试。

Windows 没有 Xcode/CocoaPods，且没有可用的 Python 解释器，因此尚未执行 macOS 的 CNG iOS 生成、pod install、Release 链接、Mach-O/plist 产物验证脚本、最终 IPA 打包及 Sideloadly 安装。**尚无实际生成的 IPA，也不能声称云端编译成功。** 如这些步骤失败，应先查看对应原始错误；不要为绕过错误随意修改业务代码或升级 Expo 主版本。

## 限制与真机验收

- SDK 57 要求 React Native 0.86、React 19.2.3 和 Node 至少 22.13.x；当前版本及 Node 22 配置符合要求。[SDK 57 参考](https://docs.expo.dev/versions/v57.0.0/)
- Runner 软件随镜像更新，工作流输出实际 Xcode / CocoaPods 版本。目前官方 `macos-26` 镜像清单的默认 Xcode 为 26.6，工作流接受 >=26.4；Pod 原生传递依赖也需首次云端安装验证。[Runner 软件清单](https://github.com/actions/runner-images/blob/main/images/macos/macos-26-Readme.md)
- 已检查的 `expo-notifications` 插件默认添加 `aps-environment=development`。未签名编译不需要 APNs 证书；免费账号重签时可能要由 Sideloadly 移除不支持的 entitlement。当前项目使用本地通知，不因此承诺免费账户可使用远程 APNs 推送。没有更改通知插件或算法。
- Sideloadly 官方说明支持免费 Apple ID，签名通常有效 7 天，需定期刷新；Windows 的 Apple 驱动和 iTunes/iCloud 安装要求以官方说明为准。安装成功仍取决于当前 iOS、设备和 Apple 签名策略。[Sideloadly](https://sideloadly.io/)
- 保持 Sideloadly 每次签名使用的最终 Bundle ID 一致；若它改写标识，记录最终值，避免重复安装或切换应用数据容器。签名到期与 artifact 的 7 天保留期相互独立。
- IPA 未签名，不能直接点开安装。验证首次启动和飞行模式重启（无 Metro）、图标/字体、SQLite 保存/重启、设备 SecureStore API Key、本地通知权限/锁屏投递/点击跳转，以及升级后数据保留。参照 `docs/NATIVE_NOTIFICATIONS.md` 和 `docs/IOS_TESTING.md` 的验收清单。
- 当前仓库已公开，未来上传的 IPA 按公开产物处理。工作流只打包 app，不上传源码目录、数据库、日志目录或 `.env`，但文件名检查不能代替对误写入源码的密钥审查。
- 不调用任何付费构建服务。GitHub 标准 Runner 在公开仓库的使用遵循当前免费规则；如果以后变更可见性或账户计费设置，应先重新确认额度。[GitHub Actions 计费说明](https://docs.github.com/en/billing/concepts/product-billing/github-actions)

原生项目遵循 [Expo CNG](https://docs.expo.dev/workflow/continuous-native-generation/)；此次不新增依赖或第三方 Action。
