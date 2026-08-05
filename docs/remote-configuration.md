# FreeKiosk 远程配置

FreeKiosk 可以从一个 HTTPS URL 下载 JSON，并把其中声明的设置同步到设备。当前实现使用显式白名单，支持 **130 个远程可写键**。

配套文件：

- [完整 130 项 JSON 模板](./remote-configuration-all-settings.json)
- [REST API 文档](./rest-api.md)
- [MQTT 文档](./MQTT.md)

> 完整模板主要用于查字段。直接部署会覆盖设备上的全部 130 项设置；生产环境通常应删除不需要集中管理的键，只保留期望由服务器控制的项目。省略某个键表示“保留设备当前值”，不是删除或恢复默认值。

## 1. 在设备上启用

1. 打开 **Settings → Advanced → Remote Configuration**。
2. 填写直接返回 JSON 的 HTTPS URL。
3. 如服务需要鉴权，填写 Bearer Token。Token 保存在 Android Keychain 中，不写入配置文件。
4. 设置检查间隔，允许范围为 1–1440 分钟，然后启用远程配置。
5. 点击 **Save Source**，再点击 **Check Now** 立即测试并应用。

默认只允许 HTTPS。HTTP 只能通过界面的不安全 HTTP 开关显式启用，并且只应在可信局域网临时使用。HTTP 会使配置内容和 Bearer Token 暴露给网络路径上的攻击者。

远程配置不会把设备设置成 Device Owner。使用锁任务、阻止恢复出厂、持久默认 Launcher 等 Device Owner 能力前，仍需先通过 ADB 或企业部署工具完成 Device Owner provisioning。

## 2. JSON 格式

最小示例：

```json
{
  "version": "1.0",
  "revision": "site-a-2026-08-05-001",
  "settings": {
    "@kiosk_url": "https://display.example.com",
    "@kiosk_auto_reload": "true",
    "@kiosk_display_mode": "webview"
  }
}
```

格式规则：

- `version` 必须是字符串 `"1.0"`，不能写成数值 `1.0`。
- `revision` 可省略，也可为非空字符串或有限数字。它只用于状态显示，不参与版本排序、防回滚或变更判断。
- `settings` 必须是对象，并且至少包含一个受支持键。
- **所有设置值都必须是字符串**。布尔写成 `"true"`，数字写成 `"60"`，数组写成 `"[\"https://a.example\"]"`。
- 键名、布尔值和严格枚举均区分大小写，不能添加首尾空格。
- 不支持 `null`、删除操作或“恢复默认值”指令。要停止管理某项，只能从服务器文件中删除该键；设备会继续保留最后一次写入值。
- JSON 不能包含注释或尾随逗号。重复键只会保留最后一个值。

远程配置使用与 FreeKiosk 备份兼容的 `version` + `settings` 信封格式。备份文件可以作为起点，但它不是远程配置全量字段清单；部分新设置尚未包含在备份导出中，应以本文件和完整模板为准。导出备份还可能含有密钥或密码，托管前必须删除；“客户端会忽略”不代表把秘密上传到服务器是安全的。

### 校验强度

| 类别 | 数量 | 远程层实际校验 |
|---|---:|---|
| 布尔 | 68 | 只能是精确字符串 `"true"` 或 `"false"` |
| 数字 | 25 | 字符串可被 JavaScript 解析为有限数字；不强制业务范围或整数 |
| JSON 数组 | 9 | 字符串解码后必须是数组；不校验数组元素字段 |
| 严格枚举 | 10 | 必须精确匹配表中列出的值 |
| 普通字符串 | 18 | 只校验外层值是字符串；表中的枚举/范围是应用建议值 |

任一受支持键的类型错误都会拒绝整份配置，不会部分写入。未知键和受保护键会被忽略；如果所有键都被忽略，整份配置仍会失败。

## 3. 全部可配置项（130 项）

