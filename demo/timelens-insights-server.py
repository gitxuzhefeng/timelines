#!/usr/bin/env python3
"""
本地只读聚合服务：读取 TimeLens SQLite，为「非 AI 洞察」页面提供 /api/insights。

用法（在任意目录）：
  TIMELENS_DB=/path/to/db.sqlite python3 demo/timelens-insights-server.py
  # 或未设置时使用 ~/.timelens/data/db.sqlite

浏览器打开：
  http://127.0.0.1:18888/timelens-nonai-insights.html
  http://127.0.0.1:18888/timelens-phase2-live.html  （二期主壳 + 本地库）

注意：TimeLens 正在写入时 SQLite 处于 WAL 模式，只读连接一般仍可查询到一致快照。
"""

from __future__ import annotations

import json
import os
import sqlite3
import sys
from datetime import datetime
from http.server import HTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
from urllib.parse import urlparse

DEMO_DIR = Path(__file__).resolve().parent
DEFAULT_DB = Path.home() / ".timelens" / "data" / "db.sqlite"
PORT = int(os.environ.get("TIMELENS_INSIGHTS_PORT", "18888"))


def db_path() -> Path:
    p = os.environ.get("TIMELENS_DB")
    if p:
        return Path(p).expanduser().resolve()
    return DEFAULT_DB


def connect_ro(path: Path) -> sqlite3.Connection:
    # mode=ro 在部分 WAL 场景下可能失败，先尝试普通只读意图
    uri = f"file:{path}?mode=ro"
    try:
        return sqlite3.connect(uri, uri=True, timeout=5.0)
    except sqlite3.OperationalError:
        return sqlite3.connect(path, timeout=5.0)


def table_columns(conn: sqlite3.Connection, table: str) -> set[str]:
    cur = conn.execute(f"PRAGMA table_info({table})")
    return {row[1] for row in cur.fetchall()}


def safe_query(conn: sqlite3.Connection, sql: str, params=()) -> list:
    try:
        return conn.execute(sql, params).fetchall()
    except sqlite3.OperationalError:
        return []


