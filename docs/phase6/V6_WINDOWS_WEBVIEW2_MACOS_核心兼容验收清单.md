# V6 · Windows WebView2 + macOS 核心兼容验收清单

> 对齐文档：`prd/TimeLens_产品迭代规范.md`、`docs/phase5/V5_WINDOWS_PERF.md`
> 范围：第 6 期仅覆盖核心兼容，不包含新增性能专项与发布流程重构。

---

## 1. Given / When / Then（P0）

- `V6-P0-01`
  - Given：Windows x64（兼容 x86 环境）已安装 WebView2 Runtime
  - When：打开 TimeLens 并进入会话/时间线页面
  - Then：截图 `<img>` 正常显示，无 `timelens://` 子资源白屏
- `V6-P0-02`
  - Given：macOS 12+ 环境可运行应用
  - When：打开同一页面并切换会话
  - Then：截图预览正常，核心交互无阻断
- `V6-P0-03`
  - Given：任一平台权限未授权
  - When：在设置/健康页点击系统设置按钮
  - Then：能跳转对应系统设置入口（Windows 与 macOS 文案/URI 各自正确）
- `V6-P0-04`
  - Given：应用在后台托盘常驻
  - When：关闭主窗口后从托盘重新打开
  - Then：窗口可恢复、状态事件持续更新
- `V6-P0-05`
  - Given：日常采集已开启
  - When：观察 `tracking_state_changed`、`permissions_required`、`writer_stats_updated`
  - Then：事件契约保持不变，前端状态刷新正常

---

## 2. 手动回归步骤

### 2.1 Windows（WebView2）

1. 进入 `/lens`、`/timeline`、`/sessions`，检查缩略图与灯箱图片。
2. 在设置页点击：
   - 轻松使用设置
   - 隐私设置
   - 通知权限设置
3. 关闭主窗口，使用托盘菜单重新打开。
4. 检查控制台无截图协议相关报错（尤其是图片加载失败）。

### 2.2 macOS（WebKit）

1. 进入 `/lens`、`/timeline`、`/sessions`，检查截图和会话切换。
2. 在设置页点击：
   - 辅助功能设置
   - 屏幕录制设置
   - 通知权限设置
3. 关闭窗口并从托盘恢复，确认可继续采集与展示。

---

## 3. 配置分层检查

- `tauri.conf.json`：仅保留平台公共窗口配置。
- `tauri.windows.conf.json`：承载 WebView2 参数（`additionalBrowserArgs`）。
- `tauri.macos.conf.json`：保留 macOS 独立 overlay 入口（当前无行为改动，供后续单独调参）。

---

## 4. 验收记录模板

```md
### [日期 / 提交]
- 平台：Windows x64 / macOS
- WebView2 Runtime（Windows 必填）：
- 验收项：V6-P0-01 ~ V6-P0-05
- 结果：通过 / 不通过
- 备注（机型、驱动、复现步骤）：
```
