import { useState, useEffect, useMemo } from 'react';
import { Virtuoso } from 'react-virtuoso';
import { listen } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/core';
import { useAppStore } from '../stores/appStore';
import { WindowEvent } from '../types';

type ViewMode = 'overview' | 'developer';

interface Props {
  viewMode: ViewMode;
  onSwitchView: (mode: ViewMode) => void;
}

export default function DeveloperDashboard({ viewMode, onSwitchView }: Props) {
  const { todayEvents, addTodayEvent, updateLatestEvent, loadTodayEvents, theme } = useAppStore();
  const [appFilter, setAppFilter] = useState('all');
  const [intentFilter, setIntentFilter] = useState('all');
  const [activeEventIndex, setActiveEventIndex] = useState(0);
  const [appIcons, setAppIcons] = useState<Record<string, string>>({});

  const fetchIcons = async () => {
    try {
      const icons = await invoke<any[]>('get_all_app_meta');
      const iconMap: Record<string, string> = {};
      icons.forEach(i => {
        if (i.icon_base64) iconMap[i.app_name] = i.icon_base64;
      });
      setAppIcons(iconMap);
    } catch (e) {
      console.error('Failed to fetch icons', e);
    }
  };

  // Polling fallback
  useEffect(() => {
    loadTodayEvents();
    fetchIcons();
    const id = setInterval(() => {
      loadTodayEvents();
      fetchIcons();
    }, 3000);
    return () => clearInterval(id);
  }, [loadTodayEvents]);

  // Real-time Event Listeners
  useEffect(() => {
    let unlistenWindow: (() => void) | undefined;
    let unlistenSnapshot: (() => void) | undefined;
    let cancelled = false;

    const setup = async () => {
      const ul1 = await listen<WindowEvent>('window_event_updated', (event) => {
        const exists = useAppStore.getState().todayEvents.some(e => e.id === event.payload.id);
        if (exists) {
          updateLatestEvent(event.payload.id, event.payload);
        } else {
          addTodayEvent(event.payload);
        }
      });

      const ul2 = await listen<{event_id: string, file_path: string}>('new_snapshot_saved', (event) => {
        const { event_id, file_path } = event.payload;
        const targetEvent = useAppStore.getState().todayEvents.find(e => e.id === event_id);
        if (targetEvent) {
          const currentUrls = targetEvent.snapshot_urls || [];
          if (!currentUrls.includes(file_path)) {
             updateLatestEvent(event_id, { snapshot_urls: [...currentUrls, file_path] });
          }
        }
      });

      if (cancelled) { ul1(); ul2(); }
      else { unlistenWindow = ul1; unlistenSnapshot = ul2; }
    };

    setup();
    return () => { cancelled = true; unlistenWindow?.(); unlistenSnapshot?.(); };
  }, [addTodayEvent, updateLatestEvent]);

  const filteredEvents = useMemo(() => {
    return [...todayEvents].filter((item) => {
      const matchApp = appFilter === 'all' || item.app_name === appFilter;
      const matchIntent = intentFilter === 'all' || item.intent === intentFilter;
      return matchApp && matchIntent;
    });
  }, [todayEvents, appFilter, intentFilter]);

  const activeEvent = filteredEvents[activeEventIndex] || null;

  const getAppIcon = (appName: string) => {
    const name = appName.toLowerCase();
    if (name.includes('code') || name.includes('cursor') || name.includes('idea')) return 'fa-solid fa-code text-blue-500';
    if (name.includes('chrome') || name.includes('safari') || name.includes('browser')) return 'fa-brands fa-chrome text-orange-500';
    if (name.includes('wechat')) return 'fa-brands fa-weixin text-green-500';
    if (name.includes('notion') || name.includes('obsidian') || name.includes('word')) return 'fa-solid fa-book text-purple-500';
    if (name.includes('figma') || name.includes('sketch')) return 'fa-solid fa-pen-nib text-pink-500';
    if (name.includes('slack') || name.includes('discord') || name.includes('teams')) return 'fa-brands fa-slack text-indigo-500';
    return 'fa-solid fa-window-maximize text-slate-400';
  };

  const formatDuration = (ms: number) => {
    const totalSeconds = Math.floor(ms / 1000);
    const m = Math.floor(totalSeconds / 60);
    const s = totalSeconds % 60;
    const h = Math.floor(m / 60);
    if (h > 0) return `${h}h ${m % 60}m`;
    if (m > 0) return `${m}m ${s}s`;
    return `${s}s`;
  };

  const formatTime = (ms: number) =>
    new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

  const appOptions = useMemo(() => {
    const apps = new Set(todayEvents.map(e => e.app_name));
    return ['all', ...Array.from(apps)];
  }, [todayEvents]);

  return (
    <div className={`flex flex-col h-full transition-colors duration-500 ${theme === 'dark' ? 'bg-[#0f172a] text-[#f8fafc]' : 'bg-[#f8fafc] text-[#0f172a]'}`} style={{
      backgroundImage: theme === 'dark' 
        ? `radial-gradient(circle at 15% 50%, rgba(59,130,246,0.15), transparent 25%), radial-gradient(circle at 85% 30%, rgba(139,92,246,0.15), transparent 25%)`
        : 'none'
    }}>
      {/* Header */}
      <header className={`flex justify-between items-center px-6 py-3 border-b backdrop-blur-md shadow-md h-[60px] z-10 shrink-0 ${theme === 'dark' ? 'bg-slate-800/70 border-white/10' : 'bg-white/70 border-black/10'}`}>
        <div className="flex items-center gap-3 font-bold text-base tracking-tight">
          <i className="fa-solid fa-compass-drafting text-blue-500 drop-shadow-[0_0_10px_rgba(59,130,246,0.5)]"></i>
          TimeLens
        </div>
        <nav className={`flex items-center rounded-full p-0.5 gap-0.5 ${theme === 'dark' ? 'bg-white/10' : 'bg-black/10'}`}>
          <button
            onClick={() => onSwitchView('overview')}
            className={`px-4 py-1.5 rounded-full text-xs font-semibold transition-all ${viewMode === 'overview' ? 'bg-[#007aff] text-white shadow' : 'opacity-50 hover:opacity-80'}`}
          >数据概览</button>
          <button
            onClick={() => onSwitchView('developer')}
            className={`px-4 py-1.5 rounded-full text-xs font-semibold transition-all ${viewMode === 'developer' ? 'bg-[#007aff] text-white shadow' : 'opacity-50 hover:opacity-80'}`}
          >开发者视界</button>
        </nav>
        <div className="flex items-center gap-3">
          <div className={`flex items-center gap-2 text-xs px-3 py-1 rounded-full border ${theme === 'dark' ? 'text-slate-400 bg-black/20 border-white/10' : 'text-slate-600 bg-black/5 border-black/10'}`}>
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_8px_#10b981]"></div>
            正在实时监听
          </div>
        </div>
      </header>

      {/* Main */}
      <main className="flex flex-1 overflow-hidden p-6 gap-6">
        {/* ── Sidebar ── */}
        <section className={`w-[400px] flex flex-col backdrop-blur-md rounded-2xl border shadow-lg overflow-hidden shrink-0 ${theme === 'dark' ? 'bg-slate-800/70 border-white/10' : 'bg-white border-black/10'}`}>
          <div className={`px-4 py-3 border-b flex items-center gap-2 shrink-0 ${theme === 'dark' ? 'border-white/10 bg-white/5' : 'border-black/5 bg-black/5'}`}>
            <i className="fa-solid fa-list-ul text-sm opacity-50"></i>
            <span className="font-semibold text-sm">实时行为时序 (Flat Timeline)</span>
          </div>

          {/* Filters */}
          <div className={`px-4 py-3 border-b flex flex-col gap-2.5 shrink-0 ${theme === 'dark' ? 'border-white/10 bg-black/10' : 'border-black/5 bg-black/5'}`}>
            <FilterRow label="App" current={appFilter} setFilter={setAppFilter} options={appOptions} theme={theme} />
            <FilterRow label="Intent" current={intentFilter} setFilter={setIntentFilter}
              options={['all', 'Code/Text', 'Research', 'AI Chat', 'Documentation', 'Communication']} theme={theme} />
          </div>

          <div className="flex-1 overflow-hidden p-4">
            <Virtuoso
              data={filteredEvents}
              totalCount={filteredEvents.length}
              itemContent={(index: number, item: WindowEvent) => (
                <div onClick={() => setActiveEventIndex(index)} className="group relative pl-6 pb-5 cursor-pointer">
                  {index !== filteredEvents.length - 1 && (
                    <div className={`absolute left-[5px] top-5 bottom-0 w-px ${theme === 'dark' ? 'bg-white/10' : 'bg-black/10'}`}></div>
                  )}
                  <div className={`absolute left-0 top-1 w-3 h-3 rounded-full border-2 transition-all z-10
                    ${index === activeEventIndex ? 'border-blue-500 bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.5)]' : (theme === 'dark' ? 'border-slate-500 bg-slate-800' : 'border-slate-300 bg-white')}`}
                  />
                  <div className="text-[10px] opacity-50 mb-1 tabular-nums font-mono">
                    {formatTime(item.timestamp_ms)} · {formatDuration(item.duration_ms)}
                  </div>
                  <div className={`border rounded-xl p-3 transition-all
                    ${index === activeEventIndex 
                        ? (theme === 'dark' ? 'border-blue-500 bg-white/10 shadow-xl' : 'border-blue-500 bg-blue-50/50 shadow-md') 
                        : (theme === 'dark' ? 'border-white/5 bg-white/5 hover:bg-white/10' : 'border-black/5 bg-black/5 hover:bg-black/10')}`}
                  >
                    <div className="flex items-center gap-2 font-bold text-sm mb-1 truncate">
                      {appIcons[item.app_name] ? (
                        <img src={`data:image/png;base64,${appIcons[item.app_name]}`} alt="" className="w-4 h-4 object-contain" />
                      ) : (
                        <i className={getAppIcon(item.app_name)}></i>
                      )}
                      {item.app_name}
                    </div>
                    <div className="text-xs opacity-60 line-clamp-2 break-all leading-relaxed font-medium">{item.window_title}</div>
                  </div>
                </div>
              )}
            />
          </div>
        </section>

        {/* ── Main Preview ── */}
        <section className={`flex-1 flex flex-col backdrop-blur-md rounded-2xl border shadow-lg overflow-hidden relative ${theme === 'dark' ? 'bg-slate-800/70 border-white/10' : 'bg-white border-black/10'}`}>
          <div className="absolute top-4 right-4 bg-red-500/10 text-red-500 border border-red-500/30 px-3 py-1.5 rounded-md font-mono text-[10px] z-20 flex items-center gap-2 pointer-events-none font-bold">
            <i className="fa-solid fa-bug"></i> DEV MODE: RAW CAPTURES
          </div>

          <div className="flex-1 p-5 overflow-y-auto flex flex-col gap-4">
            <div className={`w-full bg-black rounded-2xl border shadow-2xl relative overflow-hidden group aspect-video flex-shrink-0 flex items-center justify-center ${theme === 'dark' ? 'border-white/10' : 'border-black/20'}`}>
              <div className="absolute inset-0 border-4 border-red-500/30 pointer-events-none z-10" />
              <div className="absolute top-3 left-3 bg-red-500 text-white text-[10px] font-bold px-2 py-0.5 rounded flex items-center gap-1.5 z-20 animate-pulse">
                <div className="w-1.5 h-1.5 bg-white rounded-full" /> REC
              </div>

              {activeEvent?.snapshot_urls && activeEvent.snapshot_urls.length > 0 ? (
                <img
                  src={activeEvent.snapshot_urls[activeEvent.snapshot_urls.length - 1]}
                  alt="Active snapshot"
                  className="w-full h-full object-contain opacity-90 transition-opacity group-hover:opacity-100"
                />
              ) : (
                <div className="flex flex-col items-center opacity-20">
                  {appIcons[activeEvent?.app_name || ''] ? (
                    <img src={`data:image/png;base64,${appIcons[activeEvent?.app_name || '']}`} alt="" className="w-16 h-16 object-contain mb-4" />
                  ) : (
                    <i className={`${activeEvent ? getAppIcon(activeEvent.app_name) : 'fa-solid fa-image'} text-6xl mb-4`}></i>
                  )}
                  <span className="text-xs font-mono">Waiting for capture...</span>
                </div>
              )}

              {activeEvent && (
                <div className="absolute bottom-0 left-0 right-0 p-6 bg-gradient-to-t from-black via-black/40 to-transparent pt-12 z-10 text-white">
                  <div className="text-lg font-bold truncate drop-shadow-md">{activeEvent.window_title}</div>
                  <div className="text-xs opacity-70 mt-1 font-medium">{formatTime(activeEvent.timestamp_ms)} · {activeEvent.app_name}</div>
                </div>
              )}
            </div>

            <div className="flex items-center gap-3 mt-2">
                <div className="h-px flex-1 bg-current opacity-10"></div>
                <span className="text-[10px] font-bold uppercase tracking-widest opacity-40">Snapshot History</span>
                <div className="h-px flex-1 bg-current opacity-10"></div>
            </div>

            <div className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-4 pb-4">
              {activeEvent?.snapshot_urls?.map((url, idx) => (
                <div key={idx} className={`aspect-video rounded-xl border-2 transition-all cursor-pointer relative overflow-hidden group ${theme === 'dark' ? 'bg-slate-900 border-transparent hover:border-blue-500' : 'bg-slate-100 border-transparent hover:border-blue-500 shadow-sm'}`}>
                  <img src={url} alt={`Snapshot ${idx}`} className="w-full h-full object-cover opacity-60 group-hover:opacity-100 transition-opacity" />
                  <div className="absolute bottom-0 left-0 right-0 p-2 bg-black/70 text-white text-[9px] font-mono tabular-nums opacity-0 group-hover:opacity-100 transition-opacity">
                    #{idx + 1} · {formatTime(activeEvent.timestamp_ms)}
                  </div>
                </div>
              ))}
              {(!activeEvent?.snapshot_urls || activeEvent.snapshot_urls.length === 0) && (
                <div className={`aspect-video rounded-xl border-2 border-dashed flex items-center justify-center text-[10px] opacity-30 ${theme === 'dark' ? 'border-white/20' : 'border-black/20'}`}>
                  抽帧收集中...
                </div>
              )}
            </div>
          </div>
        </section>
      </main>

      <footer className={`h-10 border-t flex justify-between items-center px-6 text-[10px] z-10 shrink-0 ${theme === 'dark' ? 'bg-slate-900/90 border-white/10 text-slate-400' : 'bg-white border-black/10 text-slate-500'}`}>
        <div className="flex items-center gap-4">
          <span className="text-emerald-500 flex items-center gap-1 font-bold"><i className="fa-solid fa-shield-check"></i> 本地沙盒加密</span>
          <span className="opacity-20">|</span>
          <span className="font-mono uppercase">Developer Vision Mode</span>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={() => invoke('trigger_screenshot')} className="flex items-center gap-1.5 border border-blue-500/50 text-blue-500 px-3 py-1 rounded-full hover:bg-blue-500/10 transition-colors font-bold uppercase tracking-tighter">
            <i className="fa-solid fa-camera"></i> Manual Capture
          </button>
        </div>
      </footer>
    </div>
  );
}

function FilterRow({ label, current, setFilter, options, theme }: {
  label: string;
  current: string;
  setFilter: (v: string) => void;
  options: string[];
  theme: 'dark' | 'light';
}) {
  return (
    <div className="flex items-center gap-2 text-[10px]">
      <div className="w-10 opacity-50 font-bold uppercase shrink-0">{label}</div>
      <div className="flex flex-wrap gap-1.5">
        {options.slice(0, 6).map((opt) => (
          <button
            key={opt}
            onClick={() => setFilter(opt)}
            className={`px-2.5 py-0.5 rounded-full border transition-all truncate max-w-[80px] ${
              current === opt
                ? 'bg-blue-500 border-blue-500 text-white shadow-md'
                : (theme === 'dark' ? 'border-white/10 text-slate-400 hover:bg-white/10' : 'border-black/10 text-slate-600 hover:bg-black/5')
            }`}
          >
            {opt === 'all' ? '全部' : opt}
          </button>
        ))}
      </div>
    </div>
  );
}