def build_insights(conn: sqlite3.Connection) -> dict:
    tables = {
        r[0]
        for r in conn.execute(
            "SELECT name FROM sqlite_master WHERE type='table'"
        ).fetchall()
    }
    cols_ws = table_columns(conn, "window_sessions")
    has_intent = "intent" in cols_ws

    row = safe_query(
        conn,
        "SELECT COUNT(*), COALESCE(SUM(duration_ms),0), MIN(start_ms), MAX(end_ms) FROM window_sessions",
    )
    n_sessions, total_ms, t_min, t_max = (
        row[0] if row else (0, 0, None, None)
    )

    def fmt_ts(ms: int | None) -> str | None:
        if ms is None:
            return None
        try:
            return datetime.fromtimestamp(ms / 1000.0).strftime("%Y-%m-%d %H:%M")
        except (ValueError, OSError):
            return str(ms)

    top_apps_rows = safe_query(
        conn,
        """
        SELECT app_name, SUM(duration_ms) AS ms, COUNT(*) AS cnt
        FROM window_sessions
        GROUP BY app_name
        ORDER BY ms DESC
        LIMIT 16
        """,
    )
    top_apps = []
    for name, ms, cnt in top_apps_rows:
        share = (ms / total_ms * 100.0) if total_ms else 0.0
        top_apps.append(
            {
                "app_name": name,
                "duration_ms": int(ms),
                "sessions": int(cnt),
                "share_pct": round(share, 1),
            }
        )

    by_hour_rows = safe_query(
        conn,
        """
        SELECT CAST(strftime('%H', start_ms/1000, 'unixepoch', 'localtime') AS INTEGER) AS h,
               SUM(duration_ms) AS ms
        FROM window_sessions
        GROUP BY h
        ORDER BY h
        """,
    )
    hour_map = {h: 0 for h in range(24)}
    for h, ms in by_hour_rows:
        if h is not None:
            hour_map[int(h)] = int(ms)
    by_hour = [{"hour": h, "duration_ms": hour_map[h]} for h in range(24)]

    by_day_rows = safe_query(
        conn,
        """
        SELECT date(start_ms/1000, 'unixepoch', 'localtime') AS d,
               SUM(duration_ms) AS ms, COUNT(*) AS cnt
        FROM window_sessions
        GROUP BY d
        ORDER BY d DESC
        LIMIT 21
        """,
    )
    by_day = [
        {"date": d, "duration_ms": int(ms), "sessions": int(cnt)}
        for d, ms, cnt in by_day_rows
    ]

    intent_breakdown: list[dict] = []
    if has_intent:
        intent_rows = safe_query(
            conn,
            """
            SELECT COALESCE(intent, '(未标注)') AS intent, SUM(duration_ms) AS ms
            FROM window_sessions
            GROUP BY intent
            ORDER BY ms DESC
            """,
        )
        for intent, ms in intent_rows:
            intent_breakdown.append(
                {"intent": intent, "duration_ms": int(ms), "share_pct": round(ms / total_ms * 100, 1) if total_ms else 0}
            )

    top_switches = []
    if "app_switches" in tables:
        sw = safe_query(
            conn,
            """
            SELECT from_app, to_app, COUNT(*) AS c
            FROM app_switches
            GROUP BY from_app, to_app
            ORDER BY c DESC
            LIMIT 14
            """,
        )
        top_switches = [
            {"from_app": a, "to_app": b, "count": int(c)} for a, b, c in sw
        ]

    n_switches = 0
    sw_row = safe_query(conn, "SELECT COUNT(*) FROM app_switches")
    if sw_row:
        n_switches = int(sw_row[0][0])

    deep = safe_query(
        conn,
        """
        SELECT COUNT(*), MAX(duration_ms)
        FROM window_sessions
        WHERE duration_ms >= 1800000
        """,
    )
    deep_n, deep_max = (deep[0] if deep else (0, 0))

    longest = safe_query(
        conn,
        """
        SELECT app_name, window_title, duration_ms
        FROM window_sessions
        ORDER BY duration_ms DESC
        LIMIT 1
        """,
    )
    longest_info = None
    if longest:
        longest_info = {
            "app_name": longest[0][0],
            "window_title": (longest[0][1] or "")[:120],
            "duration_ms": int(longest[0][2]),
        }

    n_shots = 0
    shots_bytes = 0
    shots_by_day: list[dict] = []
    if "snapshots" in tables:
        sr = safe_query(conn, "SELECT COUNT(*), COALESCE(SUM(file_size_bytes),0) FROM snapshots")
        if sr:
            n_shots, shots_bytes = int(sr[0][0]), int(sr[0][1])
        sbd = safe_query(
            conn,
            """
            SELECT date(captured_at_ms/1000, 'unixepoch', 'localtime') AS d,
                   COUNT(*) AS n, COALESCE(SUM(file_size_bytes),0) AS b
            FROM snapshots
            GROUP BY d
            ORDER BY d DESC
            LIMIT 14
            """,
        )
        shots_by_day = [
            {"date": d, "count": int(n), "bytes": int(b)} for d, n, b in sbd
        ]

    n_raw = 0
    if "raw_events" in tables:
        rr = safe_query(conn, "SELECT COUNT(*) FROM raw_events")
        if rr:
            n_raw = int(rr[0][0])

    tracked_hours = total_ms / 3_600_000.0 if total_ms else 0.0
    switches_per_hour = (n_switches / tracked_hours) if tracked_hours > 0.1 else 0.0

    ad_row = safe_query(
        conn,
        """
        SELECT COUNT(DISTINCT date(start_ms/1000, 'unixepoch', 'localtime'))
        FROM window_sessions
        """,
    )
    active_days = int(ad_row[0][0]) if ad_row else 0

    narratives: list[str] = []
    if total_ms <= 0:
        narratives.append("当前库中尚无窗口会话数据；请确认 TimeLens 已采集并写入 ~/.timelens/data/db.sqlite。")
    else:
        if top_apps:
            top = top_apps[0]
            narratives.append(
                f"前台总时长约 **{tracked_hours:.1f} 小时**（按会话累计），其中 **{top['app_name']}** 约占 **{top['share_pct']}%**。"
            )
        if deep_n > 0 and longest_info:
            lm = longest_info["duration_ms"] / 60_000
            narratives.append(
                f"有 **{deep_n}** 段连续前台 ≥30 分钟的会话；最长一段约 **{lm:.0f} 分钟**，在 **{longest_info['app_name']}**。"
            )
        elif longest_info and longest_info["duration_ms"] >= 600_000:
            lm = longest_info["duration_ms"] / 60_000
            narratives.append(
                f"最长单段前台约 **{lm:.0f} 分钟**（{longest_info['app_name']}），尚未达到 30 分钟「深度块」阈值的可统计数量。"
            )
        if n_switches > 0 and tracked_hours > 0.1:
            narratives.append(
                f"应用切换共 **{n_switches}** 次，折合约 **{switches_per_hour:.1f} 次/小时**（粗略碎片化指标，非二期 AI 结论）。"
            )
        if top_switches:
            e = top_switches[0]
            narratives.append(
                f"最高频切换路径：**{e['from_app']} → {e['to_app']}**（{e['count']} 次）。"
            )
        if intent_breakdown and intent_breakdown[0]["intent"] != "(未标注)":
            narratives.append(
                f"按内置意图规则，时长最多的是 **{intent_breakdown[0]['intent']}**（{intent_breakdown[0]['share_pct']}%）。"
            )
        elif has_intent:
            narratives.append(
                "**意图字段**均为空：可在库中配置 `intent_mapping` 后由聚合管道写入，或等待后续版本接入规则表。"
            )
        if n_shots:
            narratives.append(
                f"截图元数据 **{n_shots}** 条，磁盘约 **{shots_bytes / (1024*1024):.1f} MB**（仅统计库内记录大小）。"
            )

    optional = [
        "input_metrics",
        "clipboard_flows",
        "notifications",
        "ambient_context",
        "intent_mapping",
        "settings",
    ]
    missing_optional = [t for t in optional if t not in tables]

    chronological_days = list(reversed(by_day))
    phase2 = _build_phase2_payload(conn, tables, chronological_days)

    return {
        "generated_at": datetime.now().isoformat(timespec="seconds"),
        "db_path": str(db_path()),
        "available_tables": sorted(tables),
        "missing_optional_tables": missing_optional,
        "tables_note": "若缺少 input_metrics / clipboard_flows 等表，输入与剪贴板类洞察需在对应采集上线后展示。",
        "range": {
            "min_ms": t_min,
            "max_ms": t_max,
            "min_label": fmt_ts(t_min),
            "max_label": fmt_ts(t_max),
        },
        "totals": {
            "window_sessions": int(n_sessions),
            "tracked_duration_ms": int(total_ms),
            "tracked_hours": round(tracked_hours, 2),
            "app_switches": n_switches,
            "snapshots": n_shots,
            "raw_events": n_raw,
        },
        "top_apps": top_apps,
        "by_hour": by_hour,
        "by_day": list(reversed(by_day)),
        "intent_breakdown": intent_breakdown,
        "top_switches": top_switches,
        "deep_work": {
            "sessions_ge_30m": int(deep_n),
            "longest_session_ms": int(deep_max or 0),
        },
        "longest_session": longest_info,
        "fragmentation": {
            "switches_per_hour": round(switches_per_hour, 2),
            "active_days_in_window": active_days,
        },
        "snapshots_by_day": shots_by_day,
        "rule_narratives": narratives,
        "phase2": phase2,
    }


