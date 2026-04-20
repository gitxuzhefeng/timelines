import { useTranslation } from "react-i18next";
import { SettingsForm } from "../components/SettingsForm";

export default function SettingsPage() {
  const { t } = useTranslation();
  return (
    <div className="h-full overflow-auto bg-[var(--tl-bg)] text-[var(--tl-ink)]">
      <h1 className="px-4 pt-4 text-lg font-semibold text-[var(--tl-ink)]">{t("settings.title")}</h1>
      <SettingsForm className="px-4 pb-4 pt-2 text-[var(--tl-ink)]" />
    </div>
  );
}