下面的范围来自当前设置界面和运行代码。远程解析器对数字通常只检查“有限数字”，因此调用方仍必须遵守这里的单位和业务范围。

### 3.1 基础、启动与显示模式（16 项）

| 键 | 类型 / 建议值 | 作用 |
|---|---|---|
| `@kiosk_url` | URL 字符串 | WebView 起始页面。Dashboard 模式启用时由磁贴代替单一入口。 |
| `@kiosk_auto_reload` | 布尔 | 页面发生网络错误时自动重新加载。 |
| `@kiosk_enabled` | 布尔 | 启用 FreeKiosk 锁定模式；完整锁定通常需要 Device Owner。 |
| `@kiosk_auto_launch` | 布尔 | 请求开机启动 FreeKiosk；参见“原生副作用限制”。 |
| `@kiosk_screen_lock_compat` | 布尔 | 与 Android 原生 PIN/密码锁屏兼容，限 Device Owner 场景；无人值守设备慎用。 |
| `@kiosk_default_launcher` | 布尔 | 将 FreeKiosk 作为默认/持久 Home Launcher；参见“原生副作用限制”。 |
| `@kiosk_intercom_mode` | 布尔 | WebRTC 双向音频/对讲模式，网页使用麦克风时切换通信音频模式。 |
| `@kiosk_display_mode` | 严格枚举：`webview`、`external_app`、`media_player` | 主显示模式。Dashboard 不是枚举值，而是 `webview` 加 Dashboard 开关。 |
| `@kiosk_external_app_package` | Android 包名 | 单应用模式要启动的包，例如 `com.example.app`。 |
| `@kiosk_external_app_mode` | 严格枚举：`single`、`multi` | 外部应用单应用或多应用模式。 |
| `@kiosk_auto_relaunch_app` | 布尔 | 外部应用退出或崩溃后自动重新启动，需要使用情况访问权限。 |
| `@kiosk_external_app_test_mode` | 布尔 | 外部应用返回键测试模式；当前没有设置界面入口。 |
| `@kiosk_managed_apps` | JSON 数组字符串 | 多应用、开机启动、保活和辅助功能白名单的应用列表。 |
| `@kiosk_beta_updates_enabled` | 布尔 | 接收预发布/Beta 更新。 |
| `@kiosk_dashboard_mode_enabled` | 布尔 | 在 `webview` 模式中启用多 URL Dashboard。 |
| `@kiosk_dashboard_tiles` | JSON 数组字符串 | Dashboard 磁贴列表。 |

### 3.2 屏保、动作检测与基础亮度（17 项）

| 键 | 类型 / 建议值 | 作用 |
|---|---|---|
| `@screensaver_enabled` | 布尔 | 总屏保开关。 |
| `@screensaver_inactivity_enabled` | 布尔 | 允许无操作超时触发屏保。 |
| `@screensaver_inactivity_delay` | 数字字符串；毫秒，需大于 0 | 进入屏保前的无操作时长；界面以分钟输入，存储值是毫秒。 |
| `@screensaver_motion_enabled` | 布尔 | 屏保期间用摄像头检测动作并唤醒。 |
| `@screensaver_motion_sensitivity` | 严格枚举：`low`、`medium`、`high` | 新屏保架构的动作灵敏度。 |
| `@screensaver_motion_delay` | 数字字符串；毫秒 | 预留的新屏保动作延迟；当前运行时没有消费者，不建议主动管理。 |
| `@screensaver_brightness` | 数字字符串；0–1 | 屏保亮度，`0` 为黑屏，`0.1` 为 10%。 |
| `@screensaver_type` | 严格枚举：`dim`、`url`、`video` | 仅调暗、显示网页或播放视频/图片。 |
| `@screensaver_url` | URL 字符串 | `screensaver_type=url` 时显示的只读页面。 |
| `@screensaver_video_items` | JSON 数组字符串 | `screensaver_type=video` 时的媒体播放列表，结构同 MediaItem。 |
| `@screensaver_video_loop` | 布尔 | 屏保媒体列表播放完后循环。 |
| `@default_brightness` | 数字字符串；0–1 | 正常显示亮度。 |
| `@motion_camera_position` | 严格枚举：`front`、`back` | 动作检测所用摄像头。 |
| `@screensaver_delay` | 数字字符串；毫秒；遗留 | 旧屏保延迟键，当前主屏保逻辑不使用。 |
| `@motion_detection_enabled` | 布尔；遗留 | 旧动作检测开关，当前应使用 `@screensaver_motion_enabled`。 |
| `@motion_sensitivity` | 字符串；建议 `low`、`medium`、`high`；遗留 | 旧动作灵敏度，远程层不做枚举校验。 |
| `@motion_delay` | 数字字符串；毫秒；遗留 | 旧动作延迟，当前主屏保逻辑不使用。 |

