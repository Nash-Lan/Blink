# 原生本地通知设计

状态：Phase 3 已实现，自动化测试通过；尚未在 iPhone 真机验证。目标版本基于 Expo SDK 57 与 `expo-notifications ~57.0.23`。

## 数据来源与边界

`Deadline.reminderAt` 继续作为唯一提醒时间来源。`dueAt` 用于截止时间和提醒指纹，`completedAt` 决定提醒是否有效。不得增加另一份可编辑的通知时间。

系统通知标识属于设备状态，不属于用户备份数据。实现使用现有 `blink.db` 的独立 snapshot key 保存轻量映射：

```text
deadlineId -> notificationId + reminderKey
```

`reminderKey` 复用应用内提醒的稳定指纹（deadline ID、`dueAt`、`reminderAt`），只用于判断映射是否过期。映射表不保存另一份可用于调度的时间，恢复备份时也不导入其他设备的 notification ID。

Expo SDK 57 的 `scheduleNotificationAsync` 返回可供取消的字符串 ID；`cancelScheduledNotificationAsync` 取消单个计划，`getAllScheduledNotificationsAsync` 可用于核对系统队列。[Expo Notifications（SDK 57）](https://docs.expo.dev/versions/v57.0.0/sdk/notifications/)

实现位于 `src/notifications/`。原生与 Web 适配器分离，Web 适配器不会导入或执行 `expo-notifications`。

## 调度规则

统一入口 `NativeNotificationCoordinator.reconcileAll()` 每次都读取最新计划、设备映射和系统待触发列表：

1. 截止事项不存在、已完成、`reminderAt` 为空或时间不在未来：取消已有系统通知并删除映射。
2. 当前映射的 `reminderKey` 与最新事项、通知标题一致：保持现状，避免重复调度；标题变化时替换旧通知以避免展示过期文案。
3. 指纹变化：先取消旧 ID，再按最新 `reminderAt` 调度一次性日期通知，并保存返回的 notification ID 与新指纹。
4. 调度内容携带 `deadlineId` 和 `reminderKey`，点击通知时再读取当前事项；旧内容不能直接覆盖当前状态。

具体触发点：

- 创建提醒：业务快照写入成功后 reconcile。
- 编辑日期、截止时间或提醒时间：写入成功后取消旧通知并 reconcile 最新值。
- 取消提醒、完成或删除事项：写入成功后取消并清除映射。
- Undo 完成：只有事项仍存在、`reminderAt` 在未来且权限允许时才重新调度；过去的提醒不补发系统通知。
- 普通标题或备注编辑：指纹未变时不重新调度，可按需更新通知文案；若更新文案，仍走同一个串行 reconcile。

## 权限处理

先调用 `getPermissionsAsync`。实现检查 iOS 的 `ios.status`，接受 `AUTHORIZED`、`PROVISIONAL` 和 `EPHEMERAL`；只有用户在 Settings 中明确打开 System notifications 开关且状态为 `NOT_DETERMINED` 时才调用 `requestPermissionsAsync`。Expo 文档说明 iOS 权限状态比根级 `status` 更细。[Expo Notifications permissions](https://docs.expo.dev/versions/v57.0.0/sdk/notifications/#permissions)

权限被拒绝或 `canAskAgain` 为 false 时：

- 仍保存 `reminderAt`，应用内 Banner 继续工作。
- 不把调度失败写成“已调度”，不创建映射。
- UI 显示简短状态并提供前往系统设置的操作；不在每次编辑时重复弹权限请求。
- 权限以后恢复时，在应用回到前台后运行一次全量 reconcile。

## 前台与后台体验

应用在前台时，由现有 Reminder Banner 负责呈现。全局 `setNotificationHandler` 在前台对 Blink 自己的截止提醒返回不显示 banner/list、不播放声音，避免同一时刻出现系统通知和应用 Banner；后台或应用终止时由系统投递本地通知。通知点击后通过 Expo Router 打开 Deadlines，并在事项仍存在时打开对应编辑面板。

应用内 Reminder History 与系统通知映射各自解决不同问题：History 防止 Banner 重复展示，映射负责系统计划的取消和替换。调度成功不会写入 History。用户点击系统通知时，Blink 才将匹配且已经到期的提醒写入 History，避免导航后重复出现 Banner；此操作不会更改 `reminderAt`。

## 备份恢复与启动协调

恢复备份必须先成功写入业务快照，再执行通知协调：

1. 暂停新的调度请求。
2. 读取 `getAllScheduledNotificationsAsync`，只识别 content data 中带 Blink 命名空间的通知。
3. 取消所有 Blink 管理且与恢复后数据不一致的通知；不要调用 `cancelAllScheduledNotificationsAsync`，避免影响同一应用中未来的其他通知类型。
4. 清理本机映射表，并为恢复后所有未完成、未来 `reminderAt` 的事项逐一 reconcile。
5. Reminder History 随备份恢复，已展示的应用内提醒不会因为恢复而重复弹出；系统通知是否需要存在只由恢复后的当前事项决定。

冷启动也执行轻量核对：映射表、系统已计划通知与业务快照三方不一致时，以业务快照为准修复。

## 竞态与失败恢复

所有调度和取消操作使用全局串行队列；备份恢复与普通修改共用该队列。每个操作捕获开始时的 generation 和 `reminderKey`：

1. 调度完成后重新读取最新事项。
2. 如果最新指纹已变化，立即取消刚返回的 notification ID，且不写入映射。
3. 只有指纹仍一致时才持久化映射。
4. 取消失败保留映射并标记待协调；不能假定系统通知已经消失。
5. 映射写入失败时取消刚创建的通知，避免产生无法追踪的计划。
6. 启动、回到前台、权限变化和备份恢复后均可重跑幂等 reconcile，修复中断操作。

业务数据写入失败时不得调度或取消通知，因为用户可见状态没有成功提交。通知调度失败也不得回滚已经保存的截止事项；应用内 Banner 仍可工作，UI 显示原生通知未启用或需要重试。

## 自动化覆盖

- 新建、编辑、完成、删除、关闭提醒和 Undo。
- 重复 reconcile、并发编辑、过期异步调度结果。
- 权限拒绝、临时授权、仅显式启用时请求权限。
- 调度失败、映射写入失败及后续重试。
- 映射丢失后从系统通知 metadata 恢复。
- 备份恢复后的全量协调。
- 冷启动点击、已删除事项回退、重复点击抑制。
- Web 适配器不加载原生通知模块。

## 真机验证矩阵

- 固定时钟单元测试：创建、编辑、完成、Undo、删除、过去时间、权限拒绝。
- 适配器测试：schedule 返回 ID、取消失败、调度后指纹变更、映射写入失败、并发编辑串行化。
- 恢复测试：旧备份无映射、跨设备备份、系统残留通知、Reminder History 已存在。
- iPhone 真机：授权/拒绝、前台去重、后台与终止投递、重启、时区和系统时间变化、Focus 模式。

真机验证完成前，只能报告适配器、Coordinator 和 Mock 测试结果，不能声称 iOS 原生通知已经验证或实际展示。
