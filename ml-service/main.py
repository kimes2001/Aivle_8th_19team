from fastapi import FastAPI, HTTPException, UploadFile, File, Form, Query
from fastapi.middleware.cors import CORSMiddleware
import uvicorn

import battery
import windshield  # ✅ 윈드실드 분류 모델
import engine      # ✅ 엔진 진동 모델
import welding_image

app = FastAPI(title="ML Service API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# =========================
# Startup
# =========================
@app.on_event("startup")
def startup_event():
    print("서버 시작: 모델 로딩 중...")
    battery.load_battery_models()
    windshield.load_windshield_models()
    engine.load_engine_model()
    welding_image.load_welding_image_models()
    print("모델 로딩 완료")

# =========================
# Health
# =========================
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
        "engine_loaded": engine.model is not None,
        "welding_stage1_loaded": welding_image.stage1_model is not None,
        "welding_stage2_loaded": welding_image.stage2_model is not None,
    }

# =========================
# Battery (기존 유지)
# =========================
@app.post("/predict")
def predict_battery_endpoint(data: battery.BatteryPredictionRequest):
    try:
        result = battery.predict_battery_quality(data)
        return {"prediction": result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# =========================
# Windshield (분류 0/1)
# =========================
@app.post("/api/v1/smartfactory/windshield")
async def predict_windshield_endpoint(
    side: str = Form(...),        # "Left" | "Right"
    file: UploadFile = File(...), # CSV
):
    try:
        # ✅ side 정규화
        s = side.strip().lower()
        if s not in ("left", "right"):
            raise HTTPException(status_code=400, detail="side must be 'Left' or 'Right'")

        csv_bytes = await file.read()

        # ✅ 0/1 분류 예측
        prediction, judgement = windshield.predict_from_csv(s, csv_bytes)

        return {
            "prediction": prediction,   # 0 | 1
            "judgement": judgement,     # PASS | FAIL
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# =========================
# Engine Vibration (분류 0/1)
# =========================
@app.post("/api/v1/smartfactory/engine")
async def predict_engine_endpoint(
    file: UploadFile = File(...),  # ARFF
):
    try:
        arff_bytes = await file.read()

        # ✅ 0/1 분류 예측
        prediction, judgement = engine.predict_from_arff(arff_bytes)

        return {
            "prediction": prediction,   # 0 | 1
            "judgement": judgement,     # NORMAL | ABNORMAL
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# =========================
# Welding Image Stage1
# =========================
@app.post("/api/v1/welding/image/stage1")
async def predict_welding_image_stage1(
    file: UploadFile = File(...),
    conf: float = Query(0.25, ge=0.0, le=1.0),
    iou: float = Query(0.7, ge=0.0, le=1.0),
):
    try:
        img_bytes = await file.read()
        return welding_image.predict_stage1(img_bytes, conf, iou)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# =========================
# Welding Image Stage2
# =========================
@app.post("/api/v1/welding/image/stage2")
async def predict_welding_image_stage2(
    file: UploadFile = File(...),
    conf: float = Query(0.25, ge=0.0, le=1.0),
    iou: float = Query(0.7, ge=0.0, le=1.0),
):
    try:
        img_bytes = await file.read()
        return welding_image.predict_stage2(img_bytes, conf, iou)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
