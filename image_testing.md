# Image Integration Testing Rules

## Rules
- Always use base64-encoded images for tests
- Accepted formats: JPEG, PNG, WEBP only
- Do not use SVG, BMP, HEIC, or other formats
- Do not upload blank, solid-color, or uniform-variance images
- Every test image must contain real visual features (objects, edges, textures, shadows)
- Transcode to PNG/JPEG before upload if source is other format; always re-detect MIME after transform
- Animated (GIF/APNG/WEBP): extract first frame only
- Resize large images to reasonable bounds

## App-Specific
- PO parse endpoint: `POST /api/transactions/parse-po` (multipart file upload)
- Response: parsed transaction fields matching TransactionCreate model (vendor_name, po_no, po_date, items[])
- Requires auth (staff/admin can call)
- Uses Gemini 3 Flash via EMERGENT_LLM_KEY
