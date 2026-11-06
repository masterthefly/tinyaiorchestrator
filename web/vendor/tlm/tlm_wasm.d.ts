/* tslint:disable */
/* eslint-disable */

/**
 * A frozen copy of a model's token-embedding table (one row of `dim` numbers per token),
 * plus the tools the chapter needs to look at it: neighbours and a 2-D map.
 *
 * "Frozen" matters: the reader trains a model and keeps a snapshot every few hundred steps,
 * then scrubs through them to watch the table change.
 */
export class EmbeddingView {
    free(): void;
    [Symbol.dispose](): void;
    dim(): number;
    /**
     * Share of the variation this table has along its own two main directions, `[first, second]`.
     */
    explained_variance(): Float32Array;
    /**
     * Where every token lands on this table's own 2-D map: `[x0, y0, x1, y1, ...]`.
     */
    map(): Float32Array;
    /**
     * Where every token of THIS table lands when using `basis`'s map axes. Using the final
     * model's axes for every snapshot keeps the picture steady while the reader scrubs.
     */
    map_with(basis: EmbeddingView): Float32Array;
    /**
     * The `k` tokens whose vectors point most nearly the same way as token `id`'s (cosine
     * similarity, highest first), as JSON `{id, similarity}`. The token itself is excluded.
     */
    neighbors(id: number, k: number): string;
    /**
     * Copy the token-embedding table out of a session's current model.
     */
    constructor(session: Session);
    /**
     * The bytes token `id` stands for.
     */
    token_bytes(id: number): Uint8Array;
    /**
     * The `dim` numbers that stand for token `id`.
     */
    vector(id: number): Float32Array;
    /**
     * Every token's bytes, as a JSON list of byte lists (index = token id).
     */
    vocab_json(): string;
    vocab_size(): number;
}

export class Session {
    free(): void;
    [Symbol.dispose](): void;
    /**
     * Preference tuning, step 2: hand over each worker's mining result, in shard order.
     */
    add_mined(blob: Uint8Array | number[]): void;
    /**
     * Answer `input` using the fine-tuning template (e.g. a word -> a sentence using it).
     */
    answer(input: string, n_tokens: number, temperature: number, seed: number): string;
    /**
     * Data-parallel half 2: apply the SUM of all workers' flat gradient lists.
     */
    apply_grads(summed: Float32Array | number[]): void;
    /**
     * Convert a per-token loss to bits per byte (8.0 = knows nothing about bytes).
     */
    bits_per_byte(loss: number): number;
    bytes_per_token(): number;
    /**
     * A fingerprint of the weights: equal on every worker if they are in sync.
     */
    checksum(): number;
    /**
     * Data-parallel half 1: gradients for worker `shard` of `n_shards`, as one flat
     * list whose last number is this share's loss. Add the shares of all workers.
     */
    compute_grads(shard: number, n_shards: number): Float32Array;
    /**
     * Score the model on held-out questions. For the built-in task returns JSON
     * { n, uses_word, chance, stops, samples: [[prompt, answer], ...] }; for the user's own examples
     * { task: "custom", n, stops, exact, samples: [{prompt, answer, reference}, ...] }.
     */
    eval_word(n: number, temperature: number, seed: number): string;
    /**
     * Everything else needed to restore this session, as JSON.
     */
    export_meta(): string;
    /**
     * The model as a safetensors file (the same format the `tlm` command-line tool reads).
     */
    export_model(): Uint8Array;
    /**
     * Adam's memory, needed to resume training exactly.
     */
    export_optimizer(): Uint8Array;
    /**
     * The scored preference pairs as bytes (empty outside preference tuning). Needed to resume a run.
     */
    export_pairs(): Uint8Array;
    /**
     * The tokenizer as JSON (save it next to the model as tokenizer.json).
     */
    export_tokenizer(): string;
    /**
     * Open a downloaded model file for chatting (no training).
     */
    static from_model(model_bytes: Uint8Array | number[], tokenizer_json: string, template?: string | null): Session;
    /**
     * Continue `prompt` with up to `n_tokens` new tokens (works in every phase).
     */
    generate(prompt: string, n_tokens: number, temperature: number, seed: number): string;
    /**
     * Preference tuning, step 1: sample answers for this worker's share of the prompts
     * (`shard` of `n_shards`) and pair good answers with bad ones. Returns the pairs as bytes.
     */
    mine_shard(settings_json: string, shard: number, n_shards: number): Uint8Array;
    /**
     * Train a tokenizer on `text` and set up a fresh model, ready to pre-train.
     */
    constructor(text: string, config_json: string);
    num_params(): number;
    phase(): string;
    /**
     * Fraction of held-out preference pairs where the model now favours the chosen answer
     * more than the reference did (NaN outside preference tuning).
     */
    preference_accuracy(): number;
    /**
     * Rebuild a saved session. `text` must be the same text it was trained on.
     * `pairs_bytes` is the output of `export_pairs` (empty unless the session was
     * in preference tuning).
     */
    static restore(text: string, meta_json: string, model_bytes: Uint8Array | number[], optimizer_bytes: Uint8Array | number[], tokenizer_json: string, pairs_bytes: Uint8Array | number[]): Session;
    /**
     * Preference tuning, step 3: score the collected pairs with the model as it is now
     * (the frozen reference) and switch to preference training.
     */
    start_dpo(settings_json: string): void;
    /**
     * Switch from pre-training to fine-tuning on a built-in "use the word" task.
     */
    start_finetune(settings_json: string): void;
    /**
     * Run `n` steps of the current phase. Returns the last training loss.
     */
    step(n: number): number;
    step_count(): number;
    /**
     * The prompt layout used by `answer`, if the model was fine-tuned.
     */
    template(): string | undefined;
    token_count(): number;
    total_steps(): number;
    /**
     * Loss on held-out text (pre-training), held-out answers (fine-tuning) or held-out
     * preference pairs (preference tuning).
     */
    validate(): number;
    vocab_size(): number;
}

