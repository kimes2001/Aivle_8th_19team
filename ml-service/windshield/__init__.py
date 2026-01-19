# ml-service/windshield/__init__.py
import io
import os
import numpy as np
import joblib
import pandas as pd

left_model = None
right_model = None

BASE_DIR = os.path.dirname(__file__)

# 품질 기준(예시)
LSL = float(os.getenv("WINDSHIELD_LSL", "0.8"))
USL = float(os.getenv("WINDSHIELD_USL", "1.5"))

def load_windshield_models():
    global left_model, right_model

    left_path = os.path.join(BASE_DIR, "svm_left_model.pkl")
    right_path = os.path.join(BASE_DIR, "svm_right_model.pkl")

    left_model = joblib.load(left_path)
    right_model = joblib.load(right_path)

    print(f"[Windshield Package] 모델 로딩 완료: {BASE_DIR}")

def _parse_csv_bytes(csv_bytes: bytes) -> np.ndarray:
    df = pd.read_csv(io.BytesIO(csv_bytes), header=None)
    return df.to_numpy(dtype=np.float32)

def predict_thickness_from_csv(side: str, csv_bytes: bytes):
    if side == "left" and left_model is None:
        raise RuntimeError("Left model not loaded")
    if side == "right" and right_model is None:
        raise RuntimeError("Right model not loaded")

    X = _parse_csv_bytes(csv_bytes)
    x1 = X[0:1, :]

    model = left_model if side == "left" else right_model
    pred = float(model.predict(x1)[0])

    judgement = "PASS" if (LSL <= pred <= USL) else "FAIL"
    return pred, judgement
