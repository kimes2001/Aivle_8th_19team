# welding_image/models.py
import os
from ultralytics import YOLO

stage1_model = None
stage2_model = None

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
WEIGHTS_DIR = os.path.join(BASE_DIR)

def load_welding_image_models():
    global stage1_model, stage2_model

    stage1_path = os.path.join(WEIGHTS_DIR, "stage1_best.pt")
    stage2_path = os.path.join(WEIGHTS_DIR, "stage2_best.pt")

    if stage1_model is None:
        stage1_model = YOLO(stage1_path)

    if stage2_model is None:
        stage2_model = YOLO(stage2_path)
