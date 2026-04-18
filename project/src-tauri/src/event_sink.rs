//! 与 UI 解耦的事件出口：Tauri 用 `AppHandle::emit`，守护进程用广播/WebSocket。

use serde::Serialize;
use tauri::Emitter;

/// 与前端 `listen` 频道对齐：载荷为 JSON。
pub trait EventSink: Send + Sync {
    fn emit_json(&self, channel: &str, payload: serde_json::Value);
}

pub fn emit_ser<S: Serialize>(sink: &dyn EventSink, channel: &str, payload: &S) {
    match serde_json::to_value(payload) {
        Ok(v) => sink.emit_json(channel, v),
        Err(e) => log::warn!("event_sink emit_ser failed: {e}"),
    }
}

#[derive(Clone)]
pub struct TauriEventSink {
    pub app: tauri::AppHandle,
}

impl EventSink for TauriEventSink {
    fn emit_json(&self, channel: &str, payload: serde_json::Value) {
        let _ = self.app.emit(channel, payload);
    }
}

/// 供守护进程通过 `tokio::sync::broadcast` 转发到 WebSocket。
#[derive(Clone)]
pub struct BroadcastEventSink {
    pub tx: tokio::sync::broadcast::Sender<(String, serde_json::Value)>,
}

impl EventSink for BroadcastEventSink {
    fn emit_json(&self, channel: &str, payload: serde_json::Value) {
        let _ = self.tx.send((channel.to_string(), payload));
    }
}
