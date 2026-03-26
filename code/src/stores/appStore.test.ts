import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useAppStore } from './appStore';
import { tauriService } from '../services/tauri';

// Mock tauriService
vi.mock('../services/tauri', () => ({
  tauriService: {
    startTracking: vi.fn(),
    stopTracking: vi.fn(),
    getTodayEvents: vi.fn(),
    getSettings: vi.fn(),
    setSetting: vi.fn(),
  },
}));

describe('appStore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset Zustand store state
    const { clearError, setTracking } = useAppStore.getState();
    clearError();
    setTracking(false);
  });

  it('should have initial state', () => {
    const state = useAppStore.getState();
    expect(state.isTracking).toBe(false);
    expect(state.todayEvents).toEqual([]);
    expect(state.theme).toBe('dark');
  });

  it('should toggle tracking', async () => {
    const store = useAppStore.getState();
    
    // Toggle on
    await store.toggleTracking();
    expect(tauriService.startTracking).toHaveBeenCalled();
    expect(useAppStore.getState().isTracking).toBe(true);

    // Toggle off
    await useAppStore.getState().toggleTracking();
    expect(tauriService.stopTracking).toHaveBeenCalled();
    expect(useAppStore.getState().isTracking).toBe(false);
  });

  it('should load today events', async () => {
    const mockEvents = [{ id: '1', app_name: 'Test', window_title: 'Title', timestamp_ms: 1000, duration_ms: 5000, snapshot_urls: [] }];
    (tauriService.getTodayEvents as any).mockResolvedValue(mockEvents);

    await useAppStore.getState().loadTodayEvents();
    expect(useAppStore.getState().todayEvents).toEqual(mockEvents);
  });

  it('should add a today event', () => {
    const newEvent = { id: '2', app_name: 'New', window_title: 'New Title', timestamp_ms: 2000, duration_ms: 0, snapshot_urls: [] };
    useAppStore.getState().addTodayEvent(newEvent);
    expect(useAppStore.getState().todayEvents[0]).toEqual(newEvent);
  });

  it('should update latest event', () => {
    const event = { id: '3', app_name: 'Update', window_title: 'Update Title', timestamp_ms: 3000, duration_ms: 0, snapshot_urls: [] };
    useAppStore.getState().addTodayEvent(event);
    
    useAppStore.getState().updateLatestEvent('3', { duration_ms: 10000 });
    expect(useAppStore.getState().todayEvents[0].duration_ms).toBe(10000);
  });
});
