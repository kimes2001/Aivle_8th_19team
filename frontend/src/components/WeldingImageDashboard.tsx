import React, { useEffect, useState } from "react";

type Defect = {
  class: string;
  confidence: number;
  bbox: number[]; // [x1,y1,x2,y2]
};

type WeldingResponse = {
  status: "NORMAL" | "DEFECT";
  defects: Defect[];
  original_image_url: string;        // ✅ 추가
  result_image_url: string | null;   // ✅ 추가 (NORMAL이면 null 가능)
};

// ✅ 윈드실드처럼 "직접 8000"으로 때리는 방식 (프록시 안 씀)
const ENDPOINT = "http://localhost:8000/api/v1/smartfactory/welding/image";

export function WeldingImageDashboard() {
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string>("");

  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<WeldingResponse | null>(null);
  const [error, setError] = useState<string>("");
  const [debugText, setDebugText] = useState<string>("");

  // preview url cleanup
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const onPickFile = (f: File | null) => {
    setFile(f);
    setResult(null);
    setError("");
    setDebugText("");

    if (previewUrl) URL.revokeObjectURL(previewUrl);

    if (!f) {
      setPreviewUrl("");
      return;
    }
    setPreviewUrl(URL.createObjectURL(f));
  };

  const onSubmit = async () => {
    if (!file) {
      setError("이미지를 업로드해줘.");
      return;
    }

    const requestId = (crypto as any)?.randomUUID?.() ?? String(Date.now());
    const startedAt = performance.now();

    setLoading(true);
    setError("");
    setResult(null);
    setDebugText("");

    try {
      const form = new FormData();
      form.append("file", file);

      console.groupCollapsed(
        `%c[WeldingImage] Request ${requestId}`,
        "color:#2563eb;font-weight:700;"
      );
      console.log("endpoint:", ENDPOINT);
      console.log("file:", { name: file.name, type: file.type, size: file.size });

      const res = await fetch(ENDPOINT, { method: "POST", body: form });

      const elapsed = Math.round(performance.now() - startedAt);
      console.log("status:", res.status, res.statusText, `(${elapsed}ms)`);

      const text = await res.text();
      console.log("raw body:", text);

      setDebugText(
        JSON.stringify(
          {
            requestId,
            endpoint: ENDPOINT,
            elapsedMs: elapsed,
            file: { name: file.name, type: file.type, size: file.size },
            http: { status: res.status, statusText: res.statusText },
            rawBody: text,
          },
          null,
          2
        )
      );

      if (!res.ok) {
        let detail = text;
        try {
          const j = JSON.parse(text);
          detail = j?.detail ? String(j.detail) : text;
        } catch {}
        throw new Error(`HTTP ${res.status} - ${detail || "no body"}`);
      }

      const json = JSON.parse(text) as WeldingResponse;

      // 최소 방어
      const safe: WeldingResponse = {
        status: json?.status === "DEFECT" ? "DEFECT" : "NORMAL",
        defects: Array.isArray(json?.defects) ? json.defects : [],
        original_image_url: String(json?.original_image_url ?? ""),
        result_image_url: json?.result_image_url ?? null,
      };

      console.log("parsed json:", safe);
      setResult(safe);
    } catch (e: any) {
      console.error(`[WeldingImage] Error ${requestId}`, e);
      setError(e?.message ?? "요청 중 오류 발생");
    } finally {
      console.groupEnd?.();
      setLoading(false);
    }
  };

  const copyDebug = async () => {
    const payload = debugText || error || "no debug";
    try {
      await navigator.clipboard.writeText(payload);
      alert("디버그 로그 복사됨");
    } catch {
      alert("복사 실패(브라우저 권한 확인)");
    }
  };

  // ✅ 서버가 내려주는 /static/... 은 절대경로로 변환해서 img src에 넣기
  const originalUrl = result?.original_image_url
    ? `http://localhost:8000${result.original_image_url}`
    : "";

  const resultUrl = result?.result_image_url
    ? `http://localhost:8000${result.result_image_url}`
    : "";

  return (
    <div className="p-6 space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold">용접 이미지 결함 탐지</h1>
        <p className="text-sm text-gray-600">
          로컬 ML FastAPI(<span className="font-mono">localhost:8000</span>)를 직접 호출합니다.
          예측 결과 이미지는 <span className="font-mono">/static/welding_image/runs/predict</span>로 서빙됩니다.
        </p>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Controls */}
        <div className="bg-white rounded-xl shadow p-5 space-y-4">
          <div>
            <label className="text-sm font-medium">이미지 업로드</label>
            <input
              className="block w-full text-sm mt-2"
              type="file"
              accept="image/*"
              onChange={(e) => onPickFile(e.target.files?.[0] ?? null)}
            />
          </div>

          <div className="flex gap-3">
            <button
              onClick={onSubmit}
              disabled={loading || !file}
              className="px-4 py-2 rounded bg-black text-white text-sm disabled:opacity-50"
            >
              {loading ? "분석 중..." : "자동 분석"}
            </button>

            <button
              onClick={() => {
                onPickFile(null);
                setResult(null);
                setError("");
                setDebugText("");
              }}
              className="px-4 py-2 rounded border text-sm"
            >
              초기화
            </button>
          </div>

          {error && (
            <div className="space-y-2">
              <div className="text-sm text-red-600 whitespace-pre-wrap">{error}</div>
              <button className="px-3 py-2 text-sm border rounded" onClick={copyDebug}>
                에러/디버그 로그 복사
              </button>
            </div>
          )}

          <div className="text-xs text-gray-500">
            호출 URL: <span className="font-mono break-all">{ENDPOINT}</span>
          </div>
        </div>

        {/* Preview */}
        <div className="bg-white rounded-xl shadow p-5 space-y-4">
          <div>
            <div className="text-sm font-medium mb-2">업로드 미리보기(로컬)</div>
            {previewUrl ? (
              <img
                src={previewUrl}
                alt="preview"
                className="w-full max-h-[240px] object-contain rounded border"
              />
            ) : (
              <div className="h-[180px] flex items-center justify-center text-gray-400 border rounded">
                이미지가 없습니다.
              </div>
            )}
          </div>

          <div>
            <div className="text-sm font-medium mb-2">서버 저장 원본</div>
            {originalUrl ? (
              <img
                src={originalUrl}
                alt="original"
                className="w-full max-h-[240px] object-contain rounded border"
              />
            ) : (
              <div className="h-[120px] flex items-center justify-center text-gray-400 border rounded">
                아직 없습니다.
              </div>
            )}
          </div>

          <div>
            <div className="text-sm font-medium mb-2">예측 결과 이미지(annotated)</div>
            {resultUrl ? (
              <img
                src={resultUrl}
                alt="result"
                className="w-full max-h-[240px] object-contain rounded border"
              />
            ) : (
              <div className="h-[120px] flex items-center justify-center text-gray-400 border rounded">
                결과 이미지가 없습니다.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Result */}
      <div className="bg-white rounded-xl shadow p-5">
        <div className="flex items-center justify-between">
          <div className="text-lg font-semibold">결과</div>

          {result && (
            <span
              className={`px-3 py-1 rounded-full text-sm ${
                result.status === "DEFECT"
                  ? "bg-red-100 text-red-700"
                  : "bg-green-100 text-green-700"
              }`}
            >
              {result.status}
            </span>
          )}
        </div>

        {!result ? (
          <div className="text-sm text-gray-500 mt-3">아직 결과가 없습니다.</div>
        ) : result.defects.length === 0 ? (
          <div className="text-sm text-gray-700 mt-3">결함이 탐지되지 않았습니다.</div>
        ) : (
          <div className="mt-4 overflow-auto">
            <table className="min-w-full text-sm">
              <thead className="text-left text-gray-600 border-b">
                <tr>
                  <th className="py-2 pr-4">class</th>
                  <th className="py-2 pr-4">confidence</th>
                  <th className="py-2 pr-4">bbox(x1,y1,x2,y2)</th>
                </tr>
              </thead>
              <tbody>
                {result.defects.map((d, idx) => (
                  <tr key={idx} className="border-b last:border-0">
                    <td className="py-2 pr-4 font-medium">{d.class}</td>
                    <td className="py-2 pr-4">{Number(d.confidence).toFixed(4)}</td>
                    <td className="py-2 pr-4 font-mono text-xs">
                      {Array.isArray(d.bbox) && d.bbox.length === 4
                        ? `[${d.bbox.map((v) => Number(v).toFixed(2)).join(", ")}]`
                        : "[]"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Debug panel */}
        {debugText && (
          <div className="mt-4">
            <div className="flex items-center justify-between">
              <div className="text-sm font-medium text-gray-700">Debug</div>
              <button className="text-sm underline" onClick={copyDebug}>
                복사
              </button>
            </div>
            <pre className="mt-2 text-xs bg-gray-50 border rounded p-3 overflow-auto max-h-64">
              {debugText}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}
