import { RecapContent } from "../components/RecapContent";

export default function RecapPage() {
  return (
    <div className="h-full bg-[var(--tl-bg)] p-4">
      <h1 className="mb-3 text-lg font-semibold text-[var(--tl-ink)]">复盘</h1>
      <RecapContent />
    </div>
  );
}
