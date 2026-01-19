import React, { useMemo, useRef, useState } from "react";
import { Package, Clock, AlertCircle, TrendingUp } from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  LineChart,
  Line,
} from "recharts";

/**
 * NOTE (중요):
 * 브라우저 표준 EventSource는 GET만 지원해서,
 * "파일 업로드 + SSE 수신"을 한 요청으로 처리하기가 어렵다.
 *
 * 그래서 권장 패턴은:
 * 1) 파일 업로드(POST) -> 서버가 job_id 발급
 * 2) EventSource로 GET /stream?job_id=... 구독
 *
 * 하지만 너희 백엔드는 현재 POST + multipart로 stream을 보내는 형태라서,
 * 아래는 "fetch 스트림(ReadableStream)으로 SSE 파싱" 방식으로 구현했다.
 * (프론트에서 실시간처럼 보이게 하는 목적은 동일)
 */

type RowResult = {
  type: "row";
  row_index: number;
  predicted_thickness_mm: number;
  judgement: "PASS" | "FAIL";
  ts: number;
};

type StreamEvent =
  | { type: "start"; ts: number }
  | RowResult
  | { type: "end"; total_rows: number; ts: number }
  | { type: "error"; message: string; ts: number };

function formatMm(v: number) {
  if (Number.isNaN(v)) return "-";
  return `${v.toFixed(3)} mm`;
}

