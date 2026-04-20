import { useTranslation } from "react-i18next";
import { RecapContent } from "../components/RecapContent";

export default function RecapPage() {
  const { t } = useTranslation();
  return (
    <div className="h-full bg-[var(--tl-bg)] p-4">
      <h1 className="mb-3 text-lg font-semibold text-[var(--tl-ink)]">{t("recap.title")}</h1>
      <RecapContent />
    </div>
  );
}
