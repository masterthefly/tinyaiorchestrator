// Loads the log classifier model in Node, using the same WebAssembly engine the browser uses.
import { readFileSync } from "node:fs";
import { attention_for_text, initSync, predict_for_text, Session } from "../web/vendor/tlm/tlm_wasm.js";
import { wasmTextModel } from "../src/model/text-model.ts";

export function loadSession(dir = "web/model") {
  initSync({ module: readFileSync("web/vendor/tlm/tlm_wasm_bg.wasm") });
  // Template "{}" means: the prompt we pass in is used exactly as written.
  return Session.from_model(readFileSync(`${dir}/model.safetensors`), readFileSync(`${dir}/tokenizer.json`, "utf8"), "{}");
}

/** The model as a TextModel, with confidence. */
export function loadTextModel(dir = "web/model") {
  const session = loadSession(dir);
  return wasmTextModel({
    session,
    predict: (text, k) => predict_for_text(session, text, k),
    attention: (text) => attention_for_text(session, text),
  });
}
