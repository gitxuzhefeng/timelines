import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
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
  const { t } = useTranslation();
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
            {t("permissions.refreshPermissions")}
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
                  {t("permissions.requestScreenCapture")}
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
              {t("permissions.macosHelpTitle")}
            </p>
            <p className="mt-1 opacity-90">
              {t("permissions.macosHelpDesc")}
            </p>
            <ol className="mt-2 list-decimal space-y-1 pl-4 opacity-90">
              <li>{t("permissions.macosHelpStep1")}</li>
              <li>
                {t("permissions.macosHelpStep2a")}{" "}
                <strong>−</strong>{" "}
                {t("permissions.macosHelpStep2b")}
              </li>
              <li>{t("permissions.macosHelpStep3")}</li>
              <li>{t("permissions.macosHelpStep4")}</li>
              <li>{t("permissions.macosHelpStep5")}</li>
            </ol>
            <p className="mt-2 font-mono text-[10px] opacity-80">
              {t("permissions.macosHelpTerminal", { bundleId: MACOS_APP_BUNDLE_ID })}
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