/**
 * A tokenizer trained once, whose vocabulary can then be shrunk to "the first k merges".
 * Because merges are learned in order, the first k merges are exactly the tokenizer you would
 * get by asking for a vocabulary of 256 + k.
 */
export class TokenizerLab {
    free(): void;
    [Symbol.dispose](): void;
    /**
     * Token ids -> text. Ids outside the current vocabulary are an error, not a panic.
     */
    decode(ids: Uint32Array | number[]): string;
    /**
     * Text -> JSON list of `{id, bytes}`, one entry per token, in order.
     */
    encode(text: string): string;
    /**
     * How many merges were actually learned (fewer than asked if the text ran out of pairs).
     */
    learned_merges(): number;
    /**
     * The first `count` merges (of the full list) as JSON `{id, left, right}`, with each side
     * given as the bytes it stands for. This is the "recipe" the tokenizer learned.
     */
    merges(count: number): string;
    /**
     * Learn up to `max_merges` merges from `text` (only its first megabyte is used).
     */
    constructor(text: string, max_merges: number);
    /**
     * Use only the first `k` merges (vocabulary size 256 + k).
     */
    set_merges(k: number): void;
    vocab_size(): number;
}

/**
 * Run the session's current model on `text` and report what every attention head did.
 * Only the first `ctx` tokens are used (the model's window).
 */
export function attention_for_text(session: Session, text: string): string;

/**
 * Runs once when the module loads: make Rust panics readable in the browser console.
 */
export function init(): void;

/**
 * The raw next-token scores after `text`, so the page can apply temperature itself and show every step.
 */
export function next_logits(session: Session, text: string): string;

/**
 * For every position of `text`, how likely the session's current model thought the real next token
 * was, and what it would have guessed instead. Only the first `ctx` tokens are used.
 */
export function predict_for_text(session: Session, text: string, top_k: number): string;

/**
 * Every token's bytes, as a JSON list of byte lists (index = token id).
 */