export function EngineAssemblyDashboard() {
  // ====== Settings ======
  const API_BASE = ""; // 같은 도메인이면 "", 아니면 "http://localhost:8000" 등
  const [side, setSide] = useState<"left" | "right">("left");
  const [intervalMs, setIntervalMs] = useState<number>(1000);
  const [file, setFile] = useState<File | null>(null);

  // 규격(예시) -> 지금 이상하다고 했으니 현실적인 형태로 UI에 명시
  // 백엔드의 LSL/USL 환경변수랑 맞추거나, 프론트에서 보여주는 용도로만 사용
  const [lsl, setLsl] = useState<number>(0.8);
  const [usl, setUsl] = useState<number>(1.5);

  // ====== Stream State ======
  const [status, setStatus] = useState<
    "idle" | "running" | "done" | "error" | "stopped"
  >("idle");
  const [message, setMessage] = useState<string>("");
  const [rows, setRows] = useState<RowResult[]>([]);
  const abortRef = useRef<AbortController | null>(null);

  // ====== Metrics ======
  const metrics = useMemo(() => {
    const total = rows.length;
    const pass = rows.filter((r) => r.judgement === "PASS").length;
    const fail = total - pass;

    const avg =
      total > 0
        ? rows.reduce((acc, r) => acc + r.predicted_thickness_mm, 0) / total
        : 0;

    // 간단한 추세(최근 10개 평균 - 이전 10개 평균)
    const last = rows.slice(-10);
    const prev = rows.slice(-20, -10);
    const lastAvg =
      last.length > 0
        ? last.reduce((a, r) => a + r.predicted_thickness_mm, 0) / last.length
        : 0;
    const prevAvg =
      prev.length > 0
        ? prev.reduce((a, r) => a + r.predicted_thickness_mm, 0) / prev.length
        : 0;

    const trendDelta = lastAvg - prevAvg; // +면 증가 추세

    return { total, pass, fail, avg, trendDelta };
  }, [rows]);

  // ====== Charts data ======
  const thicknessSeries = useMemo(() => {
    // 차트는 너무 길어지면 무거워지니 최근 60개만
    return rows.slice(-60).map((r) => ({
      행: r.row_index,
      두께: r.predicted_thickness_mm,
      판정: r.judgement,
    }));
  }, [rows]);

  const passFailBar = useMemo(() => {
    return [
      { 구분: "PASS", 건수: metrics.pass },
      { 구분: "FAIL", 건수: metrics.fail },
    ];
  }, [metrics.pass, metrics.fail]);

  // ====== Actions ======
  function reset() {
    setRows([]);
    setStatus("idle");
    setMessage("");
  }

  function stop() {
    abortRef.current?.abort();
    abortRef.current = null;
    setStatus("stopped");
    setMessage("검사를 중지했습니다.");
  }

  async function startStream() {
    if (!file) {
      setStatus("error");
      setMessage("CSV 파일을 선택해 주세요.");
      return;
    }
    if (lsl >= usl) {
      setStatus("error");
      setMessage("규격 범위를 확인해 주세요. (LSL < USL)");
      return;
    }

    // 기존 진행 중이면 중지
    abortRef.current?.abort();

    setRows([]);
    setStatus("running");
    setMessage("검사를 시작합니다...");

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const fd = new FormData();
      fd.append("side", side);
      fd.append("interval_ms", String(intervalMs));
      fd.append("file", file);

      const res = await fetch(`${API_BASE}/api/v1/smartfactory/windshield/stream`, {
        method: "POST",
        body: fd,
        signal: controller.signal,
        headers: {
          // SSE는 보통 Accept 지정해주는 게 좋음
          Accept: "text/event-stream",
        },
      });

      if (!res.ok || !res.body) {
        throw new Error(`서버 오류: ${res.status}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder("utf-8");
      let buffer = "";

      // SSE는 "\n\n" 단위로 이벤트가 끊김
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        let idx;
        while ((idx = buffer.indexOf("\n\n")) !== -1) {
          const chunk = buffer.slice(0, idx);
          buffer = buffer.slice(idx + 2);

          // chunk 예:
          // data: {...}
          // 또는
          // event: start
          // data: {...}

          const lines = chunk.split("\n").map((l) => l.trim());
          const dataLine = lines.find((l) => l.startsWith("data:"));
          if (!dataLine) continue;

          const jsonStr = dataLine.replace(/^data:\s*/, "");
          let ev: StreamEvent | null = null;

          try {
            ev = JSON.parse(jsonStr);
          } catch {
            continue;
          }

          if (!ev) continue;

          if (ev.type === "start") {
            setMessage("모델 검사 진행 중...");
          } else if (ev.type === "row") {
            // (옵션) 프론트 규격과의 비교도 같이 보여주고 싶으면 여기서 판단 가능
            // 하지만 실제 판정은 백엔드 judgement를 우선 신뢰.
            setRows((prev) => [...prev, ev as RowResult]);
          } else if (ev.type === "end") {
            setStatus("done");
            setMessage(`검사 완료: 총 ${ev.total_rows}행 처리`);
            abortRef.current = null;
          } else if (ev.type === "error") {
            setStatus("error");
            setMessage(ev.message);
            abortRef.current = null;
          }
        }
      }
    } catch (e: any) {
      if (e?.name === "AbortError") return;
      setStatus("error");
      setMessage(e?.message ?? "알 수 없는 오류");
      abortRef.current = null;
    }
  }

  // ====== UI ======
  return (
    <div className="p-8">
      <div className="mb-8 flex flex-col gap-2">
        <h2 className="text-3xl font-bold text-gray-900">윈드실드 두께 검사</h2>
        <p className="text-gray-600">
          CSV 전체 행을 순차 예측하고, 1~2초 간격으로 결과를 실시간 표시합니다.
        </p>

        {/* Control Panel */}
        <div className="mt-4 bg-white rounded-xl shadow-sm p-6 border border-gray-200">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-end">
            <div className="lg:col-span-2">
              <label className="text-sm text-gray-600">측면</label>
              <select
                className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2"
                value={side}
                onChange={(e) => setSide(e.target.value as "left" | "right")}
                disabled={status === "running"}
              >
                <option value="left">Left</option>
                <option value="right">Right</option>
              </select>
            </div>

            <div className="lg:col-span-2">
              <label className="text-sm text-gray-600">간격(ms)</label>
              <select
                className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2"
                value={intervalMs}
                onChange={(e) => setIntervalMs(Number(e.target.value))}
                disabled={status === "running"}
              >
                <option value={0}>0 (즉시)</option>
                <option value={500}>500</option>
                <option value={1000}>1000 (1초)</option>
                <option value={2000}>2000 (2초)</option>
              </select>
            </div>

            <div className="lg:col-span-3">
              <label className="text-sm text-gray-600">CSV 파일</label>
              <input
                type="file"
                accept=".csv,text/csv"
                className="mt-1 w-full"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                disabled={status === "running"}
              />
              <p className="text-xs text-gray-500 mt-1">
                * 각 행(row)이 1개의 샘플(측정값)이라고 가정합니다.
              </p>
            </div>

            <div className="lg:col-span-3">
              <label className="text-sm text-gray-600">규격 (mm)</label>
              <div className="mt-1 grid grid-cols-2 gap-2">
                <div>
                  <input
                    type="number"
                    step="0.001"
                    value={lsl}
                    onChange={(e) => setLsl(Number(e.target.value))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2"
                    disabled={status === "running"}
                  />
                  <p className="text-xs text-gray-500 mt-1">LSL</p>
                </div>
                <div>
                  <input
                    type="number"
                    step="0.001"
                    value={usl}
                    onChange={(e) => setUsl(Number(e.target.value))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2"
                    disabled={status === "running"}
                  />
                  <p className="text-xs text-gray-500 mt-1">USL</p>
                </div>
              </div>
              <p className="text-xs text-gray-500 mt-1">
                * 백엔드 환경변수(Lsl/Usl)와 맞춰 주세요.
              </p>
            </div>

            <div className="lg:col-span-2 flex gap-2">
              <button
                onClick={startStream}
                disabled={status === "running"}
                className="flex-1 rounded-lg px-4 py-2 bg-black text-white disabled:opacity-50"
              >
                시작
              </button>
              <button
                onClick={stop}
                disabled={status !== "running"}
                className="rounded-lg px-4 py-2 border border-gray-300 disabled:opacity-50"
              >
                중지
              </button>
              <button
                onClick={reset}
                disabled={status === "running"}
                className="rounded-lg px-4 py-2 border border-gray-300 disabled:opacity-50"
              >
                초기화
              </button>
            </div>
          </div>

          <div className="mt-4 text-sm">
            <span
              className={`inline-flex items-center gap-2 px-3 py-1 rounded-full ${
                status === "running"
                  ? "bg-blue-100 text-blue-800"
                  : status === "done"
                  ? "bg-green-100 text-green-800"
                  : status === "error"
                  ? "bg-red-100 text-red-800"
                  : status === "stopped"
                  ? "bg-gray-100 text-gray-800"
                  : "bg-gray-100 text-gray-800"
              }`}
            >
              {status === "running"
                ? "진행 중"
                : status === "done"
                ? "완료"
                : status === "error"
                ? "오류"
                : status === "stopped"
                ? "중지"
                : "대기"}
            </span>
            <span className="ml-3 text-gray-700">{message}</span>
          </div>
        </div>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">처리 행 수</p>
              <p className="text-3xl font-bold text-gray-900 mt-2">
                {metrics.total}건
              </p>
            </div>
            <div className="w-12 h-12 bg-gray-100 rounded-lg flex items-center justify-center">
              <Package className="w-6 h-6 text-gray-700" />
            </div>
          </div>
          <p className="text-xs text-gray-600 mt-4">
            측면: {side.toUpperCase()} / 간격: {intervalMs}ms
          </p>
        </div>

        <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">평균 예측 두께</p>
              <p className="text-3xl font-bold text-gray-900 mt-2">
                {metrics.total ? metrics.avg.toFixed(3) : "0.000"}mm
              </p>
            </div>
            <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
              <Clock className="w-6 h-6 text-blue-600" />
            </div>
          </div>
          <p className="text-xs text-gray-600 mt-4">
            규격: {lsl} ~ {usl} mm
          </p>
        </div>

        <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">FAIL 건수</p>
              <p className="text-3xl font-bold text-gray-900 mt-2">
                {metrics.fail}건
              </p>
            </div>
            <div className="w-12 h-12 bg-red-100 rounded-lg flex items-center justify-center">
              <AlertCircle className="w-6 h-6 text-red-600" />
            </div>
          </div>
          <p className="text-xs text-red-600 mt-4">
            FAIL 비율:{" "}
            {metrics.total ? ((metrics.fail / metrics.total) * 100).toFixed(1) : "0.0"}%
          </p>
        </div>

        <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">두께 추세</p>
              <p className="text-3xl font-bold text-gray-900 mt-2">
                {metrics.trendDelta >= 0 ? "+" : ""}
                {metrics.trendDelta.toFixed(4)}
              </p>
            </div>
            <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center">
              <TrendingUp className="w-6 h-6 text-purple-600" />
            </div>
          </div>
          <p className="text-xs text-gray-600 mt-4">
            최근 10개 평균 - 이전 10개 평균
          </p>
        </div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-200">
          <h3 className="text-lg font-bold text-gray-900 mb-4">
            행 순서별 예측 두께 추이 (최근 60개)
          </h3>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={thicknessSeries}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="행" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey="두께" stroke="#3b82f6" strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
          <p className="text-xs text-gray-500 mt-2">
            * 판정(PASS/FAIL)은 하단 “실시간 결과”에서 확인
          </p>
        </div>

        <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-200">
          <h3 className="text-lg font-bold text-gray-900 mb-4">PASS / FAIL 누적</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={passFailBar}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="구분" />
              <YAxis allowDecimals={false} />
              <Tooltip />
              <Legend />
              <Bar dataKey="건수" fill="#94a3b8" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Real-time Results */}
      <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-200">
        <h3 className="text-lg font-bold text-gray-900 mb-4">실시간 결과 (행 단위)</h3>

        <div className="overflow-auto border border-gray-200 rounded-lg">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3">행</th>
                <th className="text-left px-4 py-3">예측 두께</th>
                <th className="text-left px-4 py-3">판정</th>
                <th className="text-left px-4 py-3">시간</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td className="px-4 py-4 text-gray-500" colSpan={4}>
                    아직 결과가 없습니다. CSV 업로드 후 시작을 눌러주세요.
                  </td>
                </tr>
              ) : (
                rows
                  .slice()
                  .reverse()
                  .slice(0, 200) // 화면엔 최근 200개만 표시
                  .map((r) => (
                    <tr key={`${r.row_index}-${r.ts}`} className="border-b border-gray-100">
                      <td className="px-4 py-3 font-medium">{r.row_index}</td>
                      <td className="px-4 py-3">{formatMm(r.predicted_thickness_mm)}</td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex px-2 py-1 rounded-full text-xs ${
                            r.judgement === "PASS"
                              ? "bg-green-100 text-green-800"
                              : "bg-red-100 text-red-800"
                          }`}
                        >
                          {r.judgement}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-500">
                        {new Date(r.ts * 1000).toLocaleTimeString()}
                      </td>
                    </tr>
                  ))
              )}
            </tbody>
          </table>
        </div>

        <p className="text-xs text-gray-500 mt-3">
          * 서버가 보내는 순서대로 결과가 추가되며, 화면에는 최근 항목부터 표시됩니다.
        </p>
      </div>
    </div>
  );
}