### 3.3 状态栏、返回方式、输入与触摸阻挡（26 项）

| 键 | 类型 / 建议值 | 作用 |
|---|---|---|
| `@kiosk_overlay_button_visible` | 布尔 | 是否显示返回设置的角落按钮/提示；隐藏时触摸区仍可生效。 |
| `@kiosk_overlay_button_position` | 字符串；遗留 | 旧按钮位置键，当前运行时主要使用 `@kiosk_return_button_position`，不建议新配置使用。 |
| `@kiosk_pin_max_attempts` | 数字字符串；1–100 | 错误 PIN/密码达到次数后锁定 15 分钟。 |
| `@kiosk_status_bar_enabled` | 布尔 | 显示 FreeKiosk 自定义状态栏。 |
| `@kiosk_status_bar_on_overlay` | 布尔 | 外部应用上方的覆盖层是否显示自定义状态栏。 |
| `@kiosk_status_bar_on_return` | 布尔 | 外部应用返回页面是否显示自定义状态栏。 |
| `@kiosk_status_bar_show_battery` | 布尔 | 自定义状态栏显示电池。 |
| `@kiosk_status_bar_show_wifi` | 布尔 | 自定义状态栏显示 Wi-Fi。 |
| `@kiosk_status_bar_show_bluetooth` | 布尔 | 自定义状态栏显示蓝牙。 |
| `@kiosk_status_bar_show_volume` | 布尔 | 自定义状态栏显示音量。 |
| `@kiosk_status_bar_show_time` | 布尔 | 自定义状态栏显示时间。 |
| `@kiosk_status_bar_theme` | 严格枚举：`dark`、`light` | 自定义状态栏主题。 |
| `@kiosk_back_button_mode` | 字符串；建议 `test`、`immediate`、`timer` | 外部应用按 Back 后允许正常返回、立即重启应用或延迟重启。 |
| `@kiosk_back_button_timer_delay` | 数字字符串；秒，1–3600 | `back_button_mode=timer` 的延迟。 |
| `@kiosk_keyboard_mode` | 字符串；建议 `default`、`force_numeric`、`smart` | WebView 键盘策略。 |
| `@kiosk_pin_mode` | 严格枚举：`numeric`、`alphanumeric` | PIN 输入模式；PIN 本身不可远程下发，修改此项前见限制说明。 |
| `@kiosk_return_tap_count` | 数字字符串；2–20 | 返回设置需要连续点击的次数。 |
| `@kiosk_return_tap_timeout` | 数字字符串；毫秒，500–5000 | 完成连续点击的时间窗口。 |
| `@kiosk_return_mode` | 字符串；建议 `tap_anywhere`、`button` | 点击屏幕任意位置或固定角落按钮返回设置。 |
| `@kiosk_return_button_position` | 字符串；`top-left`、`top-right`、`bottom-left`、`bottom-right` | 固定返回按钮的位置。 |
| `@kiosk_volume_up_5tap_enabled` | 布尔 | 允许多次按音量键作为返回设置的替代方式。 |
| `@kiosk_blocking_overlays_enabled` | 布尔 | 启用指定屏幕区域的触摸阻挡。 |
| `@kiosk_blocking_overlays_regions` | JSON 数组字符串；最多 10 个 | 触摸阻挡区域。 |
| `@kiosk_webview_back_button_enabled` | 布尔 | 在 WebView 上显示返回按钮。 |
| `@kiosk_webview_back_button_x_percent` | 数字字符串；0–100 | WebView 返回按钮的横向百分比位置。 |
| `@kiosk_webview_back_button_y_percent` | 数字字符串；0–100 | WebView 返回按钮的纵向百分比位置。 |

