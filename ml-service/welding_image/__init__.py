import os
import io
from PIL import Image
from ultralytics import YOLO

# =========================
# Models
# =========================

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

STAGE1_MODEL_PATH = os.path.join(BASE_DIR, "stage1_best.pt")
STAGE2_MODEL_PATH = os.path.join(BASE_DIR, "stage2_best.pt")

stage1_model = None
stage2_model = None

def load_welding_image_models():
    global stage1_model, stage2_model
    stage1_model = YOLO(STAGE1_MODEL_PATH)
    stage2_model = YOLO(STAGE2_MODEL_PATH)

# =========================
# Internal inference
# =========================
def _infer(model: YOLO, image_bytes: bytes, conf: float, iou: float):
    img = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    results = model.predict(img, conf=conf, iou=iou, verbose=False)

    r = results[0]
    names = r.names

    defects = []
    if r.boxes is not None and len(r.boxes) > 0:
        for b in r.boxes:
            cls = int(b.cls[0].item())
            defects.append({
                "class": names.get(cls, str(cls)),
                "confidence": float(b.conf[0].item()),
                "bbox": b.xyxy[0].tolist(),  # [x1, y1, x2, y2]
            })

    status = "DEFECT" if len(defects) > 0 else "NORMAL"
    return {"status": status, "defects": defects}

# =========================
# Stage1 (normal vs defect)
# =========================
def predict_stage1(image_bytes: bytes, conf: float = 0.25, iou: float = 0.7):
    if stage1_model is None:
        raise RuntimeError("Stage1 welding image model not loaded")

    result = _infer(stage1_model, image_bytes, conf, iou)

    # Stage1은 defect 단일 클래스
    if result["status"] == "DEFECT":
        for d in result["defects"]:
            d["class"] = "defect"
    else:
        result["defects"] = []

    return result

# =========================
# Stage2 (6-class defect)
# =========================
def predict_stage2(image_bytes: bytes, conf: float = 0.25, iou: float = 0.7):
    if stage2_model is None:
        raise RuntimeError("Stage2 welding image model not loaded")

    return _infer(stage2_model, image_bytes, conf, iou)
