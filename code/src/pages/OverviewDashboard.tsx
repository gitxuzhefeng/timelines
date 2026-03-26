import { useState, useEffect, useMemo } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useAppStore } from '../stores/appStore';
import { WindowTitleStat, SnapshotInfo } from '../types';

type ViewMode = 'overview' | 'developer';
type ViewLevel = 'L1' | 'L2' | 'L3';

interface Props {
  viewMode: ViewMode;
  onSwitchView: (mode: ViewMode) => void;
}

export default function OverviewDashboard({ viewMode, onSwitchView }: Props) {
  const { todayEvents, loadTodayEvents, theme, setTheme } = useAppStore();
  const [level, setLevel] = useState<ViewLevel>('L1');
  const [selectedApp, setSelectedApp] = useState<string | null>(null);
  const [selectedTitle, setSelectedTitle] = useState<string | null>(null);
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);
  const [windowTitles, setWindowTitles] = useState<WindowTitleStat[]>([]);
  const [l3Snapshots, setL3Snapshots] = useState<SnapshotInfo[]>([]);
  const [activityStats, setActivityStats] = useState<{total_active_ms: number, afk_ms: number, app_stats: any[], hourly_pulse: number[]}>({
    total_active_ms: 0,
    afk_ms: 0,
    app_stats: [],
    hourly_pulse: Array(24).fill(0)
  });

  const fetchStats = async () => {
    try {
      const stats = await invoke<any>('get_activity_stats');
      setActivityStats(stats);
    } catch (e) {
      console.error('Failed to fetch stats', e);
    }
  };

  useEffect(() => {
    loadTodayEvents();
    fetchStats();
    const id = setInterval(() => {
      loadTodayEvents();
      fetchStats();
    }, 5000);
    return () => clearInterval(id);
  }, [loadTodayEvents]);

  const handleSelectApp = async (appName: string) => {
    setSelectedApp(appName);
    try {
      const titles = await invoke<WindowTitleStat[]>('get_window_breakdown', { appName });
      setWindowTitles(titles);
    } catch (e) {
      console.error('Failed to get window breakdown', e);
      setWindowTitles([]);
    }
    setLevel('L2');
  };

  const handleSelectTitle = async (windowTitle: string) => {
    setSelectedTitle(windowTitle);
    try {
      const snaps = await invoke<SnapshotInfo[]>('get_snapshots_for_window', {
        appName: selectedApp,
        windowTitle,
      });
      setL3Snapshots(snaps);
    } catch (e) {
      console.error('Failed to get snapshots', e);
      setL3Snapshots([]);
    }
    setLevel('L3');
  };

  const appStats = useMemo(() => {
    const stats: Record<string, { duration: number, count: number, lastSeen: number, pulses: number[], icon_base64?: string }> = {};
    todayEvents.forEach(event => {
      if (!stats[event.app_name]) {
        const backendStat = activityStats.app_stats.find(s => s.app_name === event.app_name);
        stats[event.app_name] = {
          duration: 0,
          count: 0,
          lastSeen: 0,
          pulses: [],
          icon_base64: backendStat?.icon_base64
        };
      }
      stats[event.app_name].duration += event.duration_ms;
      stats[event.app_name].count += 1;
      stats[event.app_name].lastSeen = Math.max(stats[event.app_name].lastSeen, event.timestamp_ms);

      const date = new Date(event.timestamp_ms);
      const secondsSinceMidnight = date.getHours() * 3600 + date.getMinutes() * 60 + date.getSeconds();
      const pulsePos = (secondsSinceMidnight / 86400) * 100;
      stats[event.app_name].pulses.push(pulsePos);
    });

    return Object.entries(stats)
      .map(([name, data]) => ({ name, ...data }))
      .sort((a, b) => b.duration - a.duration);
  }, [todayEvents, activityStats.app_stats]);

  const totalDuration = activityStats.total_active_ms || appStats.reduce((acc, curr) => acc + curr.duration, 0);

  const statusLabel = useMemo(() => {
    const hoursElapsed = Math.max((Date.now() - new Date().setHours(0, 0, 0, 0)) / 3_600_000, 0.1);
    const switchesPerHour = todayEvents.length / hoursElapsed;
    if (switchesPerHour > 20) return { icon: '🔥', text: '持续忙碌' };
    if (switchesPerHour > 8)  return { icon: '💻', text: '一直在工作' };
    if (switchesPerHour > 2)  return { icon: '☕️', text: '悠哉空闲' };
    return { icon: '💤', text: '轻松休息' };
  }, [todayEvents.length]);

  const scenarioStats = useMemo(() => {
    const scenarios = { focus: 0, research: 0, collab: 0, docs: 0 };
    todayEvents.forEach(e => {
      const intent = (e.intent || '').toLowerCase();
      if (intent.includes('code') || intent.includes('design')) scenarios.focus += e.duration_ms;
      else if (intent.includes('research') || intent.includes('ai')) scenarios.research += e.duration_ms;
      else if (intent.includes('communication')) scenarios.collab += e.duration_ms;
      else if (intent.includes('doc')) scenarios.docs += e.duration_ms;
    });
    return scenarios;
  }, [todayEvents]);

  const pieGradient = useMemo(() => {
    if (totalDuration === 0) return '#3a3a3c 0% 100%';
    const stops: string[] = [];
    const colors = ['#007aff', '#ff9f0a', '#30d158', '#bf5af2', '#ff375f'];
    let cumulative = 0;
    appStats.slice(0, 5).forEach((app, i) => {
      const pct = (app.duration / totalDuration) * 100;
      stops.push(`${colors[i % colors.length]} ${cumulative}% ${cumulative + pct}%`);
      cumulative += pct;
    });
    if (cumulative < 100) stops.push(`#3a3a3c ${cumulative}% 100%`);
    return stops.join(', ');
  }, [appStats, totalDuration]);

  const formatDuration = (ms: number) => {
    const mins = Math.floor(ms / 60000);
    const hrs = Math.floor(mins / 60);
    if (hrs > 0) return `${hrs}h ${mins % 60}m`;
    return `${mins}m`;
  };

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

  const getIntentTag = (intent?: string) => {
    if (!intent) return null;
    const map: Record<string, { label: string; cls: string }> = {
      'Code/Text':     { label: '深度生产', cls: 'bg-blue-500/10 text-blue-400 border-blue-500/20' },
      'Research':      { label: '知识获取', cls: 'bg-orange-500/10 text-orange-400 border-orange-500/20' },
      'Communication': { label: '协同办公', cls: 'bg-green-500/10 text-green-400 border-green-500/20' },
      'Documentation': { label: '文档写作', cls: 'bg-purple-500/10 text-purple-400 border-purple-500/20' },
      'Design':        { label: '创意设计', cls: 'bg-pink-500/10 text-pink-400 border-pink-500/20' },
      'AI Chat':       { label: 'AI 对话',  cls: 'bg-violet-500/10 text-violet-400 border-violet-500/20' },
    };
    return map[intent] || null;
  };

  const handlePrev = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (previewIndex !== null && previewIndex > 0) setPreviewIndex(previewIndex - 1);
  };

  const handleNext = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (previewIndex !== null && previewIndex < l3Snapshots.length - 1) setPreviewIndex(previewIndex + 1);
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (previewIndex === null) return;
      if (e.key === 'Escape') setPreviewIndex(null);
      if (e.key === 'ArrowLeft' && previewIndex > 0) setPreviewIndex(previewIndex - 1);
      if (e.key === 'ArrowRight' && previewIndex < l3Snapshots.length - 1) setPreviewIndex(previewIndex + 1);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [previewIndex, l3Snapshots.length]);

  const isDark = theme === 'dark';
  const glass = isDark ? 'bg-white/5 border-white/10 shadow-xl' : 'bg-black/5 border-black/10 shadow-sm';

  return (
    <div className={`flex flex-col h-full transition-colors duration-500 ${isDark ? 'bg-[#050505] text-[#f5f5f7]' : 'bg-[#f5f5f7] text-[#1d1d1f]'}`}
         style={{ backgroundImage: isDark ? 'radial-gradient(circle at 20% 30%, rgba(94,92,230,0.05) 0%, transparent 40%), radial-gradient(circle at 80% 70%, rgba(0,122,255,0.05) 0%, transparent 40%)' : 'none' }}>

      {/* Header */}
      <header className={`h-[52px] shrink-0 flex items-center justify-between px-6 border-b backdrop-blur-md z-10 ${isDark ? 'bg-black/60 border-white/10' : 'bg-white/70 border-black/10'}`}>
        <div className="flex items-center gap-3">
          <i className="fa-solid fa-compass-drafting text-[#007aff] text-lg drop-shadow-[0_0_8px_rgba(0,122,255,0.5)]"></i>
          <span className="font-bold text-base tracking-tight">TimeLens</span>
        </div>
        <nav className={`flex items-center rounded-full p-0.5 gap-0.5 ${isDark ? 'bg-white/10' : 'bg-black/10'}`}>
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
          <div className="flex items-center gap-1.5 text-[10px] text-emerald-400 font-bold">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></div>
            系统已就绪
          </div>
          <button onClick={() => setTheme(isDark ? 'light' : 'dark')} className={`w-8 h-8 rounded-full flex items-center justify-center transition-all ${isDark ? 'bg-white/10 hover:bg-white/20' : 'bg-black/10 hover:bg-black/20'}`}>
            <i className={`fa-solid ${isDark ? 'fa-moon' : 'fa-sun'} text-xs`}></i>
          </button>
        </div>
      </header>

      <main className="flex-1 relative overflow-hidden">
        {/* ─── L1: Overview ─── */}
        <div className={`absolute inset-0 p-6 transition-all duration-500 ease-[cubic-bezier(0.2,1,0.2,1)] ${level === 'L1' ? 'translate-x-0 opacity-100' : '-translate-x-[10%] opacity-0 pointer-events-none'}`}>
          <div className="grid grid-cols-4 gap-5 max-w-[1400px] mx-auto h-full" style={{ gridTemplateRows: 'auto 1fr' }}>
            {/* Row 1: Metric cards */}
            <div className={`rounded-2xl p-5 border backdrop-blur-xl flex flex-col gap-2 hover:-translate-y-0.5 transition-all ${glass}`}>
              <div className="text-[10px] font-bold opacity-40 uppercase tracking-widest flex justify-between">今日活动 <i className="fa-solid fa-layer-group opacity-30"></i></div>
              <div className="text-3xl font-bold font-mono">{appStats.length}</div>
              <div className="text-[10px] opacity-40">应用 · {todayEvents.length} 次切换</div>
            </div>

            <div className={`rounded-2xl p-5 border backdrop-blur-xl flex flex-col gap-2 hover:-translate-y-0.5 transition-all ${glass}`}>
              <div className="text-[10px] font-bold opacity-40 uppercase tracking-widest flex justify-between">活跃时长 <i className="fa-solid fa-wand-magic-sparkles opacity-30"></i></div>
              <div className="text-3xl font-bold font-mono">{formatDuration(totalDuration)}</div>
              <div className="mt-1 space-y-1">
                <ScenarioBar label="深度生产" val={scenarioStats.focus} total={totalDuration} color="bg-blue-500" isDark={isDark} />
                <ScenarioBar label="知识获取" val={scenarioStats.research} total={totalDuration} color="bg-orange-500" isDark={isDark} />
                <ScenarioBar label="协同办公" val={scenarioStats.collab} total={totalDuration} color="bg-green-500" isDark={isDark} />
              </div>
            </div>

            <div className={`rounded-2xl p-5 border backdrop-blur-xl flex flex-col gap-2 hover:-translate-y-0.5 transition-all ${glass}`}>
              <div className="text-[10px] font-bold opacity-40 uppercase tracking-widest flex justify-between">综合评估 <i className="fa-solid fa-circle-info opacity-30"></i></div>
              <div className="text-2xl font-bold">{statusLabel.icon} {statusLabel.text}</div>
              <div className="text-[10px] opacity-40">{todayEvents.length} 次窗口切换</div>
            </div>

            <div className={`rounded-2xl p-5 border backdrop-blur-xl flex flex-col gap-2 hover:-translate-y-0.5 transition-all ${glass}`}>
              <div className="text-[10px] font-bold opacity-40 uppercase tracking-widest flex justify-between">无效挂机 <i className="fa-solid fa-broom opacity-30"></i></div>
              <div className="text-3xl font-bold font-mono">{formatDuration(activityStats.afk_ms)}</div>
              <div className="text-[10px] opacity-40">已从活跃时长中清洗</div>
            </div>

            {/* Row 2: Apps panel + Charts panel */}
            <div className={`col-span-3 rounded-2xl p-6 border backdrop-blur-xl overflow-hidden flex flex-col ${isDark ? 'bg-white/5 border-white/10 shadow-2xl' : 'bg-black/5 border-black/10 shadow-lg'}`}>
              <div className="flex justify-between items-center mb-4 shrink-0">
                <h3 className="text-sm font-semibold flex items-center gap-2"><i className="fa-solid fa-magnifying-glass-chart opacity-50"></i> 核心应用追踪</h3>
                <span className="text-[10px] opacity-40 font-mono">{appStats.length} apps · today</span>
              </div>
              <div className="grid grid-cols-2 gap-3 overflow-y-auto flex-1 pr-1" style={{ scrollbarWidth: 'none' }}>
                {appStats.map((app) => {
                  const intentEntry = getIntentTag(todayEvents.find(e => e.app_name === app.name)?.intent);
                  return (
                    <div key={app.name} onClick={() => handleSelectApp(app.name)}
                         className={`group flex flex-col p-4 rounded-xl cursor-pointer transition-all hover:translate-x-0.5 ${isDark ? 'bg-white/5 hover:bg-white/10 border border-transparent hover:border-white/10' : 'bg-black/5 hover:bg-black/10 border border-transparent hover:border-black/10'}`}>
                      <div className="flex items-center gap-3 mb-2">
                        <div className={`w-9 h-9 rounded-xl flex items-center justify-center overflow-hidden shrink-0 ${isDark ? 'bg-white/10' : 'bg-black/10'}`}>
                          {app.icon_base64 ? <img src={`data:image/png;base64,${app.icon_base64}`} alt="" className="w-6 h-6 object-contain" /> : <i className={`${getAppIcon(app.name)} text-sm`}></i>}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="font-semibold text-sm truncate">{app.name}</div>
                          <div className="flex items-center gap-1 mt-0.5">
                            {intentEntry && <span className={`text-[9px] px-1.5 py-0.5 rounded border font-bold ${intentEntry.cls}`}>{intentEntry.label}</span>}
                            <span className="text-[9px] opacity-40">{app.count} 次</span>
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <div className="font-mono font-bold text-sm">{formatDuration(app.duration)}</div>
                          <div className="text-[10px] text-[#007aff] font-bold">{totalDuration > 0 ? Math.round((app.duration / totalDuration) * 100) : 0}%</div>
                        </div>
                      </div>
                      {/* Micro-timeline pulse bar */}
                      <div className={`w-full h-1 rounded-full relative overflow-hidden ${isDark ? 'bg-white/10' : 'bg-black/10'}`}>
                        {app.pulses.map((pos, i) => (
                          <div key={i} className="absolute h-full bg-[#007aff] opacity-60" style={{ left: `${pos}%`, width: '2px' }}></div>
                        ))}
                      </div>
                    </div>
                  );
                })}
                {appStats.length === 0 && (
                  <div className="col-span-2 flex flex-col items-center justify-center py-16 opacity-30">
                    <i className="fa-solid fa-chart-simple text-4xl mb-3"></i>
                    <span className="text-sm">暂无今日活动数据</span>
                  </div>
                )}
              </div>
            </div>

            <div className="col-span-1 flex flex-col gap-4">
              {/* Hourly bar chart */}
              <div className={`rounded-2xl p-5 border backdrop-blur-xl flex-1 ${glass}`}>
                <h4 className="text-[10px] font-bold opacity-50 mb-3 uppercase tracking-wider">24h 活跃分布</h4>
                <div className="flex items-end gap-[2px] h-24">
                  {activityStats.hourly_pulse.map((val, i) => {
                    const maxVal = Math.max(...activityStats.hourly_pulse, 1);
                    const height = (val / maxVal) * 100;
                    return <div key={i} className="flex-1 bg-[#007aff]/30 rounded-t-sm hover:bg-[#007aff] transition-all" style={{ height: `${Math.max(height, 4)}%` }}></div>;
                  })}
                </div>
                <div className="flex justify-between mt-2 text-[9px] opacity-40 font-mono">
                  <span>00</span><span>06</span><span>12</span><span>18</span><span>24</span>
                </div>
              </div>

              {/* Pie chart */}
              <div className={`rounded-2xl p-5 border backdrop-blur-xl flex-1 ${glass}`}>
                <h4 className="text-[10px] font-bold opacity-50 mb-3 uppercase tracking-wider">时间占比</h4>
                <div className="flex flex-col items-center gap-3">
                  <div className="w-20 h-20 rounded-full" style={{ background: `conic-gradient(${pieGradient})` }}></div>
                  <div className="w-full space-y-1.5">
                    {appStats.slice(0, 4).map((app, i) => {
                      const colors = ['bg-[#007aff]', 'bg-[#ff9f0a]', 'bg-[#30d158]', 'bg-[#bf5af2]'];
                      return (
                        <div key={app.name} className="flex items-center justify-between text-[10px] gap-1">
                          <span className="flex items-center gap-1 truncate">
                            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${colors[i]}`}></span>
                            <span className="truncate opacity-70">{app.name}</span>
                          </span>
                          <span className="font-mono shrink-0">{totalDuration > 0 ? Math.round((app.duration / totalDuration) * 100) : 0}%</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ─── L2: Window Title Breakdown ─── */}
        <div className={`absolute inset-0 p-6 transition-all duration-500 ease-[cubic-bezier(0.2,1,0.2,1)] ${level === 'L2' ? 'translate-x-0 opacity-100' : level === 'L1' ? 'translate-x-full opacity-0 pointer-events-none' : '-translate-x-[10%] opacity-0 pointer-events-none'}`}>
          <div className="max-w-[900px] mx-auto">
            <button onClick={() => setLevel('L1')} className="mb-5 flex items-center gap-2 text-sm opacity-60 hover:opacity-100 transition-opacity">
              <i className="fa-solid fa-arrow-left text-xs"></i> 返回概览
            </button>
            <div className="flex items-center gap-3 mb-6">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center overflow-hidden ${isDark ? 'bg-white/10' : 'bg-black/10'}`}>
                {appStats.find(a => a.name === selectedApp)?.icon_base64
                  ? <img src={`data:image/png;base64,${appStats.find(a => a.name === selectedApp)?.icon_base64}`} alt="" className="w-7 h-7 object-contain" />
                  : <i className={`${getAppIcon(selectedApp || '')} text-sm`}></i>}
              </div>
              <div>
                <h2 className="text-xl font-bold">{selectedApp}</h2>
                <div className="text-xs opacity-40">{windowTitles.length} 个窗口标题 · 点击查看截图</div>
              </div>
            </div>
            <div className={`rounded-2xl border backdrop-blur-xl overflow-hidden ${isDark ? 'bg-white/5 border-white/10' : 'bg-black/5 border-black/10'}`}>
              <div className="max-h-[560px] overflow-y-auto" style={{ scrollbarWidth: 'none' }}>
                {windowTitles.map((wt) => {
                  const intentEntry = getIntentTag(wt.intent);
                  return (
                    <div key={wt.window_title} onClick={() => handleSelectTitle(wt.window_title)}
                         className={`p-5 flex justify-between items-center cursor-pointer transition-colors border-b last:border-0 hover:bg-white/5 ${isDark ? 'border-white/5' : 'border-black/5'}`}>
                      <div className="min-w-0 flex-1 pr-6">
                        <div className="font-medium text-sm mb-1 truncate">{wt.window_title}</div>
                        <div className="flex items-center gap-2 text-[10px] opacity-50">
                          <span>{wt.session_count} 次会话</span>
                          {intentEntry && <span className={`px-1.5 py-0.5 rounded border font-bold ${intentEntry.cls}`}>{intentEntry.label}</span>}
                        </div>
                      </div>
                      <div className="flex items-center gap-4 shrink-0">
                        <div className="text-right">
                          <div className="font-mono font-bold text-sm">{formatDuration(wt.total_duration_ms)}</div>
                        </div>
                        <i className="fa-solid fa-chevron-right opacity-30 text-xs"></i>
                      </div>
                    </div>
                  );
                })}
                {windowTitles.length === 0 && (
                  <div className="py-16 text-center opacity-30 text-sm">暂无窗口数据</div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* ─── L3: Screenshots ─── */}
        <div className={`absolute inset-0 p-6 transition-all duration-500 ease-[cubic-bezier(0.2,1,0.2,1)] ${level === 'L3' ? 'translate-x-0 opacity-100' : 'translate-x-full opacity-0 pointer-events-none'}`}>
          <div className="max-w-[1100px] mx-auto">
            <button onClick={() => setLevel('L2')} className="mb-5 flex items-center gap-2 text-sm opacity-60 hover:opacity-100 transition-opacity">
              <i className="fa-solid fa-arrow-left text-xs"></i> 返回列表
            </button>
            <div className="mb-5">
              <h2 className="text-lg font-bold truncate">{selectedTitle}</h2>
              <div className="text-xs opacity-40 mt-0.5">{l3Snapshots.length} 张截图 · {selectedApp}</div>
            </div>
            <div className="grid grid-cols-4 gap-4 pb-8 max-h-[560px] overflow-y-auto" style={{ scrollbarWidth: 'none' }}>
              {l3Snapshots.map((snap, i) => (
                <div key={snap.url} onClick={() => setPreviewIndex(i)}
                     className={`group relative aspect-video rounded-xl overflow-hidden border cursor-pointer hover:scale-[1.02] transition-all ${isDark ? 'bg-white/5 border-white/10 shadow-2xl' : 'bg-black/5 border-black/10 shadow-md'}`}>
                  <img src={snap.url} alt="" className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity" />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity p-3 flex flex-col justify-end">
                    <div className="text-[9px] font-mono text-white">{new Date(snap.captured_at_ms).toLocaleTimeString()}</div>
                    <div className="text-[9px] font-mono text-white/50">{(snap.file_size_bytes / 1024).toFixed(0)} KB</div>
                  </div>
                </div>
              ))}
              {l3Snapshots.length === 0 && (
                <div className="col-span-4 py-20 text-center opacity-30 text-sm">暂无截图数据</div>
              )}
            </div>
          </div>
        </div>
      </main>

      {/* Lightbox */}
      {previewIndex !== null && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/95 backdrop-blur-xl" onClick={() => setPreviewIndex(null)}>
          <div className="absolute top-5 left-6 flex items-center gap-3 text-white/70">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center overflow-hidden ${isDark ? 'bg-white/10' : 'bg-black/10'}`}>
              {appStats.find(a => a.name === selectedApp)?.icon_base64
                ? <img src={`data:image/png;base64,${appStats.find(a => a.name === selectedApp)?.icon_base64}`} className="w-5 h-5 object-contain" />
                : <i className={`${getAppIcon(selectedApp || '')} text-xs`}></i>}
            </div>
            <div>
              <div className="font-bold text-sm">{selectedApp}</div>
              <div className="text-[10px] opacity-50 truncate max-w-[400px]">{selectedTitle}</div>
            </div>
          </div>
          <button onClick={() => setPreviewIndex(null)} className="absolute top-5 right-6 text-white/40 hover:text-white text-xl transition-colors"><i className="fa-solid fa-xmark"></i></button>
          {previewIndex > 0 && (
            <button onClick={handlePrev} className="absolute left-6 w-10 h-10 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 flex items-center justify-center text-white transition-all">
              <i className="fa-solid fa-chevron-left text-xs"></i>
            </button>
          )}
          {previewIndex < l3Snapshots.length - 1 && (
            <button onClick={handleNext} className="absolute right-6 w-10 h-10 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 flex items-center justify-center text-white transition-all">
              <i className="fa-solid fa-chevron-right text-xs"></i>
            </button>
          )}
          <div className="max-w-[90vw] max-h-[85vh]" onClick={(e) => e.stopPropagation()}>
            <img src={l3Snapshots[previewIndex]?.url} alt="" className="w-full h-full object-contain rounded-lg shadow-2xl border border-white/10" />
            <div className="mt-4 text-center">
              <span className="bg-white/10 px-4 py-1.5 rounded-full text-[10px] font-mono text-white/50 border border-white/5 backdrop-blur-md">
                {previewIndex + 1} / {l3Snapshots.length} · {new Date(l3Snapshots[previewIndex]?.captured_at_ms).toLocaleTimeString()}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className={`h-10 border-t px-6 flex justify-between items-center text-[10px] opacity-50 shrink-0 ${isDark ? 'bg-black/80 border-white/10' : 'bg-white/80 border-black/10'}`}>
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1 text-emerald-500 font-bold"><i className="fa-solid fa-shield-halved"></i> 100% 本地隐私保障</span>
          <span>|</span>
          <span className="font-mono">TIMELENS V2.0</span>
        </div>
        <button onClick={() => invoke('open_data_dir')} className="hover:opacity-100 transition-opacity flex items-center gap-1">
          <i className="fa-solid fa-folder-open"></i> 浏览数据目录
        </button>
      </footer>
    </div>
  );
}

function ScenarioBar({ label, val, total, color, isDark }: { label: string; val: number; total: number; color: string; isDark: boolean }) {
  const percent = total > 0 ? Math.round((val / total) * 100) : 0;
  return (
    <div className="space-y-0.5">
      <div className="flex justify-between text-[8px] opacity-50"><span>{label}</span><span className="font-mono">{percent}%</span></div>
      <div className={`w-full h-0.5 rounded-full overflow-hidden ${isDark ? 'bg-white/10' : 'bg-black/10'}`}>
        <div className={`h-full ${color}`} style={{ width: `${percent}%` }}></div>
      </div>
    </div>
  );
}