### 3.4 自动亮度与屏幕调度（12 项）

| 键 | 类型 / 建议值 | 作用 |
|---|---|---|
| `@kiosk_auto_brightness_enabled` | 布尔 | 根据环境光传感器自动调整亮度。 |
| `@kiosk_auto_brightness_min` | 数字字符串；0–1 | 自动亮度下限。 |
| `@kiosk_auto_brightness_max` | 数字字符串；0–1，且不小于下限 | 自动亮度上限。 |
| `@kiosk_auto_brightness_offset` | 数字字符串；界面范围 0–0.5 | 在自动计算结果上增加的亮度偏移。 |
| `@kiosk_auto_brightness_update_interval` | 数字字符串；毫秒，建议正数 | 环境光采样/亮度更新间隔。 |
| `@kiosk_auto_brightness_saved_manual` | 数字字符串；0–1；内部状态 | 开启自动亮度前保存的手动亮度；通常不应由服务器管理。 |
| `@brightness_management_enabled` | 布尔 | 是否由 FreeKiosk 管理亮度；关闭后可交给系统或 Tasker。 |
| `@kiosk_screen_scheduler_enabled` | 布尔 | 启用按星期和时间关闭/唤醒屏幕。 |
| `@kiosk_screen_scheduler_rules` | JSON 数组字符串 | 屏幕休眠计划规则。 |
| `@kiosk_screen_scheduler_wake_on_touch` | 布尔 | 计划休眠期间是否允许触摸临时唤醒。 |
| `@kiosk_keep_screen_on` | 布尔 | 使用 Android `FLAG_KEEP_SCREEN_ON` 保持屏幕常亮。 |
| `@kiosk_auto_wake_on_screen_off` | 布尔 | 屏幕被电源键或系统关闭后自动重新点亮。 |

### 3.5 URL 自动化、WebView 与打印（22 项）

