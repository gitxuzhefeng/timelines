import { RecapContent } from "../components/RecapContent";

export default function RecapPage() {
  return (
    <div className="h-full bg-zinc-950 p-4">
      <h1 className="mb-3 text-lg font-semibold text-white">复盘</h1>
      <RecapContent />
    </div>
  );
}
