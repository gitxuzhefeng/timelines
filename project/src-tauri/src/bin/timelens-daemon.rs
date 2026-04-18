//! TimeLens 无 UI 守护进程：供 Electron 通过本地 HTTP/WebSocket 调用。
//!
//! 启动后向 stdout 打印一行：`TIMELENS_DAEMON_READY port=<u16> token=<hex>\n`

use std::net::SocketAddr;
use std::sync::Arc;

use axum::body::Body;
use axum::extract::ws::{Message, WebSocket, WebSocketUpgrade};
use axum::extract::{Path, Query, State};
use axum::http::{header, HeaderMap, StatusCode};
use axum::response::{IntoResponse, Response};
use axum::routing::{get, post};
use axum::Router;
use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use serde_json::json;
use timelens_lib::bootstrap::bootstrap_core;
use timelens_lib::dispatch_invoke;
use timelens_lib::event_sink::BroadcastEventSink;
use timelens_lib::AppState;

#[derive(Clone)]
struct DaemonState {
    app: AppState,
    token: String,
    bc: tokio::sync::broadcast::Sender<(String, serde_json::Value)>,
}

#[derive(Deserialize)]
struct InvokeBody {
    cmd: String,
    #[serde(default)]
    args: serde_json::Value,
}

#[derive(Serialize)]
struct InvokeOk {
    ok: bool,
    data: serde_json::Value,
}

fn check_auth(headers: &HeaderMap, token: &str) -> bool {
    let Some(auth) = headers
        .get(header::AUTHORIZATION)
        .and_then(|v| v.to_str().ok())
    else {
        return false;
    };
    let Some(rest) = auth.strip_prefix("Bearer ") else {
        return false;
    };
    rest == token
}

async fn handle_invoke(
    State(st): State<Arc<DaemonState>>,
    headers: HeaderMap,
    axum::Json(body): axum::Json<InvokeBody>,
) -> Response {
    if !check_auth(&headers, &st.token) {
        return (StatusCode::UNAUTHORIZED, "unauthorized").into_response();
    }
    match dispatch_invoke(&st.app, &body.cmd, body.args) {
        Ok(data) => axum::Json(InvokeOk { ok: true, data }).into_response(),
        Err(e) => (
            StatusCode::BAD_REQUEST,
            axum::Json(json!({ "ok": false, "error": e })),
        )
            .into_response(),
    }
}

#[derive(Deserialize)]
struct SnapQuery {
    token: Option<String>,
}

async fn handle_snapshot(
    State(st): State<Arc<DaemonState>>,
    headers: HeaderMap,
    Path(id): Path<String>,
    Query(q): Query<SnapQuery>,
) -> Response {
    let ok = check_auth(&headers, &st.token)
        || q.token.as_deref() == Some(st.token.as_str());
    if !ok {
        return (StatusCode::UNAUTHORIZED, "unauthorized").into_response();
    }
    let fp: rusqlite::Result<String> = st.app.0.read_conn.lock().query_row(
        "SELECT file_path FROM snapshots WHERE id = ?1",
        [&id],
        |r| r.get(0),
    );
    let Ok(fp) = fp else {
        return (StatusCode::NOT_FOUND, "not found").into_response();
    };
    if fp.is_empty() {
        return (StatusCode::NOT_FOUND, "not found").into_response();
    }
    match std::fs::read(&fp) {
        Ok(data) => Response::builder()
            .status(StatusCode::OK)
            .header(header::CONTENT_TYPE, "image/webp")
            .body(Body::from(data))
            .unwrap()
            .into_response(),
        Err(_) => (StatusCode::NOT_FOUND, "not found").into_response(),
    }
}

#[derive(Deserialize)]
struct WsToken {
    token: String,
}

async fn ws_handler(
    ws: WebSocketUpgrade,
    State(st): State<Arc<DaemonState>>,
    headers: HeaderMap,
    Query(q): Query<WsToken>,
) -> impl IntoResponse {
    let ok = check_auth(&headers, &st.token) || q.token == st.token;
    if !ok {
        return (StatusCode::UNAUTHORIZED, "unauthorized").into_response();
    }
    let mut rx = st.bc.subscribe();
    ws.on_upgrade(move |mut socket: WebSocket| async move {
        loop {
            tokio::select! {
                biased;
                msg = rx.recv() => {
                    match msg {
                        Ok((channel, payload)) => {
                            let v = json!({ "channel": channel, "payload": payload });
                            if socket.send(Message::Text(v.to_string())).await.is_err() {
                                break;
                            }
                        }
                        Err(_) => break,
                    }
                }
                incoming = socket.next() => {
                    match incoming {
                        Some(Ok(Message::Close(_))) | None => break,
                        Some(Ok(_)) => {}
                        Some(Err(_)) => break,
                    }
                }
            }
        }
    })
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    env_logger::Builder::from_env(env_logger::Env::default().default_filter_or("info")).init();

    let token = uuid::Uuid::new_v4().to_string().replace('-', "");

    let (bc_tx, _) = tokio::sync::broadcast::channel::<(String, serde_json::Value)>(256);
    let sink: Arc<dyn timelens_lib::event_sink::EventSink> =
        Arc::new(BroadcastEventSink { tx: bc_tx.clone() });

    let app = bootstrap_core(sink)?;
    let st = Arc::new(DaemonState {
        app,
        token: token.clone(),
        bc: bc_tx,
    });

    let r = Router::new()
        .route("/invoke", post(handle_invoke))
        .route("/events", get(ws_handler))
        .route("/snapshot/:id", get(handle_snapshot))
        .with_state(st.clone());

    let addr = SocketAddr::from(([127, 0, 0, 1], 0));
    let listener = tokio::net::TcpListener::bind(addr).await?;
    let port = listener.local_addr()?.port();

    println!("TIMELENS_DAEMON_READY port={port} token={token}");

    axum::serve(listener, r.into_make_service()).await?;

    Ok(())
}