| 键 | 类型 / 建议值 | 作用 |
|---|---|---|
| `@kiosk_url_rotation_enabled` | 布尔 | 自动轮播多个 URL；Dashboard 模式下停用。 |
| `@kiosk_url_rotation_list` | JSON 字符串数组 | URL 轮播列表，实际使用建议至少 2 项。 |
| `@kiosk_url_rotation_interval` | 数字字符串；秒，最小 5 | URL 切换间隔。 |
| `@kiosk_url_planner_enabled` | 布尔 | 按计划显示指定 URL；计划优先于轮播。 |
| `@kiosk_url_planner_events` | JSON 数组字符串 | 周期或一次性 URL 事件。 |
| `@kiosk_inactivity_return_enabled` | 布尔 | 无操作后返回 WebView 起始页面。 |
| `@kiosk_inactivity_return_delay` | 数字字符串；秒，5–3600 | 返回起始页前的无操作时长。 |
| `@kiosk_inactivity_return_reset_on_nav` | 布尔 | WebView 页面加载时重置无操作计时器。 |
| `@kiosk_inactivity_return_clear_cache` | 布尔 | 返回起始页时清理 WebView 缓存并完整加载。 |
| `@kiosk_inactivity_return_scroll_top` | 布尔 | 已在起始页时滚动到顶部。 |
| `@kiosk_url_filter_enabled` | 布尔 | 启用 URL 黑/白名单过滤。 |
| `@kiosk_url_filter_mode` | 严格枚举：`blacklist`、`whitelist` | 黑名单阻止匹配项；白名单只允许匹配项。主 Kiosk URL 始终允许。 |
| `@kiosk_url_filter_list` | JSON 字符串数组 | URL 通配符模式，`*` 匹配任意字符。 |
| `@kiosk_url_filter_show_feedback` | 布尔 | URL 被阻止时显示提示。 |
| `@kiosk_pdf_viewer_enabled` | 布尔 | 在内置查看器中打开 PDF，而不是下载。 |
| `@kiosk_print_enabled` | 布尔 | 允许网页通过 `window.print()` 打开 Android 打印。 |
| `@kiosk_print_paper_size` | 字符串；`A4`、`A5`、`A3`、`LETTER`、`LEGAL` | 默认打印纸型；远程层不强制枚举。 |
| `@kiosk_webview_zoom_level` | 数字字符串；百分比，50–200，界面步长 5 | 管理员设置的网页缩放。 |
| `@kiosk_webview_zoom_mode` | 严格枚举：`standard`、`fit` | 缩放整个文档，或使用适合 Home Assistant 的 body 缩放。 |
| `@kiosk_disable_user_zoom` | 布尔 | 禁止用户双指/双击缩放，管理员缩放仍生效。 |
| `@kiosk_custom_user_agent` | 字符串；空字符串为默认 UA | WebView 自定义 User-Agent。非法 HTTP 头字符可能被回退为默认 UA。 |
| `@kiosk_pause_web_media_when_hidden` | 布尔 | 屏保、息屏或退到后台时暂停网页音视频。 |

### 3.6 REST API、Device Owner 策略与 MQTT（18 项）

| 键 | 类型 / 建议值 | 作用 |
|---|---|---|
| `@kiosk_rest_api_enabled` | 布尔 | 启用设备内置 REST API 服务。 |
| `@kiosk_rest_api_port` | 数字字符串；1024–65535 | REST API 监听端口。 |
| `@kiosk_rest_api_allow_control` | 布尔 | 允许 POST 控制命令；关闭后只读。 |
| `@kiosk_allow_power_button` | 布尔 | 锁定模式下允许长按电源键菜单；`false` 表示阻止电源菜单，需要 Device Owner。 |
| `@kiosk_block_factory_reset` | 布尔 | 从系统设置中移除恢复出厂入口，需要 Device Owner。 |
| `@kiosk_allow_notifications` | 布尔 | 锁任务模式允许通知分发，例如外部应用读取 NFC；可能暴露通知面板。 |
| `@kiosk_allow_system_info` | 布尔 | 锁任务模式允许原生 Android 系统信息栏；与自定义状态栏不是同一设置。 |
| `@kiosk_mqtt_enabled` | 布尔 | 启用 MQTT/Home Assistant 集成。 |
| `@kiosk_mqtt_broker_url` | 主机名或 IP 字符串 | MQTT Broker 地址，例如 `192.168.1.10`。 |
| `@kiosk_mqtt_port` | 数字字符串；1–65535 | MQTT 端口，常用明文端口为 1883。 |
| `@kiosk_mqtt_username` | 字符串 | MQTT 用户名；密码不可远程下发。 |
| `@kiosk_mqtt_client_id` | 字符串；可为空 | MQTT Client ID，空值由客户端生成。 |
| `@kiosk_mqtt_base_topic` | 字符串 | 本设备 MQTT 基础主题，例如 `freekiosk`。 |
| `@kiosk_mqtt_discovery_prefix` | 字符串 | Home Assistant MQTT Discovery 前缀，通常为 `homeassistant`。 |
| `@kiosk_mqtt_status_interval` | 数字字符串；秒，5–3600 | 状态发布间隔。 |
| `@kiosk_mqtt_allow_control` | 布尔 | 允许通过 MQTT 执行亮度、刷新等控制命令。 |
| `@kiosk_mqtt_device_name` | 字符串；可为空 | MQTT 主题和 Home Assistant 中的友好设备名。 |
| `@kiosk_mqtt_motion_always_on` | 布尔 | 持续运行摄像头动作检测，会增加耗电。 |

