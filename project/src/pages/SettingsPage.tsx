import { SettingsForm } from "../components/SettingsForm";

export default function SettingsPage() {
  return (
    <div className="h-full overflow-auto bg-zinc-950 text-zinc-100">
      <h1 className="px-4 pt-4 text-lg font-semibold text-white">设置</h1>
      <SettingsForm className="px-4 pb-4 pt-2 text-zinc-100" />
    </div>
  );
}