export function vocab_bytes(session: Session): string;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly __wbg_embeddingview_free: (a: number, b: number) => void;
    readonly __wbg_session_free: (a: number, b: number) => void;
    readonly __wbg_tokenizerlab_free: (a: number, b: number) => void;
    readonly attention_for_text: (a: number, b: number, c: number) => [number, number, number, number];
    readonly embeddingview_dim: (a: number) => number;
    readonly embeddingview_explained_variance: (a: number) => [number, number];
    readonly embeddingview_map: (a: number) => [number, number];
    readonly embeddingview_map_with: (a: number, b: number) => [number, number, number, number];
    readonly embeddingview_neighbors: (a: number, b: number, c: number) => [number, number, number, number];
    readonly embeddingview_new: (a: number) => [number, number, number];
    readonly embeddingview_token_bytes: (a: number, b: number) => [number, number, number, number];
    readonly embeddingview_vector: (a: number, b: number) => [number, number, number, number];
    readonly embeddingview_vocab_json: (a: number) => [number, number];
    readonly embeddingview_vocab_size: (a: number) => number;
    readonly init: () => void;
    readonly next_logits: (a: number, b: number, c: number) => [number, number, number, number];
    readonly predict_for_text: (a: number, b: number, c: number, d: number) => [number, number, number, number];
    readonly session_add_mined: (a: number, b: number, c: number) => [number, number];
    readonly session_answer: (a: number, b: number, c: number, d: number, e: number, f: number) => [number, number, number, number];
    readonly session_apply_grads: (a: number, b: number, c: number) => [number, number];
    readonly session_bits_per_byte: (a: number, b: number) => number;
    readonly session_bytes_per_token: (a: number) => number;
    readonly session_checksum: (a: number) => number;
    readonly session_compute_grads: (a: number, b: number, c: number) => [number, number, number, number];
    readonly session_eval_word: (a: number, b: number, c: number, d: number) => [number, number, number, number];
    readonly session_export_meta: (a: number) => [number, number];
    readonly session_export_model: (a: number) => [number, number, number, number];
    readonly session_export_optimizer: (a: number) => [number, number, number, number];
    readonly session_export_pairs: (a: number) => [number, number];
    readonly session_export_tokenizer: (a: number) => [number, number];
    readonly session_from_model: (a: number, b: number, c: number, d: number, e: number, f: number) => [number, number, number];
    readonly session_generate: (a: number, b: number, c: number, d: number, e: number, f: number) => [number, number, number, number];
    readonly session_mine_shard: (a: number, b: number, c: number, d: number, e: number) => [number, number, number, number];
    readonly session_new: (a: number, b: number, c: number, d: number) => [number, number, number];
    readonly session_num_params: (a: number) => number;
    readonly session_phase: (a: number) => [number, number];
    readonly session_preference_accuracy: (a: number) => number;
    readonly session_restore: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number, j: number, k: number, l: number) => [number, number, number];
    readonly session_start_dpo: (a: number, b: number, c: number) => [number, number];
    readonly session_start_finetune: (a: number, b: number, c: number) => [number, number];
    readonly session_step: (a: number, b: number) => number;
    readonly session_step_count: (a: number) => number;
    readonly session_template: (a: number) => [number, number];
    readonly session_token_count: (a: number) => number;
    readonly session_total_steps: (a: number) => number;
    readonly session_validate: (a: number) => number;
    readonly session_vocab_size: (a: number) => number;
    readonly tokenizerlab_decode: (a: number, b: number, c: number) => [number, number, number, number];
    readonly tokenizerlab_encode: (a: number, b: number, c: number) => [number, number, number, number];
    readonly tokenizerlab_learned_merges: (a: number) => number;
    readonly tokenizerlab_merges: (a: number, b: number) => [number, number];
    readonly tokenizerlab_new: (a: number, b: number, c: number) => [number, number, number];
    readonly tokenizerlab_set_merges: (a: number, b: number) => void;
    readonly tokenizerlab_vocab_size: (a: number) => number;
    readonly vocab_bytes: (a: number) => [number, number];
    readonly __wbindgen_free: (a: number, b: number, c: number) => void;
    readonly __wbindgen_malloc: (a: number, b: number) => number;
    readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
    readonly __wbindgen_externrefs: WebAssembly.Table;
    readonly __externref_table_dealloc: (a: number) => void;
    readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
 * Instantiates the given `module`, which can either be bytes or
 * a precompiled `WebAssembly.Module`.
 *
 * @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
 *
 * @returns {InitOutput}
 */
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
 * If `module_or_path` is {RequestInfo} or {URL}, makes a request and
 * for everything else, calls `WebAssembly.instantiate` directly.
 *
 * @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
 *
 * @returns {Promise<InitOutput>}
 */
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
