from fastapi import FastAPI, HTTPException, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
import uvicorn

import battery
import windshield  # ✅ 추가

app = FastAPI(title="ML Service API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("startup")
def startup_event():
    print("서버 시작: 모델 로딩 중...")
    battery.load_battery_models()
    windshield.load_windshield_models()
    print("모델 로딩 완료")

@app.get("/")
def read_root():
    return {"message": "ML Service API is running"}

@app.get("/health")
def health():
    return {
        "status": "ok",
        "battery_models_loaded": battery.model is not None,
        "windshield_left_loaded": windshield.left_model is not None,
        "windshield_right_loaded": windshield.right_model is not None,
    }

# 기존 배터리 예측 유지
@app.post("/predict")
def predict_battery_endpoint(data: battery.BatteryPredictionRequest):
    try:
        result = battery.predict_battery_quality(data)
        return {"prediction": result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# ✅ 윈드실드 예측 추가
@app.post("/api/v1/smartfactory/windshield")
async def predict_windshield_endpoint(
    side: str = Form(...),        # "Left" or "Right"
    file: UploadFile = File(...), # CSV
):
    try:
        s = side.strip().lower()
        if s not in ("left", "right"):
            raise HTTPException(status_code=400, detail="side must be 'Left' or 'Right'")

        csv_bytes = await file.read()
        pred_mm, judgement = windshield.predict_thickness_from_csv(s, csv_bytes)


        return {
            "predicted_thickness_mm": float(pred_mm),
            "judgement": judgement,  # PASS | FAIL
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
