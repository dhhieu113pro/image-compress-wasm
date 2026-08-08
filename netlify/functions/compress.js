// Netlify Function: /api/compress
// Compresses an image using the shared Rust->WebAssembly codec.
//
// Accepts (choose one):
//   - JSON   POST body: { "image": "<base64>", "quality": 80, "maxWidth": null,
//                         "maxHeight": null, "format": "webp|jpeg|png",
//                         "algorithm": "Lanczos3|CatmullRom|Triangle",
//                         "removeMetadata": false }
//   - Raw    POST body of raw image bytes (Content-Type: image/*)
//   - multipart/form-data with a "file" field and optional "quality"/"format"/... fields
const { compress_image } = require('./wasm/wasm_image_compress.js');

exports.handler = async (event) => {
  // CORS for browser use
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: corsHeaders, body: '' };
  }
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'Method not allowed. Use POST.' }),
    };
  }

  try {
    const { imageBytes, options, filename } = await extractInput(event);

    if (!imageBytes || imageBytes.length === 0) {
      return json(corsHeaders, 400, { error: 'No image provided.' });
    }

    // Validate / default options
    const quality = clampInt(options.quality, 1, 100, 80);
    const format = normalizeFormat(options.format);
    const algorithm = normalizeAlgorithm(options.algorithm);
    const removeMetadata = Boolean(options.removeMetadata);
    const maxWidth = options.maxWidth == null ? undefined : clampInt(options.maxWidth, 1, 100000, 0);
    const maxHeight = options.maxHeight == null ? undefined : clampInt(options.maxHeight, 1, 100000, 0);

    const output = compress_image(
      new Uint8Array(imageBytes),
      quality,
      maxWidth,
      maxHeight,
      format,
      algorithm,
      removeMetadata
    );

    if (!output || output.length === 0) {
      return json(corsHeaders, 422, { error: 'Compression produced no output.' });
    }

    const mime = format === 'jpeg' ? 'image/jpeg' : format === 'png' ? 'image/png' : 'image/webp';
    const baseName = (filename || 'image').replace(/\.[^.]+$/, '') || 'image';
    const ext = format === 'jpeg' ? 'jpg' : format;
    const savings = imageBytes.length > 0
      ? Math.round((1 - output.length / imageBytes.length) * 1000) / 10
      : 0;

    return {
      statusCode: 200,
      headers: {
        ...corsHeaders,
        'Content-Type': mime,
        'Content-Disposition': `attachment; filename="${baseName}.${ext}"`,
        'X-Original-Size': String(imageBytes.length),
        'X-Compressed-Size': String(output.length),
        'X-Savings-Percent': String(savings),
        'X-Format': format,
      },
      body: Buffer.from(output).toString('base64'),
      isBase64Encoded: true,
    };
  } catch (e) {
    return json(corsHeaders, 500, { error: e && e.message ? e.message : String(e) });
  }
};

// --- input parsing -----------------------------------------------------------

function extractInput(event) {
  const contentType = (event.headers['content-type'] || '').toLowerCase();
  const body = event.isBase64Encoded ? Buffer.from(event.body || '', 'base64') : Buffer.from(event.body || '', 'utf8');

  if (contentType.includes('application/json')) {
    const parsed = JSON.parse(body.toString('utf8'));
    const image = parsed.image || parsed.base64 || parsed.data;
    let bytes = null;
    if (image) bytes = Buffer.from(String(image), 'base64');
    if (!bytes && parsed.url) {
      throw new Error('Remote URL fetching is not supported; send the image bytes directly.');
    }
    return {
      imageBytes: bytes,
      options: parsed,
      filename: parsed.filename || null,
    };
  }

  if (contentType.includes('multipart/form-data')) {
    const { fileBytes, fields, filename } = parseMultipart(body, contentType);
    return { imageBytes: fileBytes, options: fields, filename };
  }

  // treat as raw image bytes
  return { imageBytes: body, options: {}, filename: null };
}

// Minimal multipart parser (avoids a dependency). Returns the first file field.
function parseMultipart(body, contentType) {
  const match = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(contentType);
  const boundary = (match && (match[1] || match[2])) || '';
  if (!boundary) return { fileBytes: null, fields: {}, filename: null };

  const delim = Buffer.from(`--${boundary}`);
  let start = 0;
  const parts = [];
  while (true) {
    const idx = body.indexOf(delim, start);
    if (idx === -1) break;
    const end = body.indexOf(Buffer.from('\r\n'), idx + delim.length);
    if (end === -1) break;
    const headerStart = end + 2;
    const next = body.indexOf(delim, headerStart);
    if (next === -1) break;
    parts.push(body.subarray(idx + delim.length + 2, next));
    start = next;
  }

  let fileBytes = null;
  let filename = null;
  const fields = {};
  for (const part of parts) {
    const sep = part.indexOf(Buffer.from('\r\n\r\n'));
    if (sep === -1) continue;
    const headers = part.subarray(0, sep).toString('utf8');
    const data = part.subarray(sep + 4, part.length - 2); // strip trailing CRLF
    const cd = /content-disposition:\s*form-data;\s*name="([^"]+)"\s*(?:;\s*filename="([^"]*)")?/i.exec(headers);
    if (!cd) continue;
    const [, name, fn] = cd;
    if (fn !== undefined) {
      fileBytes = data;
      filename = fn;
    } else {
      fields[name] = data.toString('utf8');
    }
  }
  return { fileBytes, fields, filename };
}

// --- helpers -----------------------------------------------------------------

function json(headers, status, obj) {
  return {
    statusCode: status,
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify(obj),
  };
}

function clampInt(v, min, max, def) {
  const n = Number(v);
  if (!Number.isFinite(n)) return def;
  return Math.min(max, Math.max(min, Math.trunc(n)));
}

function normalizeFormat(f) {
  const s = String(f || 'webp').toLowerCase();
  if (s === 'jpg') return 'jpeg';
  if (s === 'png') return 'png';
  if (s === 'jpeg') return 'jpeg';
  return 'webp';
}

function normalizeAlgorithm(a) {
  const s = String(a || 'Lanczos3').toLowerCase();
  if (s.includes('catmull')) return 'CatmullRom';
  if (s.includes('triang') || s.includes('bilinear')) return 'Triangle';
  return 'Lanczos3';
}
