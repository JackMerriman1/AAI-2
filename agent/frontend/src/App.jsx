import { useState } from 'react';

const API_URL = 'http://localhost:8000/predict';

function formatPercent(value) {
  return `${Math.round(value * 100)}%`;
}

function getTypeWording(prediction, thresholds) {
  if (!prediction) {
    return null;
  }

  const likelyThreshold = thresholds?.type_likely ?? 0.6;
  const isThreshold = thresholds?.type_is ?? 0.8;
  const confidence = prediction.confidence ?? 0;

  if (confidence >= isThreshold) {
    return `This is a ${prediction.label}.`;
  }

  if (confidence >= likelyThreshold) {
    return `This is likely a ${prediction.label}.`;
  }

  return `This could be a ${prediction.label}.`;
}

function getThreeTierThresholds(likelyThreshold, isThreshold) {
  return {
    likely: likelyThreshold,
    is: isThreshold,
  };
}

function getCopeCageWording(prediction, thresholds) {
  if (!prediction) {
    return null;
  }

  const confidence = prediction.confidence ?? 0;
  const tierThresholds = getThreeTierThresholds(
    thresholds?.cope_cage ?? 0.25,
    Math.min(0.9, (thresholds?.cope_cage ?? 0.25) + 0.2)
  );

  if (confidence >= tierThresholds.is) {
    return 'This has a cope cage.';
  }

  if (confidence >= tierThresholds.likely) {
    return 'This is likely to have a cope cage.';
  }

  return 'This could have a cope cage.';
}

function getDestroyedWording(prediction, thresholds) {
  if (!prediction) {
    return null;
  }

  const confidence = prediction.confidence ?? 0;
  const likelyThreshold = thresholds?.destroyed ?? 0.3;
  const isThreshold = Math.max(0.85, likelyThreshold + 0.35);

  // No-cry-wolf behavior: only use definitive destroyed wording at very high confidence.
  if (confidence >= isThreshold) {
    return 'This is destroyed.';
  }

  if (confidence >= likelyThreshold) {
    return 'This is likely destroyed.';
  }

  return 'This could be destroyed.';
}

function buildSummary(data) {
  if (!data) {
    return [];
  }

  const thresholds = data.meta?.thresholds ?? {};

  return [
    {
      label: 'Vehicle type',
      statement: getTypeWording(data.vehicle_type, thresholds),
      confidence: data.vehicle_type?.confidence,
    },
    {
      label: 'Cope cage',
      statement: getCopeCageWording(data.cope_cage, thresholds),
      confidence: data.cope_cage?.confidence,
    },
    {
      label: 'Destroyed',
      statement: getDestroyedWording(data.destroyed, thresholds),
      confidence: data.destroyed?.confidence,
    },
  ];
}

export default function App() {
  const [file, setFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState('');
  const [responseData, setResponseData] = useState(null);
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  function handleFileChange(event) {
    const nextFile = event.target.files?.[0] ?? null;
    setFile(nextFile);
    setResponseData(null);
    setError('');

    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }

    setPreviewUrl(nextFile ? URL.createObjectURL(nextFile) : '');
  }

  async function handleSubmit(event) {
    event.preventDefault();

    if (!file) {
      setError('Select an image first.');
      return;
    }

    const formData = new FormData();
    formData.append('image', file);

    setIsSubmitting(true);
    setError('');
    setResponseData(null);

    try {
      const response = await fetch(API_URL, {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.detail || 'Request failed.');
      }

      setResponseData(data);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Request failed.');
    } finally {
      setIsSubmitting(false);
    }
  }

  const summaryItems = buildSummary(responseData);

  return (
    <main className="app-shell">
      <section className="panel hero-panel">
        <p className="eyebrow">AFV Agent</p>
        <h1>Upload an image and classify it.</h1>
        <p className="lede">
          This frontend sends the selected image to the FastAPI backend and shows a classification summary.
        </p>

        <form className="upload-form" onSubmit={handleSubmit}>
          <label className="upload-field" htmlFor="image-upload">
            <span>Choose image</span>
            <input
              id="image-upload"
              type="file"
              accept="image/*"
              onChange={handleFileChange}
            />
          </label>

          <button className="classify-button" type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Classifying...' : 'Classify'}
          </button>
        </form>

        {file ? <p className="file-name">Selected: {file.name}</p> : null}
        {error ? <p className="error-text">{error}</p> : null}
      </section>

      <section className="panel output-panel">
        <div className="preview-card">
          <h2>Preview</h2>
          {previewUrl ? (
            <img className="image-preview" src={previewUrl} alt="Selected preview" />
          ) : (
            <div className="preview-placeholder">No image selected</div>
          )}
        </div>

        <div className="response-card">
          <h2>Classification summary</h2>
          {responseData ? (
            <div className="summary-block">
              {summaryItems.map((item) => (
                <article className="summary-item" key={item.label}>
                  <p className="summary-label">{item.label}</p>
                  <p className="summary-statement">{item.statement}</p>
                  <p className="summary-confidence">Confidence: {formatPercent(item.confidence ?? 0)}</p>
                </article>
              ))}
            </div>
          ) : (
            <div className="preview-placeholder summary-placeholder">Run a classification to see threshold-based wording.</div>
          )}
        </div>
      </section>
    </main>
  );
}