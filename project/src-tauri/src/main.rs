#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

// 说明：Tauri 命令注册通过 `tauri::generate_handler!` 在编译期展开，与 async / sync 无关。
// 这里使用同步 `fn main()` 是为了让 `Builder::run()` 以主线程阻塞的方式托管事件循环——
// 这是 Windows 端最稳的姿势（避免把窗口/事件循环错放到 tokio worker 线程上）。
fn main() {
    timelens_lib::run();
}
