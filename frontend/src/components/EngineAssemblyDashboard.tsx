import React, { useMemo, useState } from "react";
import { UploadCloud, Layers, Gauge, AlertCircle, CheckCircle2 } from "lucide-react";
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

type Side = "Left" | "Right";

type RecentPred = {
  time: string;
  predicted_mm: number;
  actual_mm?: number;
  error_mm?: number;
  judgement: "PASS" | "FAIL";
};

export function EngineAssemblyDashboard() {
  const [side, setSide] = useState<Side>("Left");
  const [csvFile, setCsvFile] = useState<File | null>(null);

  const [isLoading, setIsLoading] = useState(false);

  const [result, setResult] = useState<{
    predicted_thickness_mm: number;
    judgement: "PASS" | "FAIL";
  } | null>(null);

  // ✅ 규격(예시): 실제 기준으로 나중에 조정
  const spec = useMemo(() => {
    return { target: 1.2, tol: 0.05, lsl: 1.15, usl: 1.25 };
  }, []);

  // ✅ 최근 예측 로그(초기 더미)
  const [recent, setRecent] = useState<RecentPred[]>([
    { time: "09:00", predicted_mm: 1.21, actual_mm: 1.20, error_mm: 0.01, judgement: "PASS" },
    { time: "10:00", predicted_mm: 1.26, actual_mm: 1.24, error_mm: 0.02, judgement: "FAIL" },
    { time: "11:00", predicted_mm: 1.19, actual_mm: 1.20, error_mm: -0.01, judgement: "PASS" },
    { time: "12:00", predicted_mm: 1.17, actual_mm: 1.18, error_mm: -0.01, judgement: "PASS" },
    { time: "13:00", predicted_mm: 1.23, actual_mm: 1.22, error_mm: 0.01, judgement: "PASS" },
    { time: "14:00", predicted_mm: 1.28, actual_mm: 1.27, error_mm: 0.01, judgement: "FAIL" },
    { time: "15:00", predicted_mm: 1.20, actual_mm: 1.21, error_mm: -0.01, judgement: "PASS" },
  ]);

  const metrics = useMemo(() => {
    const n = recent.length || 1;
    const pass = recent.filter((r) => r.judgement === "PASS").length;
    const fail = recent.filter((r) => r.judgement === "FAIL").length;

    const errs = recent.map((r) => r.error_mm).filter((v): v is number => typeof v === "number");
    const mae = errs.length > 0 ? errs.reduce((a, b) => a + Math.abs(b), 0) / errs.length : undefined;

    const avgPred = recent.reduce((a, b) => a + b.predicted_mm, 0) / n;

    return {
      total: n,
      pass,
      fail,
      passRate: (pass / n) * 100,
      avgPred,
      mae,
    };
  }, [recent]);

  const byTimeChart = useMemo(() => {
    return recent.map((r) => ({
      시간: r.time,
      예측두께: r.predicted_mm,
    }));
  }, [recent]);

  const passFailBar = useMemo(() => {
    return [
      { 구분: "PASS", 건수: metrics.pass },
      { 구분: "FAIL", 건수: metrics.fail },
    ];
  }, [metrics]);

  const alerts = useMemo(() => {
    const lastFail = [...recent].reverse().find((r) => r.judgement === "FAIL");
    const list: { id: number; issue: string; severity: "경고" | "주의"; time: string }[] = [];

    if (lastFail) {
      list.push({
        id: 1,
        issue: `${side} 제품 두께 규격 이탈 감지 (예측 ${lastFail.predicted_mm.toFixed(3)}mm)`,
        severity: "경고",
        time: lastFail.time,
      });
    }

    list.push({
      id: 2,
      issue: "열화상 입력 분포 변화 가능성(드리프트) — 모니터링 필요",
      severity: "주의",
      time: "15:05",
    });

    list.push({
      id: 3,
      issue: "최근 FAIL 증가 구간 존재 — 재학습 후보",
      severity: "주의",
      time: "14:40",
    });

    return list;
  }, [recent, side]);

  // ✅ FastAPI 요청 (실제 연동)
  async function handlePredict() {
    if (!csvFile) {
      alert("CSV 파일을 선택해주세요.");
      return;
    }

    setIsLoading(true);

    try {
      const form = new FormData();
      form.append("side", side); // "Left" | "Right"
      form.append("file", csvFile);

      const res = await fetch("http://localhost:8000/api/v1/smartfactory/windshield", {
        method: "POST",
        body: form,
      });

      if (!res.ok) {
        let detail = `HTTP ${res.status}`;
        try {
          const err = await res.json();
          if (err?.detail) detail = err.detail;
        } catch {}
        throw new Error(detail);
      }

      const data = await res.json();

      setResult({
        predicted_thickness_mm: data.predicted_thickness_mm,
        judgement: data.judgement,
      });

      const nowLabel = new Date().toTimeString().slice(0, 5); // HH:MM
      setRecent((prev) => [
        ...prev.slice(-11),
        {
          time: nowLabel,
          predicted_mm: Number(data.predicted_thickness_mm),
          judgement: data.judgement,
        },
      ]);
    } catch (error: any) {
      console.error("예측 요청 실패:", error);
      alert(`예측 실패: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="p-8">
      {/* Header */}
      <div className="mb-8">
        <h2 className="text-3xl font-bold text-gray-900">윈드실드 사이드 몰딩 공정</h2>
        <p className="text-gray-600 mt-1">
          열화상(256×320, 81,920 feature) 기반 두께(mm) 예측 및 품질 판정
        </p>
      </div>

      {/* Controls + Result */}
      <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-200 mb-8">
        <div className="flex flex-col lg:flex-row gap-4 lg:items-end lg:justify-between">
          <div className="flex flex-col sm:flex-row gap-3 sm:items-end">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">제품 구분</label>
              <div className="inline-flex rounded-lg border border-gray-200 bg-gray-50 p-1">
                {(["Left", "Right"] as Side[]).map((s) => (
                  <button
                    key={s}
                    onClick={() => setSide(s)}
                    className={`px-4 py-2 rounded-md text-sm font-semibold transition ${
                      side === s ? "bg-white shadow-sm text-gray-900" : "text-gray-600 hover:text-gray-900"
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">CSV 업로드</label>
              <div className="flex items-center gap-3">
                <label className="cursor-pointer inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-200 bg-white hover:bg-gray-50">
                  <UploadCloud className="w-4 h-4" />
                  <span className="text-sm">{csvFile ? "파일 변경" : "파일 선택"}</span>
                  <input
                    type="file"
                    accept=".csv"
                    className="hidden"
                    onChange={(e) => setCsvFile(e.target.files?.[0] ?? null)}
                  />
                </label>
                <span className="text-sm text-gray-500">{csvFile ? csvFile.name : "left_data.csv / right_data.csv"}</span>
              </div>
            </div>
          </div>

          {/* ✅ 버튼이 반드시 보이도록 레이아웃 고정 (핵심 수정) */}
          <div className="flex flex-col gap-3 items-stretch lg:items-end">
            <div className="text-sm text-gray-600">
              <div className="font-semibold text-gray-900">규격(예시)</div>
              <div>
                Target {spec.target.toFixed(2)}mm · LSL {spec.lsl.toFixed(2)} · USL {spec.usl.toFixed(2)}
              </div>
            </div>

            <button
              type="button"
              disabled={!csvFile || isLoading}
              onClick={handlePredict}
              className={`w-full lg:w-auto px-5 py-3 rounded-lg font-semibold text-sm transition ${
                !csvFile || isLoading
                  ? "bg-gray-200 text-gray-400 cursor-not-allowed"
                  : "bg-gray-200 text-white hover:bg-gray-800"
              }`}
            >
              {isLoading ? "예측 중..." : "모델 실행"}
            </button>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 bg-gray-50 border border-gray-200 rounded-xl p-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Layers className="w-5 h-5 text-gray-700" />
                <h3 className="text-base font-bold text-gray-900">예측 결과</h3>
              </div>

              {result ? (
                <span
                  className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold ${
                    result.judgement === "PASS" ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"
                  }`}
                >
                  {result.judgement === "PASS" ? (
                    <CheckCircle2 className="w-4 h-4" />
                  ) : (
                    <AlertCircle className="w-4 h-4" />
                  )}
                  {result.judgement}
                </span>
              ) : (
                <span className="text-xs text-gray-500">CSV 업로드 후 “모델 실행”</span>
              )}
            </div>

            <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="bg-white rounded-lg border border-gray-200 p-4">
                <div className="text-xs text-gray-600">예측 두께</div>
                <div className="text-2xl font-bold text-gray-900 mt-1">
                  {result ? `${Number(result.predicted_thickness_mm).toFixed(3)} mm` : "-"}
                </div>
              </div>

              <div className="bg-white rounded-lg border border-gray-200 p-4">
                <div className="text-xs text-gray-600">판정</div>
                <div className="text-2xl font-bold text-gray-900 mt-1">{result ? result.judgement : "-"}</div>
              </div>

              <div className="bg-white rounded-lg border border-gray-200 p-4">
                <div className="text-xs text-gray-600">선택 정보</div>
                <div className="text-sm text-gray-600 mt-1">FastAPI 응답에 confidence/latency 넣으면 여기도 확장 가능</div>
              </div>
            </div>

            <p className="text-xs text-gray-500 mt-4">* 입력: 열화상 raw(256×320) → 81,920차원 벡터 / 라벨: 실측 두께(mm)</p>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
            <div className="flex items-center gap-2 mb-3">
              <Gauge className="w-5 h-5 text-gray-700" />
              <h3 className="text-base font-bold text-gray-900">요약 지표(최근)</h3>
            </div>
            <div className="space-y-3">
              <MetricRow label="최근 샘플 수" value={`${metrics.total}개`} />
              <MetricRow label="PASS 비율" value={`${metrics.passRate.toFixed(1)}%`} />
              <MetricRow label="평균 예측 두께" value={`${metrics.avgPred.toFixed(3)}mm`} />
              <MetricRow
                label="MAE(실측 있을 때)"
                value={metrics.mae != null ? `${metrics.mae.toFixed(3)}mm` : "-"}
                hint="실측 라벨이 함께 있을 때 계산"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-200">
          <h3 className="text-lg font-bold text-gray-900 mb-4">시간대별 예측 두께 추이</h3>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={byTimeChart}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="시간" />
              <YAxis domain={["auto", "auto"]} />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey="예측두께" stroke="#2563eb" strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-200">
          <h3 className="text-lg font-bold text-gray-900 mb-4">PASS / FAIL 분포(최근)</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={passFailBar}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="구분" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Bar dataKey="건수" />
            </BarChart>
          </ResponsiveContainer>
          <p className="text-xs text-gray-500 mt-3">Left/Right는 모델 분리 운영(현재 선택: {side})</p>
        </div>
      </div>

      {/* Alerts */}
      <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-200">
        <h3 className="text-lg font-bold text-gray-900 mb-4">실시간 알림 및 이슈</h3>
        <div className="space-y-3">
          {alerts.map((a) => (
            <div key={a.id} className="flex items-start gap-4 p-4 bg-gray-50 rounded-lg border border-gray-200">
              <div className={`w-2 h-2 mt-2 rounded-full ${a.severity === "경고" ? "bg-red-500" : "bg-yellow-500"}`} />
              <div className="flex-1">
                <div className="flex items-center justify-between mb-1">
                  <span className="font-semibold text-gray-900">{side} 공정</span>
                  <span className="text-sm text-gray-500">{a.time}</span>
                </div>
                <p className="text-sm text-gray-700">{a.issue}</p>
                <span
                  className={`inline-flex mt-2 px-2 py-1 rounded-full text-xs ${
                    a.severity === "경고" ? "bg-red-100 text-red-800" : "bg-yellow-100 text-yellow-800"
                  }`}
                >
                  {a.severity}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function MetricRow({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div>
        <div className="text-sm text-gray-600">{label}</div>
        {hint ? <div className="text-xs text-gray-400 mt-1">{hint}</div> : null}
      </div>
      <div className="text-sm font-bold text-gray-900">{value}</div>
    </div>
  );
}
