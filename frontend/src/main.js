import init, { get_image_info, compress_image } from './pkg/wasm_image_compress.js';

let originalBytes = null;
let originalName = 'image';
let lastResult = null;

const $ = (id) => document.getElementById(id);
const fmt = (n) => n > 1048576 ? `${(n / 1048576).toFixed(2)} MB` : n > 1024 ? `${(n / 1024).toFixed(1)} KB` : `${n} B`;

function escapeAttr(s) {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

async function handleFile(file) {
  if (!file || !file.type.startsWith('image/')) {
    $('error').textContent = 'Please drop an image file.';
    return;
  }
  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const info = get_image_info(bytes);
    originalBytes = bytes;
    originalName = file.name.replace(/\.[^.]+$/, '');
    $('error').textContent = '';
    $('info').textContent = `${info.format} · ${info.width}×${info.height} · ${fmt(info.size)}`;
    $('preview').src = URL.createObjectURL(file);
    $('dropzone').classList.add('has-image');
    $('size-before').textContent = fmt(info.size);
    await compress();
    enableDownload();
  } catch (e) {
    $('error').textContent = `Error: ${e}`;
  }
}

async function compress() {
  if (!originalBytes) return;
  const quality = Number($('quality').value);
  const q = Number($('scale').value);
  const opts = { maxWidth: null, maxHeight: null, outputFormat: $('format').value };
  if (q < 100) {
    // scale is % of original; convert to a max dimension so aspect ratio is kept
    const info = get_image_info(originalBytes);
    opts.maxWidth = Math.round((info.width * q) / 100);
    opts.maxHeight = Math.round((info.height * q) / 100);
  }
  const output = compress_image(
    originalBytes,
    quality,
    opts.maxWidth,
    opts.maxHeight,
    opts.outputFormat,
    $('algorithm').value,
    $('metadata').checked
  );
  lastResult = new Blob([output], { type: `image/${opts.outputFormat === 'jpg' ? 'jpeg' : opts.outputFormat}` });
  $('size-after').textContent = fmt(lastResult.size);
  $('savings').textContent = `${(100 * (1 - lastResult.size / originalBytes.length)).toFixed(1)}% smaller`;
}

function enableDownload() {
  const a = $('download');
  a.hidden = !lastResult;
  if (lastResult) {
    a.href = URL.createObjectURL(lastResult);
    a.download = `${originalName}.${$('format').value === 'jpeg' ? 'jpg' : $('format').value}`;
  }
}

function wireEvents() {
  const dz = $('dropzone');
  const input = $('file-input');

  dz.addEventListener('click', () => input.click());
  dz.addEventListener('dragover', (e) => { e.preventDefault(); dz.classList.add('dragging'); });
  dz.addEventListener('dragleave', () => dz.classList.remove('dragging'));
  dz.addEventListener('drop', (e) => {
    e.preventDefault();
    dz.classList.remove('dragging');
    handleFile(e.dataTransfer.files[0]);
  });
  input.addEventListener('change', () => handleFile(input.files[0]));

  for (const id of ['quality', 'scale', 'format', 'algorithm', 'metadata']) {
    const el = $(id);
    el.addEventListener(el.type === 'checkbox' ? 'change' : 'input', () => {
      if (id === 'format') enableDownload();
      compress().then(enableDownload);
    });
  }
}

const html = `
<main>
  <h1>Image Compressor</h1>
  <p class="sub">Compress images entirely in your browser via WebAssembly. No upload.</p>
  <div id="dropzone">
    <p>Drop an image here, or click to browse</p>
    <input id="file-input" type="file" accept="image/*" hidden />
  </div>
  <div id="error" class="error"></div>
  <div id="panel" class="panel">
    <div class="preview-col">
      <img id="preview" alt="preview" />
    </div>
    <div class="controls">
      <p id="info"></p>
      <label>Quality <input id="quality" type="range" min="1" max="100" value="80" /> <span id="quality-label"></span></label>
      <label>Scale <input id="scale" type="range" min="1" max="100" value="100" /> <span id="scale-label"></span>%</label>
      <label>Format
        <select id="format">
          <option value="webp">WebP</option>
          <option value="jpeg">JPEG</option>
          <option value="png">PNG</option>
        </select>
      </label>
      <label>Resize algorithm
        <select id="algorithm">
          <option value="Lanczos3">Lanczos3</option>
          <option value="CatmullRom">CatmullRom</option>
          <option value="Triangle">Triangle</option>
        </select>
      </label>
      <label><input id="metadata" type="checkbox" /> Remove metadata (EXIF)</label>
      <div class="result">
        <p>Before: <span id="size-before"></span></p>
        <p>After: <span id="size-after"></span></p>
        <p id="savings"></p>
        <a id="download" hidden class="btn">Download</a>
      </div>
    </div>
  </div>
</main>
<style>
  :root { color-scheme: dark; font-family: system-ui, sans-serif; }
  body { margin: 0; background: #111318; color: #e6e8ee; }
  main { max-width: 860px; margin: 0 auto; padding: 24px; }
  h1 { margin: 0 0 4px; }
  .sub { margin: 0 0 16px; color: #9aa0ad; }
  #dropzone { border: 2px dashed #3a4050; border-radius: 12px; padding: 40px; text-align: center;
    color: #9aa0ad; cursor: pointer; transition: border-color .2s; }
  #dropzone.dragging, #dropzone:hover { border-color: #5b8def; }
  .panel { display: none; margin-top: 16px; gap: 24px; }
  #dropzone.has-image ~ #panel { display: flex; }
  .preview-col { flex: 1; }
  #preview { max-width: 100%; max-height: 400px; border-radius: 8px; }
  .controls { flex: 1; display: flex; flex-direction: column; gap: 12px; }
  label { display: flex; flex-direction: column; gap: 4px; font-size: 14px; }
  label.check { flex-direction: row; align-items: center; }
  .error { color: #ff6b6b; min-height: 1.2em; margin-top: 8px; }
  .result { border-top: 1px solid #2a2f3a; padding-top: 12px; }
  .result p { margin: 4px 0; }
  .btn { display: inline-block; margin-top: 8px; padding: 8px 16px; background: #5b8def;
    color: #fff; border-radius: 6px; text-decoration: none; }
</style>
`;

document.getElementById('app').innerHTML = html;
$('quality-label').textContent = $('quality').value;
$('scale-label').textContent = $('scale').value;
$('quality').addEventListener('input', () => { $('quality-label').textContent = $('quality').value; });
$('scale').addEventListener('input', () => { $('scale-label').textContent = $('scale').value; });
wireEvents();

init().then(() => {
  // wasm loaded; nothing else needed
});
