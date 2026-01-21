# welding_image/pipeline.py
from .models import (
    stage1_model,
    stage2_model,
    load_welding_image_models
)

def full_pipeline(image_path: str):
    # 안전장치 (startup 전에 호출돼도 문제 없음)
    if stage1_model is None or stage2_model is None:
        load_welding_image_models()

    # === 1단계 탐지 ===
    stage1_results = stage1_model(image_path)

    # === 2단계 분류 ===
    stage2_results = stage2_model(image_path)

    # 아래는 예시 구조 (네 기존 코드 유지하면 됨)
    defects = []
    for r in stage2_results:
        for box in r.boxes:
            defects.append({
                "class": int(box.cls),
                "confidence": float(box.conf),
                "bbox": box.xyxy.tolist()[0],
            })

    status = "DEFECT" if defects else "NORMAL"

    return {
        "status": status,
        "defects": defects,
        "result_image_path": image_path,  # 필요 시 시각화 결과로 교체
    }
