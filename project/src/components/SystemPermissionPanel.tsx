import { useCallback, useEffect, useMemo, useState } from "react";
import type { PermissionStatus } from "../types";
import * as api from "../services/tauri";
import {
  detectClientDesktopOs,
  MACOS_APP_BUNDLE_ID,
  permissionBadgeShortLabels,
  permissionSettingsButtonLabels,
} from "../lib/platform";

type Variant = "badges" | "actions" | "both";

type SystemPermissionPanelProps = {
  variant?: Variant;
  className?: string;
  /** 若传入则由外部刷新，不再内部拉取 */
  permissions?: PermissionStatus | null;
  onPermissionsChange?: (p: PermissionStatus) => void;
  /** macOS 重装/TCC 排障长文案；会话页等场景可关 */
  showMacosPermissionHelp?: boolean;
};

/**
 * 系统权限：角标 + 刷新 + 打开各平台对应的系统设置（与 Rust `open_*_settings` 对齐）。
 */
export function SystemPermissionPanel({
  variant = "both",
  className = "",
  permissions: controlled,
  onPermissionsChange,
  showMacosPermissionHelp = true,
}: SystemPermissionPanelProps) {
  const [local, setLocal] = useState<PermissionStatus | null>(null);
  const clientOs = useMemo(() => detectClientDesktopOs(), []);
  const badges = useMemo(
    () => permissionBadgeShortLabels(clientOs),
    [clientOs],
  );
  const settingsBtns = useMemo(
    () => permissionSettingsButtonLabels(clientOs),
    [clientOs],
  );

  const permissions = controlled !== undefined ? controlled : local;
  const setPerms = onPermissionsChange ?? setLocal;

  const refresh = useCallback(async () => {
    const p = await api.checkPermissions();
    setPerms(p);
  }, [setPerms]);

  useEffect(() => {
    if (controlled !== undefined) return;
    void refresh().catch(() => {});
  }, [controlled, refresh]);

  const showBadges = variant === "badges" || variant === "both";
  const showActions = variant === "actions" || variant === "both";

  return (
    <div className={className}>
      {showBadges && permissions && (
        <div
          className={`flex flex-wrap gap-2 text-xs${showActions ? " mb-3" : ""}`}
        >
          <span
            className={`rounded px-2 py-0.5 ${
              permissions.accessibilityGranted
                ? "bg-[var(--tl-perm-ok-bg)] text-[var(--tl-perm-ok-text)]"
                : "bg-[var(--tl-perm-bad-bg)] text-[var(--tl-perm-bad-text)]"
            }`}
          >
            {badges.accessibility}
          </span>
          <span
            className={`rounded px-2 py-0.5 ${
              permissions.screenRecordingGranted
                ? "bg-[var(--tl-perm-ok-bg)] text-[var(--tl-perm-ok-text)]"
                : "bg-[var(--tl-perm-bad-bg)] text-[var(--tl-perm-bad-text)]"
            }`}
          >
            {badges.screen}
          </span>
          <span
            className={`rounded px-2 py-0.5 ${
              permissions.notificationListenerGranted
                ? "bg-[var(--tl-perm-ok-bg)] text-[var(--tl-perm-ok-text)]"
                : "bg-[var(--tl-perm-bad-bg)] text-[var(--tl-perm-bad-text)]"
            }`}
          >
            {badges.notifications}
          </span>
        </div>
      )}
      {showActions && (
        <div className="flex flex-wrap gap-2 text-sm">
          <button
            type="button"
            className="rounded border border-[var(--tl-line)] px-3 py-1.5 text-[var(--tl-ink)] hover:bg-[var(--tl-surface-deep)]"
            onClick={() => void refresh()}
          >
            刷新系统权限
          </button>
          {permissions && !permissions.accessibilityGranted && (
            <button
              type="button"
              className="rounded border border-[var(--tl-perm-action-border)] bg-[var(--tl-error-bg)]/50 px-3 py-1.5 text-[var(--tl-perm-action-text)]"
              onClick={() => void api.openAccessibilitySettings()}
            >
              {settingsBtns.accessibility}
            </button>
          )}
          {permissions && !permissions.screenRecordingGranted && (
            <>
              {clientOs === "macos" && (
                <button
                  type="button"
                  className="rounded border border-[var(--tl-perm-action-border)] bg-[var(--tl-accent)]/15 px-3 py-1.5 font-medium text-[var(--tl-accent)]"
                  onClick={async () => {
                    const ok = await api.requestScreenCaptureAccess();
                    if (!ok) {
                      void api.openScreenRecordingSettings();
                    }
                    void refresh();
                  }}
                >
                  请求屏幕录制权限
                </button>
              )}
              <button
                type="button"
                className="rounded border border-[var(--tl-perm-action-border)] bg-[var(--tl-error-bg)]/50 px-3 py-1.5 text-[var(--tl-perm-action-text)]"
                onClick={() => void api.openScreenRecordingSettings()}
              >
                {settingsBtns.screen}
              </button>
            </>
          )}
          {permissions && !permissions.notificationListenerGranted && (
            <button
              type="button"
              className="rounded border border-[var(--tl-perm-action-border)] bg-[var(--tl-error-bg)]/50 px-3 py-1.5 text-[var(--tl-perm-action-text)]"
              onClick={() => void api.openNotificationSettings()}
            >
              {settingsBtns.notifications}
            </button>
          )}
        </div>
      )}
      {showMacosPermissionHelp &&
        clientOs === "macos" &&
        permissions &&
        (!permissions.accessibilityGranted ||
          !permissions.screenRecordingGranted) && (
          <div className="mt-4 rounded-md border border-[var(--tl-warn-amber-border)] bg-[var(--tl-banner-warn-bg)] px-3 py-2 text-xs leading-relaxed text-[var(--tl-banner-warn-text)]">
            <p className="font-medium text-[var(--tl-warn-amber-text)]">
              系统里已开启仍显示未授权？（重装 / 换安装包后常见）
            </p>
            <p className="mt-1 opacity-90">
              macOS
              把权限记在「当前这款应用的安装路径 + 代码签名」上，与旧版不是同一条记录；设置里旧的开关可能不会作用到你正在运行的这一份。
            </p>
            <ol className="mt-2 list-decimal space-y-1 pl-4 opacity-90">
              <li>完全退出 TimeLens（含托盘图标菜单中的退出）。</li>
              <li>
                打开「隐私与安全性」→「辅助功能」「录屏与系统录音」，在列表里用{" "}
                <strong>−</strong>{" "}
                移除 TimeLens（若有多条，全部移除）。
              </li>
              <li>
                从「应用程序」里的 TimeLens 重新启动（避免长期从 DMG
                内直接运行旧副本）。
              </li>
              <li>再点上方按钮进入设置，重新为 TimeLens 打开开关。</li>
              <li>
                若开关已开但角标仍红：点一次「刷新系统权限」即可同步（不要依赖反复切换窗口触发检测）。
              </li>
            </ol>
            <p className="mt-2 font-mono text-[10px] opacity-80">
              可选终端重置后重授权（当前 Bundle ID：<code>{MACOS_APP_BUNDLE_ID}</code>）：
              <br />
              tccutil reset ScreenCapture {MACOS_APP_BUNDLE_ID}
              <br />
              tccutil reset Accessibility {MACOS_APP_BUNDLE_ID}
            </p>
          </div>
        )}
    </div>
  );
}
