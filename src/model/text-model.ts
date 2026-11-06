/**
 * Anything that can continue a prompt with text. The WebAssembly `Session` from TinyLanguageBuilder
 * fits this shape, and so does a fake in a test. Depending on this tiny interface (and not on the
 * engine) is what lets the classifier be tested without a model, and swapped for another one.
 */
export interface TextModel {
  answer(prompt: string, maxTokens: number, temperature: number, seed: number): string;
  /**
   * Optional: how sure the model was of the first word of `answer`, from 0 to 1. Not every model can say.
   * Careful: small models are often confidently wrong, so this is a hint, not a guarantee.
   */
  confidence?(prompt: string, answer: string): number;
}

/** The pieces of the WebAssembly engine we need. The page and the terminal each pass in their own copy. */
export interface WasmApi {
  session: { answer(prompt: string, maxTokens: number, temperature: number, seed: number): string };
  /** Top guesses for each token of some text, as JSON. */
  predict(text: string, topK: number): string;
  /** The tokens of some text, as JSON. */
  attention(text: string): string;
}

/**
 * Wrap the engine as a TextModel. The confidence is the probability the model gave its own first
 * label token: we replay its answer and read that number back.
 */
export function wasmTextModel(api: WasmApi): TextModel {
  return {
    answer: (prompt, maxTokens, temperature, seed) => api.session.answer(prompt, maxTokens, temperature, seed),
    confidence(prompt, answer) {
      const promptTokens = (JSON.parse(api.attention(prompt)) as { tokens: unknown[] }).tokens.length;
      const replay = JSON.parse(api.predict(`${prompt} ${answer.trim()}`, 3)) as { positions: { p_actual: number }[] };
      return replay.positions[promptTokens - 1]?.p_actual ?? 0;
    },
  };
}