远程打开 REST API 或 MQTT 不会设置 REST API Key 或 MQTT Password。需要认证时，必须先在每台设备本地安全配置凭据。

### 3.7 媒体播放器（11 项）

| 键 | 类型 / 建议值 | 作用 |
|---|---|---|
| `@kiosk_media_player_items` | JSON 数组字符串 | 视频/图片播放列表。 |
| `@kiosk_media_player_autoplay` | 布尔 | 页面加载后自动播放。 |
| `@kiosk_media_player_loop` | 布尔 | 播放列表循环。 |
| `@kiosk_media_player_shuffle` | 布尔 | 随机播放顺序。 |
| `@kiosk_media_player_image_duration` | 数字字符串；秒，1–3600 | 图片未单独指定时的显示时长。 |
| `@kiosk_media_player_show_controls` | 布尔 | 显示播放、暂停、上一项和下一项控制。 |
| `@kiosk_media_player_fit_mode` | 严格枚举：`contain`、`cover`、`fill` | 完整适配、裁剪填满或拉伸填满。 |
| `@kiosk_media_player_bg_color` | 颜色字符串；建议 `#RRGGBB` | 媒体未覆盖区域的背景色。 |
| `@kiosk_media_player_transition` | 布尔 | 媒体项之间使用淡入淡出。 |
| `@kiosk_media_player_transition_duration` | 数字字符串；毫秒，0–3000 | 淡入淡出时长。 |
| `@kiosk_media_player_mute` | 布尔 | 视频静音。 |

### 3.8 PIN 页锁屏快捷控制（8 项）

| 键 | 类型 | 作用 |
|---|---|---|
| `@kiosk_lockscreen_controls_enabled` | 布尔 | PIN 页面快捷控制总开关。 |
| `@kiosk_lockscreen_wifi_enabled` | 布尔 | 显示 Wi-Fi 开关/连接入口。 |
| `@kiosk_lockscreen_bluetooth_enabled` | 布尔 | 显示蓝牙开关/配对入口。 |
| `@kiosk_lockscreen_emergency_call_enabled` | 布尔 | 显示紧急呼叫入口。 |
| `@kiosk_lockscreen_audio_enabled` | 布尔 | 显示静音和音频输出控制。 |
| `@kiosk_lockscreen_flashlight_enabled` | 布尔 | 显示手电筒开关。 |
| `@kiosk_lockscreen_brightness_enabled` | 布尔 | 显示亮度控制。 |
| `@kiosk_lockscreen_rotation_lock_enabled` | 布尔 | 显示旋转锁定；设备必须允许应用修改系统旋转。 |

## 4. 数组字段结构

数组在 `settings` 中必须进行二次 JSON 编码。下面示例都是可直接放入 `settings` 对象的“外层字符串值”。远程层只确认解码结果是数组，不校验对象字段、包名、时间、坐标或数量；错误结构可能写入成功，却在运行时被忽略或产生异常。

### URL 字符串数组

用于 `@kiosk_url_rotation_list`：

```json
"@kiosk_url_rotation_list": "[\"https://example.com/a\",\"https://example.com/b\"]"
```

用于 `@kiosk_url_filter_list`：

```json
"@kiosk_url_filter_list": "[\"*facebook.com*\",\"*/admin/*\"]"
```

### MediaItem 数组

用于 `@screensaver_video_items` 和 `@kiosk_media_player_items`：

```json
"@kiosk_media_player_items": "[{\"id\":\"welcome\",\"url\":\"https://cdn.example.com/welcome.mp4\",\"type\":\"video\",\"title\":\"Welcome\"},{\"id\":\"poster\",\"url\":\"https://cdn.example.com/poster.jpg\",\"type\":\"image\",\"duration\":15}]"
```

