import { useState } from 'react';

const API_URL = 'http://localhost:8000/predict';

export default function App() {
  const [file, setFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState('');
  const [responseText, setResponseText] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  function handleFileChange(event) {
    const nextFile = event.target.files?.[0] ?? null;
    setFile(nextFile);
    setResponseText('');
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
    setResponseText('');

    try {
      const response = await fetch(API_URL, {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.detail || 'Request failed.');
      }

      setResponseText(JSON.stringify(data, null, 2));
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Request failed.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="app-shell">
      <section className="panel hero-panel">
        <p className="eyebrow">AFV Agent</p>
        <h1>Upload an image and classify it.</h1>
        <p className="lede">
          This frontend sends the selected image to the FastAPI backend and shows the raw JSON response.
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
          <h2>Raw JSON response</h2>
          <pre className="response-block">{responseText || '{\n  "status": "waiting for request"\n}'}</pre>
        </div>
      </section>
    </main>
  );
}