LENS_PRESETS = [
    {
        "id": "developer",
        "label": "开发者",
        "hint": "长块、IDE / 终端 / 浏览器结构",
    },
    {
        "id": "freelance",
        "label": "自由职业",
        "hint": "对客户可说明的时间",
    },
    {
        "id": "pm",
        "label": "协调者 PM",
        "hint": "切换、通讯、通知榜",
    },
    {
        "id": "creator",
        "label": "创作者",
        "hint": "调研 vs 产出",
    },
    {
        "id": "interruptible",
        "label": "易打断",
        "hint": "打断前后锚点",
    },
    {
        "id": "slow_review",
        "label": "慢复盘",
        "hint": "周趋势、大类占比",
    },
]


def _build_phase2_payload(
    conn: sqlite3.Connection, tables: set[str], chronological_days: list[dict]
) -> dict:
    """二期 PRD：在只读库上扩展泳道、五维降级块、周对比等（无 LLM）。"""
    out: dict = {
        "lens_presets": LENS_PRESETS,
        "sessions_swimlane": [],
        "snapshot_filmstrip": [],
        "notifications_breakdown": None,
        "clipboard_top_paths": None,
        "input_rhythm_hourly": None,
        "ambient_hourly": None,
        "week_over_week": None,
        "calibration_stub": {
            "note": "合并 / 拆分会话与标签修正为 P0 能力；此处为效果占位，不写回数据库。",
        },
    }

    if "window_sessions" in tables:
        lane_rows = safe_query(
            conn,
            """
            SELECT id, start_ms, end_ms, duration_ms, app_name,
                   COALESCE(intent, '') AS intent,
                   COALESCE(window_title, '') AS window_title
            FROM window_sessions
            ORDER BY start_ms DESC
            LIMIT 100
            """,
        )
        rows = [
            {
                "id": r[0],
                "start_ms": int(r[1]),
                "end_ms": int(r[2]),
                "duration_ms": int(r[3]),
                "app_name": r[4],
                "intent": r[5] or "",
                "window_title": (r[6] or "")[:80],
            }
            for r in lane_rows
        ]
        rows.reverse()
        if rows:
            t0 = min(x["start_ms"] for x in rows)
            t1 = max(x["end_ms"] for x in rows)
            span = max(t1 - t0, 1)
            for x in rows:
                x["rel_start"] = round((x["start_ms"] - t0) / span, 4)
                x["rel_width"] = round(max(x["duration_ms"], 1) / span, 4)
        out["sessions_swimlane"] = rows
        out["swimlane_range"] = (
            {"start_ms": t0, "end_ms": t1}
            if rows
            else None
        )

    if "snapshots" in tables:
        shot_rows = safe_query(
            conn,
            """
            SELECT captured_at_ms, COALESCE(perceptual_hash, '') AS ph,
                   session_id, file_path
            FROM snapshots
            ORDER BY captured_at_ms DESC
            LIMIT 72
            """,
        )
        strip: list[dict] = []
        prev_ph = None
        fold_count = 0
        for cap_ms, ph, sid, fpath in shot_rows:
            ph = ph or ""
            if ph and ph == prev_ph:
                fold_count += 1
                continue
            if fold_count and strip:
                strip[-1]["collapsed_duplicates_after"] = fold_count
            fold_count = 0
            prev_ph = ph
            strip.append(
                {
                    "captured_at_ms": int(cap_ms),
                    "perceptual_hash": ph[:16] + ("…" if len(ph) > 16 else ""),
                    "session_id": sid,
                    "file_path": fpath,
                    "collapsed_duplicates_after": 0,
                }
            )
        if fold_count and strip:
            strip[-1]["collapsed_duplicates_after"] = fold_count
        strip.reverse()
        out["snapshot_filmstrip"] = strip

    if "notifications" in tables:
        nb = safe_query(
            conn,
            """
            SELECT source_app,
                   COUNT(*) AS n,
                   AVG(CASE WHEN response_delay_ms IS NOT NULL
                       THEN response_delay_ms END) AS avg_delay,
                   SUM(COALESCE(caused_switch, 0)) AS caused_sw
            FROM notifications
            GROUP BY source_app
            ORDER BY n DESC
            LIMIT 14
            """,
        )
        total_n = sum(int(x[1]) for x in nb) if nb else 0
        breakdown = []
        for app, n, avg_d, caused in nb:
            n = int(n)
            breakdown.append(
                {
                    "source_app": app,
                    "count": n,
                    "share_pct": round(n / total_n * 100, 1) if total_n else 0,
                    "avg_response_delay_ms": round(avg_d, 0) if avg_d is not None else None,
                    "caused_switch_count": int(caused or 0),
                    "caused_switch_pct": round(
                        int(caused or 0) / n * 100, 1
                    )
                    if n
                    else 0,
                }
            )
        out["notifications_breakdown"] = breakdown

    if "clipboard_flows" in tables:
        paths = safe_query(
            conn,
            """
            SELECT c.app_name, p.app_name, COUNT(*) AS cnt
            FROM clipboard_flows c
            INNER JOIN clipboard_flows p
              ON c.flow_pair_id = p.flow_pair_id
             AND c.flow_pair_id IS NOT NULL
            WHERE c.action = 'copy' AND p.action = 'paste'
            GROUP BY c.app_name, p.app_name
            ORDER BY cnt DESC
            LIMIT 14
            """,
        )
        if paths:
            out["clipboard_top_paths"] = [
                {"from_app": a, "to_app": b, "count": int(c)} for a, b, c in paths
            ]
        else:
            ct = safe_query(
                conn,
                """
                SELECT action, app_name, COUNT(*) AS n
                FROM clipboard_flows
                GROUP BY action, app_name
                ORDER BY n DESC
                LIMIT 20
                """,
            )
            out["clipboard_top_paths"] = []
            out["clipboard_by_action_app"] = [
                {"action": a, "app_name": b, "count": int(n)} for a, b, n in ct
            ]

    if "input_metrics" in tables:
        ih = safe_query(
            conn,
            """
            SELECT CAST(strftime('%H', timestamp_ms/1000, 'unixepoch', 'localtime') AS INTEGER) AS h,
                   AVG(kpm) AS akpm,
                   AVG(COALESCE(delete_ratio, 0)) AS adr,
                   COUNT(*) AS samples
            FROM input_metrics
            GROUP BY h
            ORDER BY h
            """,
        )
        sparse_in: dict[int, dict] = {}
        for h, akpm, adr, samples in ih:
            if h is None:
                continue
            hi = int(h)
            kpmv = float(akpm) if akpm is not None else 0.0
            if kpmv >= 180:
                tier = "高节奏"
            elif kpmv >= 80:
                tier = "中等"
            elif kpmv > 0:
                tier = "低节奏"
            else:
                tier = "静息"
            sparse_in[hi] = {
                "hour": hi,
                "avg_kpm": round(kpmv, 1),
                "avg_delete_ratio": round(float(adr or 0), 3),
                "samples": int(samples),
                "tier_label": tier,
            }
        out["input_rhythm_hourly"] = [
            sparse_in.get(h)
            or {
                "hour": h,
                "avg_kpm": 0.0,
                "avg_delete_ratio": 0.0,
                "samples": 0,
                "tier_label": "无样本",
            }
            for h in range(24)
        ]

    if "ambient_context" in tables:
        amb = safe_query(
            conn,
            """
            SELECT CAST(strftime('%H', timestamp_ms/1000, 'unixepoch', 'localtime') AS INTEGER) AS h,
                   AVG(COALESCE(battery_level, 0)) AS abat,
                   AVG(CAST(COALESCE(is_external_display, 0) AS REAL)) AS ext,
                   AVG(CAST(COALESCE(is_dnd_enabled, 0) AS REAL)) AS dnd,
                   COUNT(*) AS samples
            FROM ambient_context
            GROUP BY h
            ORDER BY h
            """,
        )
        sparse_a = {}
        for h, abat, ext, dnd, samples in amb:
            if h is None:
                continue
            sparse_a[int(h)] = {
                "hour": int(h),
                "avg_battery": round(float(abat or 0), 3),
                "external_display_ratio": round(float(ext or 0), 3),
                "dnd_ratio": round(float(dnd or 0), 3),
                "samples": int(samples),
            }
        out["ambient_hourly"] = [
            sparse_a.get(h)
            or {
                "hour": h,
                "avg_battery": None,
                "external_display_ratio": None,
                "dnd_ratio": None,
                "samples": 0,
            }
            for h in range(24)
        ]

    if len(chronological_days) >= 14:
        prev7 = chronological_days[-14:-7]
        last7 = chronological_days[-7:]
        p_ms = sum(d["duration_ms"] for d in prev7)
        l_ms = sum(d["duration_ms"] for d in last7)
        delta = l_ms - p_ms
        pct = (delta / p_ms * 100.0) if p_ms else None
        out["week_over_week"] = {
            "available": True,
            "prev7_label": prev7[0]["date"] + " → " + prev7[-1]["date"],
            "last7_label": last7[0]["date"] + " → " + last7[-1]["date"],
            "prev7_tracked_ms": p_ms,
            "last7_tracked_ms": l_ms,
            "delta_ms": delta,
            "delta_pct": round(pct, 1) if pct is not None else None,
        }
    elif chronological_days:
        out["week_over_week"] = {
            "available": False,
            "reason": "按日数据不足 14 天，周对比已降级。",
        }

    return out


class InsightsHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(DEMO_DIR), **kwargs)

    def do_GET(self):
        parsed = urlparse(self.path)
        if parsed.path == "/api/insights":
            self._send_json()
            return
        return super().do_GET()

    def _send_json(self):
        path = db_path()
        if not path.is_file():
            body = {
                "error": "database_not_found",
                "detail": str(path),
                "hint": "设置环境变量 TIMELENS_DB 指向 db.sqlite，或确认 TimeLens 已生成数据目录。",
            }
            raw = json.dumps(body, ensure_ascii=False).encode("utf-8")
            self.send_response(404)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(raw)))
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(raw)
            return

        try:
            conn = connect_ro(path)
            try:
                payload = build_insights(conn)
            finally:
                conn.close()
            raw = json.dumps(payload, ensure_ascii=False).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(raw)))
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(raw)
        except sqlite3.Error as e:
            body = json.dumps(
                {"error": "sqlite_error", "detail": str(e)}, ensure_ascii=False
            ).encode("utf-8")
            self.send_response(500)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

    def log_message(self, fmt, *args):
        sys.stderr.write("%s - %s\n" % (self.address_string(), fmt % args))


def main() -> None:
    httpd = HTTPServer(("127.0.0.1", PORT), InsightsHandler)
    db = db_path()
    print(
        f"TimeLens 本地洞察服务\n"
        f"  · 非 AI 总览  http://127.0.0.1:{PORT}/timelens-nonai-insights.html\n"
        f"  · 二期实况    http://127.0.0.1:{PORT}/timelens-phase2-live.html"
    )
    print(f"数据库（只读）: {db}  {'✓' if db.is_file() else '✗ 未找到'}")
    print("Ctrl+C 停止")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n已停止")


if __name__ == "__main__":
    main()
