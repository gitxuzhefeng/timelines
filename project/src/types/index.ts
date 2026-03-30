export interface WindowSession {
  id: string;
  startMs: number;
  endMs: number;
  durationMs: number;
  appName: string;
  bundleId: string | null;
  windowTitle: string;
  extractedUrl: string | null;
  extractedFilePath: string | null;
  intent: string | null;
  rawEventCount: number;
  isActive: boolean;
}

export interface Snapshot {
  id: string;
  sessionId: string;
  filePath: string;
  capturedAtMs: number;
  fileSizeBytes: number;
  triggerType: string;
  resolution: string | null;
  format: string;
  perceptualHash: string | null;
}

export interface RawEvent {
  id: string;
  timestampMs: number;
  appName: string;
  bundleId: string | null;
  windowTitle: string;
  extractedUrl: string | null;
  extractedFilePath: string | null;
  idleSeconds: number;
  isFullscreen: boolean;
  isAudioPlaying: boolean;
  stateHash: number;
  triggerType: string;
  createdAt: number;
}

export interface PermissionStatus {
  accessibilityGranted: boolean;
  screenRecordingGranted: boolean;
}

export interface ActivityStats {
  date: string;
  sessionCount: number;
  snapshotCount: number;
  switchCount: number;
  rawEventCount: number;
}

export interface StorageStats {
  dbSizeBytes: number;
  shotsSizeBytes: number;
  rawEventCount: number;
  sessionCount: number;
  snapshotCount: number;
}

export interface WriterStats {
  totalBatches: number;
  totalEvents: number;
  avgBatchSize: number;
  avgLatencyMs: number;
  lastBatchEvents: number;
  lastBatchMs: number;
  channelPendingEstimate: number;
}

export function snapshotTimelensUrl(snapshotId: string): string {
  return `timelens://localhost/snapshot/${snapshotId}`;
}
