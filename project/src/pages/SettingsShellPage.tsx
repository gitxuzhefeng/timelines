import { DevModeSection } from "../components/DevModeSection";
import { SettingsForm } from "../components/SettingsForm";

export default function SettingsShellPage() {
  return (
    <div className="h-full overflow-y-auto text-[var(--tl-ink)]">
      <SettingsForm className="p-5 pb-8 text-[var(--tl-ink)] [&_h2]:text-[var(--tl-muted)] [&_label]:text-[var(--tl-ink)] [&_section]:border-[var(--tl-line)]" />
      <div className="px-5 pb-10">
        <DevModeSection />
      </div>
    </div>
  );
}
