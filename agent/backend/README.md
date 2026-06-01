# AFV Agent Backend (FastAPI)

Serves your trained multi-head Keras model behind an HTTP API so a frontend can upload an image and receive probabilities.

## Layout

- `src/main.py` – FastAPI app with `/health` and `/predict`

## Model artifacts

By default the server loads model artifacts from the workspace-level folder:

- `exported_model/afv_classifier.keras`
- `exported_model/metadata.json`

You can override paths via environment variables:

- `AFV_MODEL_DIR` (folder containing both files)
- `AFV_MODEL_PATH`
- `AFV_META_PATH`

## Run

From `agent/backend/`:

```bash
python -m venv .venv
source .venv/bin/activate

# Use pip-installed uvicorn/fastapi (avoid mixing apt + pip)
pip install -r requirements.txt
uvicorn src.main:app --reload --host 0.0.0.0 --port 8000
```

Note: TensorFlow must be compatible with your Python version. This project pins a TensorFlow version that supports Python 3.13.

## API

- `GET /health` – quick sanity check
- `POST /predict` – multipart form upload field name: `image`

Example:

```bash
curl -F "image=@../../t-72_test.jpeg" http://localhost:8000/predict
```
