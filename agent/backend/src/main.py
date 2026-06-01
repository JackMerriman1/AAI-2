import json
import os
from io import BytesIO
from pathlib import Path
from typing import Any

import numpy as np
import tensorflow as tf
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from PIL import Image


def _load_metadata(path: Path) -> dict[str, Any]:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError as exc:
        raise RuntimeError(f"metadata.json not found at {path}") from exc
    except json.JSONDecodeError as exc:
        raise RuntimeError(f"Invalid JSON in metadata file: {path}") from exc


def _resolve_default_model_dir() -> Path:
    # Default to the workspace's exported_model/ folder.
    # This file lives at agent/backend/src/main.py -> go up 3 levels to agent/.
    agent_dir = Path(__file__).resolve().parents[2]
    workspace_dir = agent_dir.parent
    return workspace_dir / "exported_model"


MODEL_DIR = Path(os.environ.get("AFV_MODEL_DIR", str(_resolve_default_model_dir()))).resolve()
MODEL_PATH = Path(os.environ.get("AFV_MODEL_PATH", str(MODEL_DIR / "afv_classifier.keras"))).resolve()
META_PATH = Path(os.environ.get("AFV_META_PATH", str(MODEL_DIR / "metadata.json"))).resolve()


app = FastAPI(title="AFV Classification Agent API")

# Dev-friendly CORS; tighten this in production.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"]
)


@app.on_event("startup")
def _startup() -> None:
    global model, metadata, vehicle_list, img_size

    if not MODEL_PATH.exists():
        raise RuntimeError(f"Model file not found: {MODEL_PATH}")
    if not META_PATH.exists():
        raise RuntimeError(f"Metadata file not found: {META_PATH}")

    metadata = _load_metadata(META_PATH)
    img_size = int(metadata.get("img_size", 224))
    vehicle_list = list(metadata.get("vehicle_list", []))

    # Load model once at startup so /predict is fast.
    model = tf.keras.models.load_model(MODEL_PATH)


def _preprocess_image(contents: bytes, img_size: int) -> np.ndarray:
    try:
        img = Image.open(BytesIO(contents)).convert("RGB")
    except Exception as exc:
        raise HTTPException(status_code=400, detail="Invalid image file") from exc

    img = img.resize((img_size, img_size))
    arr = np.asarray(img, dtype=np.float32)  # keep [0,255] range to match training
    if arr.ndim != 3 or arr.shape[2] != 3:
        raise HTTPException(status_code=400, detail="Expected an RGB image")

    arr = np.expand_dims(arr, axis=0)  # (1, H, W, 3)
    return arr


@app.get("/health")
def health() -> dict[str, Any]:
    return {
        "ok": True,
        "model_path": str(MODEL_PATH),
        "meta_path": str(META_PATH),
        "img_size": img_size,
        "num_vehicle_classes": len(vehicle_list),
    }


@app.post("/predict")
async def predict(image: UploadFile = File(...)) -> dict[str, Any]:
    if image.content_type is None or not image.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail=f"Expected an image upload, got {image.content_type!r}")

    contents = await image.read()
    x = _preprocess_image(contents, img_size)

    preds = model.predict(x, verbose=0)
    if isinstance(preds, (list, tuple)) and len(preds) == 3:
        type_probs, cage_prob, destroyed_prob = preds
    elif isinstance(preds, dict):
        type_probs = preds.get("type_output_layer")
        cage_prob = preds.get("cage_output_layer")
        destroyed_prob = preds.get("status_output_layer")
    else:
        raise HTTPException(status_code=500, detail=f"Unexpected model output type: {type(preds)}")

    type_probs = np.asarray(type_probs).reshape(-1)
    type_idx = int(np.argmax(type_probs)) if type_probs.size else -1
    type_conf = float(type_probs[type_idx]) if 0 <= type_idx < type_probs.size else float("nan")

    if vehicle_list and 0 <= type_idx < len(vehicle_list):
        type_label = vehicle_list[type_idx]
    else:
        type_label = str(type_idx)

    cage_conf = float(np.asarray(cage_prob).reshape(-1)[0])
    destroyed_conf = float(np.asarray(destroyed_prob).reshape(-1)[0])

    return {
        "vehicle_type": {
            "label": type_label,
            "confidence": type_conf,
            "probs": type_probs.tolist(),
            "classes": vehicle_list,
        },
        "cope_cage": {"confidence": cage_conf},
        "destroyed": {"confidence": destroyed_conf},
        "meta": {
            "img_size": img_size,
            "thresholds": metadata.get("thresholds", {}),
        },
    }
