import { useCallback, useEffect, useMemo, useState } from "react";
import type { PermissionStatus } from "../types";
import * as api from "../services/tauri";
import {
  detectClientDesktopOs,
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
};

/**
 * 系统权限：角标 + 刷新 + 打开各平台对应的系统设置（与 Rust `open_*_settings` 对齐）。
 */
export function SystemPermissionPanel({
  variant = "both",
  className = "",
  permissions: controlled,
  onPermissionsChange,
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
                ? "bg-emerald-900/40 text-emerald-300"
                : "bg-rose-900/40 text-rose-200"
            }`}
          >
            {badges.accessibility}
          </span>
          <span
            className={`rounded px-2 py-0.5 ${
              permissions.screenRecordingGranted
                ? "bg-emerald-900/40 text-emerald-300"
                : "bg-rose-900/40 text-rose-200"
            }`}
          >
            {badges.screen}
          </span>
          <span
            className={`rounded px-2 py-0.5 ${
              permissions.notificationListenerGranted
                ? "bg-emerald-900/40 text-emerald-300"
                : "bg-rose-900/40 text-rose-200"
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
            className="rounded border border-zinc-600 px-3 py-1.5 hover:bg-zinc-800"
            onClick={() => void refresh()}
          >
            刷新系统权限
          </button>
          {permissions && !permissions.accessibilityGranted && (
            <button
              type="button"
              className="rounded border border-rose-800/50 px-3 py-1.5 text-rose-200"
              onClick={() => void api.openAccessibilitySettings()}
            >
              {settingsBtns.accessibility}
            </button>
          )}
          {permissions && !permissions.screenRecordingGranted && (
            <button
              type="button"
              className="rounded border border-rose-800/50 px-3 py-1.5 text-rose-200"
              onClick={() => void api.openScreenRecordingSettings()}
            >
              {settingsBtns.screen}
            </button>
          )}
          {permissions && !permissions.notificationListenerGranted && (
            <button
              type="button"
              className="rounded border border-rose-800/50 px-3 py-1.5 text-rose-200"
              onClick={() => void api.openNotificationSettings()}
            >
              {settingsBtns.notifications}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