字段：`id`、`url`、`type`（`video` 或 `image`）必需；`title`、图片 `duration`（秒）、`isLocal`、`fileName` 可选。远程配置通常应使用 HTTPS URL，不应引用只存在于另一台设备上的 `file://` 路径。

### URL Planner 事件数组

```json
"@kiosk_url_planner_events": "[{\"id\":\"lunch\",\"type\":\"recurring\",\"url\":\"https://example.com/lunch\",\"name\":\"Lunch\",\"enabled\":true,\"priority\":3,\"days\":[1,2,3,4,5],\"startTime\":\"11:30\",\"endTime\":\"14:00\"},{\"id\":\"special\",\"type\":\"oneTime\",\"url\":\"https://example.com/special\",\"name\":\"Special\",\"enabled\":true,\"priority\":1,\"startDate\":\"2030-01-01\",\"endDate\":\"2030-01-01\",\"allDay\":true}]"
```

- `type=recurring`：使用 `days`（0=周日，1=周一，…，6=周六）、`startTime`、`endTime`。
- `type=oneTime`：使用 `startDate`、`endDate`（`YYYY-MM-DD`）；`allDay=false` 时再提供起止时间。
- `priority` 为 1–5，1 最高；一次性事件在相同优先级下优先。

### 触摸阻挡区域数组

```json
"@kiosk_blocking_overlays_regions": "[{\"id\":\"top-bar\",\"name\":\"Top bar\",\"enabled\":true,\"xStart\":0,\"yStart\":0,\"xEnd\":100,\"yEnd\":10,\"displayMode\":\"transparent\",\"targetPackage\":null}]"
```

坐标是 0–100 的屏幕百分比，且 start 必须小于 end；最多 10 个区域。`displayMode` 为 `transparent`、`semi_transparent` 或 `opaque`。`targetPackage=null` 表示所有模式生效，否则只针对指定 Android 包名。

### 屏幕休眠计划数组

```json
"@kiosk_screen_scheduler_rules": "[{\"id\":\"night\",\"name\":\"Weekday night\",\"enabled\":true,\"days\":[1,2,3,4,5],\"sleepTime\":\"22:00\",\"wakeTime\":\"07:00\"}]"
```

时间格式为 24 小时制 `HH:MM`。跨午夜规则受支持，`days` 表示开始休眠的星期。

### ManagedApp 数组

```json
"@kiosk_managed_apps": "[{\"packageName\":\"com.example.app\",\"displayName\":\"Example App\",\"showOnHomeScreen\":true,\"launchOnBoot\":false,\"keepAlive\":false,\"allowAccessibility\":false}]"
```

`packageName` 必须是已安装应用的有效 Android 包名。`allowAccessibility` 涉及 Device Owner 白名单，远程写入后仍需设备端触发策略刷新。

### DashboardTile 数组

```json
"@kiosk_dashboard_tiles": "[{\"id\":\"home\",\"label\":\"Home\",\"url\":\"https://example.com\",\"iconMode\":\"letter\",\"iconValue\":\"H\",\"order\":0}]"
```

`iconMode` 为 `favicon`、`image` 或 `letter`；`iconValue` 在图片/字母模式中使用，`order` 控制排序。

## 5. 不能远程配置的项目

以下键受保护，即使放入文件也会被忽略：

- `@kiosk_pin`
- `@kiosk_pin_secure_fallback`
- `@kiosk_pin_attempts`
- `@kiosk_pin_lockout`
- `@kiosk_rest_api_key`
- `@kiosk_mqtt_password`
- `@kiosk_basic_auth_password`
- `@kiosk_http_basic_auth_username`
- `@kiosk_remote_config_preferences`
- `@kiosk_remote_config_state`

