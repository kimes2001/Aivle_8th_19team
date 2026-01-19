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
type Pred01 = 0 | 1;

type RecentPred = {
  time: string; // ✅ HH:MM:SS
  prediction: Pred01; // 0/1 (내부 저장)
  judgement: "PASS" | "FAIL"; // ✅ 화면은 PASS/FAIL만 표시
};

function predToJudgement(pred: Pred01): "PASS" | "FAIL" {
  // ✅ 기준: 1=PASS, 0=FAIL
  return pred === 1 ? "PASS" : "FAIL";
}

function nowHHMMSS(): string {
  // ✅ 초 단위 시간 라벨 (HH:MM:SS)
  return new Date().toLocaleTimeString("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export function EngineAssemblyDashboard() {
  const [side, setSide] = useState<Side>("Left");
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const [result, setResult] = useState<{
    prediction: Pred01;
    judgement: "PASS" | "FAIL";
  } | null>(null);

  // ✅ 최근 예측 로그(초기 더미도 초 단위)
  const [recent, setRecent] = useState<RecentPred[]>([
    { time: "09:00:00", prediction: 1, judgement: "PASS" },
    { time: "10:00:00", prediction: 0, judgement: "FAIL" },
    { time: "11:00:00", prediction: 1, judgement: "PASS" },
    { time: "12:00:00", prediction: 1, judgement: "PASS" },
    { time: "13:00:00", prediction: 1, judgement: "PASS" },
    { time: "14:00:00", prediction: 0, judgement: "FAIL" },
    { time: "15:00:00", prediction: 1, judgement: "PASS" },
  ]);

  const metrics = useMemo(() => {
    const n = recent.length || 1;
    const pass = recent.filter((r) => r.judgement === "PASS").length;
    const fail = recent.filter((r) => r.judgement === "FAIL").length;

    return {
      total: n,
      pass,
      fail,
      passRate: (pass / n) * 100,
    };
  }, [recent]);

  // ✅ 차트용: PASS=1, FAIL=0으로 내부 변환(표시는 PASS/FAIL)
  const byTimeChart = useMemo(() => {
    return recent.map((r) => ({
      시간: r.time, // ✅ HH:MM:SS
      상태: r.judgement === "PASS" ? 1 : 0,
    }));
  }, [recent]);

  const passFailBar = useMemo(() => {
    return [
      { 구분: "PASS", 건수: metrics.pass },
      { 구분: "FAIL", 건수: metrics.fail },
    ];
  }, [metrics]);

  // ✅ 실시간 알림도 "초 단위"로 표시되도록 구성
  const alerts = useMemo(() => {
    const lastFail = [...recent].reverse().find((r) => r.judgement === "FAIL");
    const list: { id: number; issue: string; severity: "경고" | "주의"; time: string }[] = [];

    if (lastFail) {
      list.push({
        id: 1,
        issue: `${side} 제품 이상 감지 (판정 FAIL)`,
        severity: "경고",
        time: lastFail.time, // ✅ FAIL 발생 시각(초 단위)
      });
    }

    // 참고용 "주의" 알림들도 초 단위로 표기(실데이터 붙이면 여기 로직도 바꾸면 됨)
    list.push({
      id: 2,
      issue: "입력 분포 변화 가능성(드리프트) — 모니터링 필요",
      severity: "주의",
      time: nowHHMMSS(), // ✅ 현재시각(초 단위)
    });

    list.push({
      id: 3,
      issue: "최근 FAIL 증가 구간 존재 — 재학습 후보",
      severity: "주의",
      time: nowHHMMSS(), // ✅ 현재시각(초 단위)
    });

    return list;
  }, [recent, side]);

  // ✅ FastAPI 요청 (prediction 0/1 + judgement)
  async function handlePredict() {
    if (!csvFile) {
      alert("CSV 파일을 선택해주세요.");
      return;
    }

    setIsLoading(true);

    try {
      const form = new FormData();
      form.append("side", side.toLowerCase()); // 백엔드: left/right
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
      console.log("API response:", data);

      const rawPred = Number(data?.prediction);
      if (!(rawPred === 0 || rawPred === 1)) {
        throw new Error(`예상치 못한 prediction 값: ${data?.prediction}`);
      }
      const prediction = rawPred as Pred01;

      const rawJudgement = data?.judgement;
      const judgement: "PASS" | "FAIL" =
        rawJudgement === "PASS" || rawJudgement === "FAIL" ? rawJudgement : predToJudgement(prediction);

      setResult({ prediction, judgement });

      // ✅ 초 단위 시간 라벨
      const nowLabel = nowHHMMSS();

      // ✅ (기존처럼 12개 제한 걸고 싶으면 slice 로직을 다시 넣으면 됨)
      setRecent((prev) => [...prev, { time: nowLabel, prediction, judgement }]);
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
        <p className="text-gray-600 mt-1">CSV 입력 기반 품질 분류(0/1) → PASS/FAIL 표시 (초 단위)</p>
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

          <div className="flex flex-col gap-3 items-stretch lg:items-end">
            <div className="text-sm text-gray-600">
              <div className="font-semibold text-gray-900">표시 정책</div>
              <div>0/1은 내부 저장만, 화면은 PASS/FAIL만 표시 · 시간은 HH:MM:SS</div>
            </div>

            <button
              type="button"
              disabled={!csvFile || isLoading}
              onClick={handlePredict}
              className={`w-full lg:w-auto px-5 py-3 rounded-lg font-semibold text-sm transition ${
                !csvFile || isLoading
                  ? "bg-gray-200 text-gray-400 cursor-not-allowed"
                  : "bg-gray-800 text-white hover:bg-gray-900"
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
                  {result.judgement === "PASS" ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
                  {result.judgement}
                </span>
              ) : (
                <span className="text-xs text-gray-500">CSV 업로드 후 “모델 실행”</span>
              )}
            </div>

            <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-4">
              {/* ✅ 0/1 숨기고 PASS/FAIL만 표시 */}
              <div className="bg-white rounded-lg border border-gray-200 p-4">
                <div className="text-xs text-gray-600">판정 결과</div>
                <div className="text-2xl font-bold text-gray-900 mt-1">{result ? result.judgement : "-"}</div>
              </div>

              <div className="bg-white rounded-lg border border-gray-200 p-4">
                <div className="text-xs text-gray-600">선택 정보</div>
                <div className="text-sm text-gray-600 mt-1">현재: {side} 모델 사용</div>
              </div>

              <div className="bg-white rounded-lg border border-gray-200 p-4">
                <div className="text-xs text-gray-600">시간</div>
                <div className="text-sm text-gray-600 mt-1">{nowHHMMSS()}</div>
              </div>
            </div>

            <p className="text-xs text-gray-500 mt-4">
              * 백엔드 응답: prediction(0/1) + judgement(PASS/FAIL) / UI는 judgement만 표시 / 시간은 초 단위
            </p>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
            <div className="flex items-center gap-2 mb-3">
              <Gauge className="w-5 h-5 text-gray-700" />
              <h3 className="text-base font-bold text-gray-900">요약 지표(최근)</h3>
            </div>
            <div className="space-y-3">
              <MetricRow label="최근 샘플 수" value={`${metrics.total}개`} />
              <MetricRow label="PASS 비율" value={`${metrics.passRate.toFixed(1)}%`} />
              <MetricRow label="PASS 건수" value={`${metrics.pass}개`} />
              <MetricRow label="FAIL 건수" value={`${metrics.fail}개`} />
            </div>
          </div>
        </div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-200">
          <h3 className="text-lg font-bold text-gray-900 mb-4">시간대별 판정 추이 (초 단위)</h3>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={byTimeChart}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="시간" interval="preserveStartEnd" />
              <YAxis domain={[0, 1]} ticks={[0, 1]} />
              <Tooltip formatter={(value: any) => (Number(value) === 1 ? "PASS" : "FAIL")} />
              <Legend />
              <Line type="stepAfter" dataKey="상태" stroke="#2563eb" strokeWidth={2} dot />
            </LineChart>
          </ResponsiveContainer>
          <p className="text-xs text-gray-500 mt-3">차트 내부값: PASS=1, FAIL=0 (표시는 PASS/FAIL)</p>
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
        <h3 className="text-lg font-bold text-gray-900 mb-4">실시간 알림 및 이슈 (초 단위)</h3>
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
