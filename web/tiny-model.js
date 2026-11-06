// Loads the small language model into the page: the WebAssembly engine plus the 4 MB checkpoint.
// Everything stays in the browser; nothing is uploaded.
import init, { attention_for_text, predict_for_text, Session } from "./vendor/tlm/tlm_wasm.js";
import { wasmTextModel } from "./js/model/text-model.js";

/** Download a file, reporting progress as a 0..1 fraction. */
async function download(url, onProgress) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  const total = Number(res.headers.get("content-length")) || 0;
  const reader = res.body.getReader();
  const chunks = [];
  let got = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    got += value.length;
    if (total) onProgress(got / total);
  }
  const bytes = new Uint8Array(got);
  let at = 0;
  for (const c of chunks) {
    bytes.set(c, at);
    at += c.length;
  }
  return bytes;
}

// Resolve files relative to THIS file, so it works from any page or sub folder.
const here = (path) => new URL(path, import.meta.url).href;

export async function loadModel(onProgress = () => {}) {
  await init();
  const [bytes, tokenizer] = await Promise.all([download(here("model/model.safetensors"), onProgress), fetch(here("model/tokenizer.json")).then((r) => r.text())]);
  // Template "{}" means: the prompt we pass in is used exactly as written.
  const session = Session.from_model(bytes, tokenizer, "{}");
  return {
    model: wasmTextModel({
      session,
      predict: (text, k) => predict_for_text(session, text, k),
      attention: (text) => attention_for_text(session, text),
    }),
    params: session.num_params(),
    megabytes: bytes.length / 1e6,
  };
}