远程配置 Bearer Token 同样只能在设备 UI 中保存到 Keychain，不能由 JSON 下发。未知存储键也会被忽略；新加入应用的设置默认不可远程写入，必须经过审查并显式加入白名单。

`@kiosk_pin_mode` 虽然可远程写入，但 PIN 本身受保护。远程切换 numeric/alphanumeric 可能与设备现有 PIN 不匹配，造成无法正常输入；应先在测试设备验证，并在本机确认 PIN。

## 6. 应用时机与网络行为

- 请求发送 `Accept: application/json`；配置 Token 时发送 `Authorization: Bearer <token>`。
- Token 与源 URL 的 origin 绑定。把源改到不同 origin 时不会自动携带旧 Token。
- 连接和读取超时均为 8 秒，响应上限为 1 MiB，`settings` 最多 512 项，未知键也计入上限。
- 最多跟随 5 次同源重定向。跨源重定向和 HTTPS 降级到 HTTP 会在向新地址发送凭据前被拒绝。
- 自动检查缓存服务器 `ETag`，后续发送 `If-None-Match`；服务器可返回 `304 Not Modified`。
- **Check Now** 会绕过 ETag，并且即使总开关暂时关闭也能执行。它会比较 JSON 中每个受管键并恢复本地漂移。
- 若自动检查收到 304，不会读取并比较本地值；发现设备被本地修改时，使用 Check Now 恢复。
- 检查发生在 Kiosk 页面启动/聚焦、应用回到前台，以及 JavaScript 活跃期间达到配置间隔时。当前没有 WorkManager 保证后台执行；应用被系统挂起后，要等回到前台再检查。
- 成功同步后 Kiosk 页面重新读取设置。写入设置和同步状态使用一个批次；失败时会尽力回滚旧值。
- REST API 或 MQTT 连接配置发生变化时，只串行重启受影响的原生服务，避免启动流程与远程同步竞态并确保新端口、Broker、主题和权限立即生效。
- `revision` 只显示在状态面板。实际内容变化根据允许键和值计算，不按 revision 大小决定。

### HTTPS 证书

远程配置由 Android 原生网络代码下载，使用设备系统/用户信任库。WebView 中“接受自签名证书”的设置不适用于该下载器。自签名服务需要把签发 CA 安装为设备受信任证书，并确保服务器证书 SAN 与 URL 使用的主机名或 IP 匹配。

## 7. 当前原生副作用限制

远程同步的核心动作是写入 AsyncStorage，然后让 Kiosk 页面重新读取。少数设置在本机 UI 切换时还会额外调用 Android 原生策略；当前远程同步不会执行这些额外调用：

- `@kiosk_auto_launch`：不会同步启用/停用 Android BootReceiver 组件。
- `@kiosk_screen_lock_compat`：不会同步到设备加密的原生启动存储。
- `@kiosk_default_launcher`：不会应用或清除 Device Owner persistent Home 策略。
- `@kiosk_managed_apps` 中的 `allowAccessibility`：不会立即刷新 Device Owner 辅助功能白名单。

这些值虽然在远程白名单中，但不能仅凭一次远程写入承诺完整生效。变更后应在设备端打开设置并确认/切换一次相应选项，或由企业设备管理流程直接执行原生策略；批量部署前先在单台 Device Owner 设备测试。

## 8. 服务端建议

- 使用真实 HTTPS、正确证书链和稳定的直接 JSON 地址。
- 返回 `Content-Type: application/json; charset=utf-8` 和稳定的 `ETag`。
- 使用不可猜测的 Bearer Token，并避免把 Token 放进 URL、日志或 JSON。
- 先发布仅包含 1–2 个低风险键的配置并用 Check Now 验证，再逐步扩大范围。
- 修改 Device Owner、锁定模式、默认 Launcher、返回手势或网络访问策略前，保留现场恢复路径。
- 对 JSON 做版本控制和审阅；`revision` 可写提交号或发布时间，但它本身不提供防回滚能力。
