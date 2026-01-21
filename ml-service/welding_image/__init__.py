# welding_image/__init__.py
import os
import uuid
import shutil
from fastapi import UploadFile, HTTPException

from . import models              # ✅ 모듈로 import
from .pipeline import full_pipeline

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
TEMP_DIR = os.path.join(BASE_DIR, "temp")
os.makedirs(TEMP_DIR, exist_ok=True)

ALLOWED_EXT = {".jpg", ".jpeg", ".png", ".bmp", ".webp"}


def load_welding_image_models():
    # ✅ 모델 로딩 함수는 models.py에 있는 걸 호출
    models.load_welding_image_models()


def stage1_loaded() -> bool:
    return models.stage1_model is not None


def stage2_loaded() -> bool:
    return models.stage2_model is not None


async def predict_welding_image(file: UploadFile):
    if not file.filename:
        raise HTTPException(status_code=400, detail="Empty filename")

    ext = os.path.splitext(file.filename)[1].lower()
    if ext not in ALLOWED_EXT:
        raise HTTPException(status_code=400, detail=f"Invalid image format: {ext}")

    # ✅ 안전장치: 로딩 안 되어있으면 로딩
    if not stage1_loaded() or not stage2_loaded():
        load_welding_image_models()

    save_path = os.path.join(TEMP_DIR, f"{uuid.uuid4()}{ext}")

    with open(save_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    result = full_pipeline(save_path)

    return {
        "status": result["status"],
        "defects": result["defects"],
        "image_path": save_path
    }
