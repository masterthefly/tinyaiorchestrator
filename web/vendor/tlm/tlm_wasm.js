/* @ts-self-types="./tlm_wasm.d.ts" */

/**
 * A frozen copy of a model's token-embedding table (one row of `dim` numbers per token),
 * plus the tools the chapter needs to look at it: neighbours and a 2-D map.
 *
 * "Frozen" matters: the reader trains a model and keeps a snapshot every few hundred steps,
 * then scrubs through them to watch the table change.
 */
export class EmbeddingView {
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        EmbeddingViewFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_embeddingview_free(ptr, 0);
    }
    /**
     * @returns {number}
     */
    dim() {
        const ret = wasm.embeddingview_dim(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * Share of the variation this table has along its own two main directions, `[first, second]`.
     * @returns {Float32Array}
     */
    explained_variance() {
        const ret = wasm.embeddingview_explained_variance(this.__wbg_ptr);
        var v1 = getArrayF32FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 4, 4);
        return v1;
    }
    /**
     * Where every token lands on this table's own 2-D map: `[x0, y0, x1, y1, ...]`.
     * @returns {Float32Array}
     */
    map() {
        const ret = wasm.embeddingview_map(this.__wbg_ptr);
        var v1 = getArrayF32FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 4, 4);
        return v1;
    }
    /**
     * Where every token of THIS table lands when using `basis`'s map axes. Using the final
     * model's axes for every snapshot keeps the picture steady while the reader scrubs.
     * @param {EmbeddingView} basis
     * @returns {Float32Array}
     */
    map_with(basis) {
        _assertClass(basis, EmbeddingView);
        const ret = wasm.embeddingview_map_with(this.__wbg_ptr, basis.__wbg_ptr);
        if (ret[3]) {
            throw takeFromExternrefTable0(ret[2]);
        }
        var v1 = getArrayF32FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 4, 4);
        return v1;
    }
    /**
     * The `k` tokens whose vectors point most nearly the same way as token `id`'s (cosine
     * similarity, highest first), as JSON `{id, similarity}`. The token itself is excluded.
     * @param {number} id
     * @param {number} k
     * @returns {string}
     */
    neighbors(id, k) {
        let deferred2_0;
        let deferred2_1;
        try {
            const ret = wasm.embeddingview_neighbors(this.__wbg_ptr, id, k);
            var ptr1 = ret[0];
            var len1 = ret[1];
            if (ret[3]) {
                ptr1 = 0; len1 = 0;
                throw takeFromExternrefTable0(ret[2]);
            }
            deferred2_0 = ptr1;
            deferred2_1 = len1;
            return getStringFromWasm0(ptr1, len1);
        } finally {
            wasm.__wbindgen_free(deferred2_0, deferred2_1, 1);
        }
    }
    /**
     * Copy the token-embedding table out of a session's current model.
     * @param {Session} session
     */
    constructor(session) {
        _assertClass(session, Session);
        const ret = wasm.embeddingview_new(session.__wbg_ptr);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        this.__wbg_ptr = ret[0];
        EmbeddingViewFinalization.register(this, this.__wbg_ptr, this);
        return this;
    }
    /**
     * The bytes token `id` stands for.
     * @param {number} id
     * @returns {Uint8Array}
     */
    token_bytes(id) {
        const ret = wasm.embeddingview_token_bytes(this.__wbg_ptr, id);
        if (ret[3]) {
            throw takeFromExternrefTable0(ret[2]);
        }
        var v1 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        return v1;
    }
    /**
     * The `dim` numbers that stand for token `id`.
     * @param {number} id
     * @returns {Float32Array}
     */
    vector(id) {
        const ret = wasm.embeddingview_vector(this.__wbg_ptr, id);
        if (ret[3]) {
            throw takeFromExternrefTable0(ret[2]);
        }
        var v1 = getArrayF32FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 4, 4);
        return v1;
    }
    /**
     * Every token's bytes, as a JSON list of byte lists (index = token id).
     * @returns {string}
     */
    vocab_json() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.embeddingview_vocab_json(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * @returns {number}
     */
    vocab_size() {
        const ret = wasm.embeddingview_vocab_size(this.__wbg_ptr);
        return ret >>> 0;
    }
}
if (Symbol.dispose) EmbeddingView.prototype[Symbol.dispose] = EmbeddingView.prototype.free;

export class Session {
    static __wrap(ptr) {
        const obj = Object.create(Session.prototype);
        obj.__wbg_ptr = ptr;
        SessionFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        SessionFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_session_free(ptr, 0);
    }
    /**
     * Preference tuning, step 2: hand over each worker's mining result, in shard order.
     * @param {Uint8Array | number[]} blob
     */
    add_mined(blob) {
        const ptr0 = passArray8ToWasm0(blob, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.session_add_mined(this.__wbg_ptr, ptr0, len0);
        if (ret[1]) {
            throw takeFromExternrefTable0(ret[0]);
        }
    }
    /**
     * Answer `input` using the fine-tuning template (e.g. a word -> a sentence using it).
     * @param {string} input
     * @param {number} n_tokens
     * @param {number} temperature
     * @param {number} seed
     * @returns {string}
     */
    answer(input, n_tokens, temperature, seed) {
        let deferred6_0;
        let deferred6_1;
        try {
            const val2 = +n_tokens;
            const val3 = +temperature;
            const val4 = +seed;
            const ptr0 = passStringToWasm0(input, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            const len0 = WASM_VECTOR_LEN;
            const ret = wasm.session_answer(this.__wbg_ptr, ptr0, len0, val2, val3, val4);
            var ptr5 = ret[0];
            var len5 = ret[1];
            if (ret[3]) {
                ptr5 = 0; len5 = 0;
                throw takeFromExternrefTable0(ret[2]);
            }
            deferred6_0 = ptr5;
            deferred6_1 = len5;
            return getStringFromWasm0(ptr5, len5);
        } finally {
            wasm.__wbindgen_free(deferred6_0, deferred6_1, 1);
        }
    }
    /**
     * Data-parallel half 2: apply the SUM of all workers' flat gradient lists.
     * @param {Float32Array | number[]} summed
     */
    apply_grads(summed) {
        const ptr0 = passArrayF32ToWasm0(summed, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.session_apply_grads(this.__wbg_ptr, ptr0, len0);
        if (ret[1]) {
            throw takeFromExternrefTable0(ret[0]);
        }
    }
    /**
     * Convert a per-token loss to bits per byte (8.0 = knows nothing about bytes).
     * @param {number} loss
     * @returns {number}
     */
    bits_per_byte(loss) {
        const ret = wasm.session_bits_per_byte(this.__wbg_ptr, loss);
        return ret;
    }
    /**
     * @returns {number}
     */
    bytes_per_token() {
        const ret = wasm.session_bytes_per_token(this.__wbg_ptr);
        return ret;
    }
    /**
     * A fingerprint of the weights: equal on every worker if they are in sync.
     * @returns {number}
     */
    checksum() {
        const ret = wasm.session_checksum(this.__wbg_ptr);
        return ret;
    }
    /**
     * Data-parallel half 1: gradients for worker `shard` of `n_shards`, as one flat
     * list whose last number is this share's loss. Add the shares of all workers.
     * @param {number} shard
     * @param {number} n_shards
     * @returns {Float32Array}
     */
    compute_grads(shard, n_shards) {
        const ret = wasm.session_compute_grads(this.__wbg_ptr, shard, n_shards);
        if (ret[3]) {
            throw takeFromExternrefTable0(ret[2]);
        }
        var v1 = getArrayF32FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 4, 4);
        return v1;
    }
    /**
     * Score the model on held-out questions. For the built-in task returns JSON
     * { n, uses_word, chance, stops, samples: [[prompt, answer], ...] }; for the user's own examples
     * { task: "custom", n, stops, exact, samples: [{prompt, answer, reference}, ...] }.
     * @param {number} n
     * @param {number} temperature
     * @param {number} seed
     * @returns {string}
     */
    eval_word(n, temperature, seed) {
        let deferred2_0;
        let deferred2_1;
        try {
            const ret = wasm.session_eval_word(this.__wbg_ptr, n, temperature, seed);
            var ptr1 = ret[0];
            var len1 = ret[1];
            if (ret[3]) {
                ptr1 = 0; len1 = 0;
                throw takeFromExternrefTable0(ret[2]);
            }
            deferred2_0 = ptr1;
            deferred2_1 = len1;
            return getStringFromWasm0(ptr1, len1);
        } finally {
            wasm.__wbindgen_free(deferred2_0, deferred2_1, 1);
        }
    }
    /**
     * Everything else needed to restore this session, as JSON.
     * @returns {string}
     */
    export_meta() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.session_export_meta(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * The model as a safetensors file (the same format the `tlm` command-line tool reads).
     * @returns {Uint8Array}
     */
    export_model() {
        const ret = wasm.session_export_model(this.__wbg_ptr);
        if (ret[3]) {
            throw takeFromExternrefTable0(ret[2]);
        }
        var v1 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        return v1;
    }
    /**
     * Adam's memory, needed to resume training exactly.
     * @returns {Uint8Array}
     */
    export_optimizer() {
        const ret = wasm.session_export_optimizer(this.__wbg_ptr);
        if (ret[3]) {
            throw takeFromExternrefTable0(ret[2]);
        }
        var v1 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        return v1;
    }
    /**
     * The scored preference pairs as bytes (empty outside preference tuning). Needed to resume a run.
     * @returns {Uint8Array}
     */
    export_pairs() {
        const ret = wasm.session_export_pairs(this.__wbg_ptr);
        var v1 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        return v1;
    }
    /**
     * The tokenizer as JSON (save it next to the model as tokenizer.json).
     * @returns {string}
     */
    export_tokenizer() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.session_export_tokenizer(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * Open a downloaded model file for chatting (no training).
     * @param {Uint8Array | number[]} model_bytes
     * @param {string} tokenizer_json
     * @param {string | null} [template]
     * @returns {Session}
     */
    static from_model(model_bytes, tokenizer_json, template) {
        let ptr0, len0, ptr1, len1, ptr2, len2;
        try {
            ptr0 = passArray8ToWasm0(model_bytes, wasm.__wbindgen_malloc);
            len0 = WASM_VECTOR_LEN;
            ptr1 = passStringToWasm0(tokenizer_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            len1 = WASM_VECTOR_LEN;
            ptr2 = isLikeNone(template) ? 0 : passStringToWasm0(template, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            len2 = WASM_VECTOR_LEN;
        } catch (e) {
            if (ptr2) { wasm.__wbindgen_free(ptr2, len2 * 1, 1); }
            if (ptr1) { wasm.__wbindgen_free(ptr1, len1 * 1, 1); }
            if (ptr0) { wasm.__wbindgen_free(ptr0, len0 * 1, 1); }
            throw e;
        }
        const ret = wasm.session_from_model(ptr0, len0, ptr1, len1, ptr2, len2);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return Session.__wrap(ret[0]);
    }
    /**
     * Continue `prompt` with up to `n_tokens` new tokens (works in every phase).
     * @param {string} prompt
     * @param {number} n_tokens
     * @param {number} temperature
     * @param {number} seed
     * @returns {string}
     */
    generate(prompt, n_tokens, temperature, seed) {
        let deferred6_0;
        let deferred6_1;
        try {
            const val2 = +n_tokens;
            const val3 = +temperature;
            const val4 = +seed;
            const ptr0 = passStringToWasm0(prompt, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            const len0 = WASM_VECTOR_LEN;
            const ret = wasm.session_generate(this.__wbg_ptr, ptr0, len0, val2, val3, val4);
            var ptr5 = ret[0];
            var len5 = ret[1];
            if (ret[3]) {
                ptr5 = 0; len5 = 0;
                throw takeFromExternrefTable0(ret[2]);
            }
            deferred6_0 = ptr5;
            deferred6_1 = len5;
            return getStringFromWasm0(ptr5, len5);
        } finally {
            wasm.__wbindgen_free(deferred6_0, deferred6_1, 1);
        }
    }
    /**
     * Preference tuning, step 1: sample answers for this worker's share of the prompts
     * (`shard` of `n_shards`) and pair good answers with bad ones. Returns the pairs as bytes.
     * @param {string} settings_json
     * @param {number} shard
     * @param {number} n_shards
     * @returns {Uint8Array}
     */
    mine_shard(settings_json, shard, n_shards) {
        const val2 = +shard;
        const val3 = +n_shards;
        const ptr0 = passStringToWasm0(settings_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.session_mine_shard(this.__wbg_ptr, ptr0, len0, val2, val3);
        if (ret[3]) {
            throw takeFromExternrefTable0(ret[2]);
        }
        var v4 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        return v4;
    }
    /**
     * Train a tokenizer on `text` and set up a fresh model, ready to pre-train.
     * @param {string} text
     * @param {string} config_json
     */
    constructor(text, config_json) {
        let ptr0, len0, ptr1, len1;
        try {
            ptr0 = passStringToWasm0(text, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            len0 = WASM_VECTOR_LEN;
            ptr1 = passStringToWasm0(config_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            len1 = WASM_VECTOR_LEN;
        } catch (e) {
            if (ptr1) { wasm.__wbindgen_free(ptr1, len1 * 1, 1); }
            if (ptr0) { wasm.__wbindgen_free(ptr0, len0 * 1, 1); }
            throw e;
        }
        const ret = wasm.session_new(ptr0, len0, ptr1, len1);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        this.__wbg_ptr = ret[0];
        SessionFinalization.register(this, this.__wbg_ptr, this);
        return this;
    }
    /**
     * @returns {number}
     */
    num_params() {
        const ret = wasm.session_num_params(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * @returns {string}
     */
    phase() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.session_phase(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * Fraction of held-out preference pairs where the model now favours the chosen answer
     * more than the reference did (NaN outside preference tuning).
     * @returns {number}
     */
    preference_accuracy() {
        const ret = wasm.session_preference_accuracy(this.__wbg_ptr);
        return ret;
    }
    /**
     * Rebuild a saved session. `text` must be the same text it was trained on.
     * `pairs_bytes` is the output of `export_pairs` (empty unless the session was
     * in preference tuning).
     * @param {string} text
     * @param {string} meta_json
     * @param {Uint8Array | number[]} model_bytes
     * @param {Uint8Array | number[]} optimizer_bytes
     * @param {string} tokenizer_json
     * @param {Uint8Array | number[]} pairs_bytes
     * @returns {Session}
     */
    static restore(text, meta_json, model_bytes, optimizer_bytes, tokenizer_json, pairs_bytes) {
        let ptr0, len0, ptr1, len1, ptr2, len2, ptr3, len3, ptr4, len4, ptr5, len5;
        try {
            ptr0 = passStringToWasm0(text, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            len0 = WASM_VECTOR_LEN;
            ptr1 = passStringToWasm0(meta_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            len1 = WASM_VECTOR_LEN;
            ptr2 = passArray8ToWasm0(model_bytes, wasm.__wbindgen_malloc);
            len2 = WASM_VECTOR_LEN;
            ptr3 = passArray8ToWasm0(optimizer_bytes, wasm.__wbindgen_malloc);
            len3 = WASM_VECTOR_LEN;
            ptr4 = passStringToWasm0(tokenizer_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            len4 = WASM_VECTOR_LEN;
            ptr5 = passArray8ToWasm0(pairs_bytes, wasm.__wbindgen_malloc);
            len5 = WASM_VECTOR_LEN;
        } catch (e) {
            if (ptr5) { wasm.__wbindgen_free(ptr5, len5 * 1, 1); }
            if (ptr4) { wasm.__wbindgen_free(ptr4, len4 * 1, 1); }
            if (ptr3) { wasm.__wbindgen_free(ptr3, len3 * 1, 1); }
            if (ptr2) { wasm.__wbindgen_free(ptr2, len2 * 1, 1); }
            if (ptr1) { wasm.__wbindgen_free(ptr1, len1 * 1, 1); }
            if (ptr0) { wasm.__wbindgen_free(ptr0, len0 * 1, 1); }
            throw e;
        }
        const ret = wasm.session_restore(ptr0, len0, ptr1, len1, ptr2, len2, ptr3, len3, ptr4, len4, ptr5, len5);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return Session.__wrap(ret[0]);
    }
    /**
     * Preference tuning, step 3: score the collected pairs with the model as it is now
     * (the frozen reference) and switch to preference training.
     * @param {string} settings_json
     */
    start_dpo(settings_json) {
        const ptr0 = passStringToWasm0(settings_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.session_start_dpo(this.__wbg_ptr, ptr0, len0);
        if (ret[1]) {
            throw takeFromExternrefTable0(ret[0]);
        }
    }
    /**
     * Switch from pre-training to fine-tuning on a built-in "use the word" task.
     * @param {string} settings_json
     */
    start_finetune(settings_json) {
        const ptr0 = passStringToWasm0(settings_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.session_start_finetune(this.__wbg_ptr, ptr0, len0);
        if (ret[1]) {
            throw takeFromExternrefTable0(ret[0]);
        }
    }
    /**
     * Run `n` steps of the current phase. Returns the last training loss.
     * @param {number} n
     * @returns {number}
     */
    step(n) {
        const ret = wasm.session_step(this.__wbg_ptr, n);
        return ret;
    }
    /**
     * @returns {number}
     */
    step_count() {
        const ret = wasm.session_step_count(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * The prompt layout used by `answer`, if the model was fine-tuned.
     * @returns {string | undefined}
     */
    template() {
        const ret = wasm.session_template(this.__wbg_ptr);
        let v1;
        if (ret[0] !== 0) {
            v1 = getStringFromWasm0(ret[0], ret[1]);
            wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        }
        return v1;
    }
    /**
     * @returns {number}
     */
    token_count() {
        const ret = wasm.session_token_count(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * @returns {number}
     */
    total_steps() {
        const ret = wasm.session_total_steps(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * Loss on held-out text (pre-training), held-out answers (fine-tuning) or held-out
     * preference pairs (preference tuning).
     * @returns {number}
     */
    validate() {
        const ret = wasm.session_validate(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {number}
     */
    vocab_size() {
        const ret = wasm.session_vocab_size(this.__wbg_ptr);
        return ret >>> 0;
    }
}
if (Symbol.dispose) Session.prototype[Symbol.dispose] = Session.prototype.free;

/**
 * A tokenizer trained once, whose vocabulary can then be shrunk to "the first k merges".
 * Because merges are learned in order, the first k merges are exactly the tokenizer you would
 * get by asking for a vocabulary of 256 + k.
 */
export class TokenizerLab {
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        TokenizerLabFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_tokenizerlab_free(ptr, 0);
    }
    /**
     * Token ids -> text. Ids outside the current vocabulary are an error, not a panic.
     * @param {Uint32Array | number[]} ids
     * @returns {string}
     */
    decode(ids) {
        let deferred3_0;
        let deferred3_1;
        try {
            const ptr0 = passArray32ToWasm0(ids, wasm.__wbindgen_malloc);
            const len0 = WASM_VECTOR_LEN;
            const ret = wasm.tokenizerlab_decode(this.__wbg_ptr, ptr0, len0);
            var ptr2 = ret[0];
            var len2 = ret[1];
            if (ret[3]) {
                ptr2 = 0; len2 = 0;
                throw takeFromExternrefTable0(ret[2]);
            }
            deferred3_0 = ptr2;
            deferred3_1 = len2;
            return getStringFromWasm0(ptr2, len2);
        } finally {
            wasm.__wbindgen_free(deferred3_0, deferred3_1, 1);
        }
    }
    /**
     * Text -> JSON list of `{id, bytes}`, one entry per token, in order.
     * @param {string} text
     * @returns {string}
     */
    encode(text) {
        let deferred3_0;
        let deferred3_1;
        try {
            const ptr0 = passStringToWasm0(text, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            const len0 = WASM_VECTOR_LEN;
            const ret = wasm.tokenizerlab_encode(this.__wbg_ptr, ptr0, len0);
            var ptr2 = ret[0];
            var len2 = ret[1];
            if (ret[3]) {
                ptr2 = 0; len2 = 0;
                throw takeFromExternrefTable0(ret[2]);
            }
            deferred3_0 = ptr2;
            deferred3_1 = len2;
            return getStringFromWasm0(ptr2, len2);
        } finally {
            wasm.__wbindgen_free(deferred3_0, deferred3_1, 1);
        }
    }
    /**
     * How many merges were actually learned (fewer than asked if the text ran out of pairs).
     * @returns {number}
     */
    learned_merges() {
        const ret = wasm.tokenizerlab_learned_merges(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * The first `count` merges (of the full list) as JSON `{id, left, right}`, with each side
     * given as the bytes it stands for. This is the "recipe" the tokenizer learned.
     * @param {number} count
     * @returns {string}
     */
    merges(count) {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.tokenizerlab_merges(this.__wbg_ptr, count);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * Learn up to `max_merges` merges from `text` (only its first megabyte is used).
     * @param {string} text
     * @param {number} max_merges
     */
    constructor(text, max_merges) {
        const val2 = +max_merges;
        const ptr0 = passStringToWasm0(text, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.tokenizerlab_new(ptr0, len0, val2);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        this.__wbg_ptr = ret[0];
        TokenizerLabFinalization.register(this, this.__wbg_ptr, this);
        return this;
    }
    /**
     * Use only the first `k` merges (vocabulary size 256 + k).
     * @param {number} k
     */
    set_merges(k) {
        wasm.tokenizerlab_set_merges(this.__wbg_ptr, k);
    }
    /**
     * @returns {number}
     */
    vocab_size() {
        const ret = wasm.tokenizerlab_vocab_size(this.__wbg_ptr);
        return ret >>> 0;
    }
}
if (Symbol.dispose) TokenizerLab.prototype[Symbol.dispose] = TokenizerLab.prototype.free;

/**
 * Run the session's current model on `text` and report what every attention head did.
 * Only the first `ctx` tokens are used (the model's window).
 * @param {Session} session
 * @param {string} text
 * @returns {string}
 */
export function attention_for_text(session, text) {
    let deferred3_0;
    let deferred3_1;
    try {
        _assertClass(session, Session);
        const ptr0 = passStringToWasm0(text, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.attention_for_text(session.__wbg_ptr, ptr0, len0);
        var ptr2 = ret[0];
        var len2 = ret[1];
        if (ret[3]) {
            ptr2 = 0; len2 = 0;
            throw takeFromExternrefTable0(ret[2]);
        }
        deferred3_0 = ptr2;
        deferred3_1 = len2;
        return getStringFromWasm0(ptr2, len2);
    } finally {
        wasm.__wbindgen_free(deferred3_0, deferred3_1, 1);
    }
}

/**
 * Runs once when the module loads: make Rust panics readable in the browser console.
 */
export function init() {
    wasm.init();
}

/**
 * The raw next-token scores after `text`, so the page can apply temperature itself and show every step.
 * @param {Session} session
 * @param {string} text
 * @returns {string}
 */
export function next_logits(session, text) {
    let deferred3_0;
    let deferred3_1;
    try {
        _assertClass(session, Session);
        const ptr0 = passStringToWasm0(text, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.next_logits(session.__wbg_ptr, ptr0, len0);
        var ptr2 = ret[0];
        var len2 = ret[1];
        if (ret[3]) {
            ptr2 = 0; len2 = 0;
            throw takeFromExternrefTable0(ret[2]);
        }
        deferred3_0 = ptr2;
        deferred3_1 = len2;
        return getStringFromWasm0(ptr2, len2);
    } finally {
        wasm.__wbindgen_free(deferred3_0, deferred3_1, 1);
    }
}

/**
 * For every position of `text`, how likely the session's current model thought the real next token
 * was, and what it would have guessed instead. Only the first `ctx` tokens are used.
 * @param {Session} session
 * @param {string} text
 * @param {number} top_k
 * @returns {string}
 */
export function predict_for_text(session, text, top_k) {
    let deferred4_0;
    let deferred4_1;
    try {
        _assertClass(session, Session);
        const val2 = +top_k;
        const ptr0 = passStringToWasm0(text, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.predict_for_text(session.__wbg_ptr, ptr0, len0, val2);
        var ptr3 = ret[0];
        var len3 = ret[1];
        if (ret[3]) {
            ptr3 = 0; len3 = 0;
            throw takeFromExternrefTable0(ret[2]);
        }
        deferred4_0 = ptr3;
        deferred4_1 = len3;
        return getStringFromWasm0(ptr3, len3);
    } finally {
        wasm.__wbindgen_free(deferred4_0, deferred4_1, 1);
    }
}

/**
 * Every token's bytes, as a JSON list of byte lists (index = token id).
 * @param {Session} session
 * @returns {string}
 */
export function vocab_bytes(session) {
    let deferred1_0;
    let deferred1_1;
    try {
        _assertClass(session, Session);
        const ret = wasm.vocab_bytes(session.__wbg_ptr);
        deferred1_0 = ret[0];
        deferred1_1 = ret[1];
        return getStringFromWasm0(ret[0], ret[1]);
    } finally {
        wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
    }
}
function __wbg_get_imports() {
    const import0 = {
        __proto__: null,
        __wbg_Error_208446807d0d1e30: function(arg0, arg1) {
            const ret = Error(getStringFromWasm0(arg0, arg1));
            return ret;
        },
        __wbg___wbindgen_throw_4c88d8bf264fd984: function(arg0, arg1) {
            throw new Error(getStringFromWasm0(arg0, arg1));
        },
        __wbg_error_757e9472f8410341: function(arg0, arg1) {
            let deferred0_0;
            let deferred0_1;
            try {
                deferred0_0 = arg0;
                deferred0_1 = arg1;
                console.error(getStringFromWasm0(arg0, arg1));
            } finally {
                wasm.__wbindgen_free(deferred0_0, deferred0_1, 1);
            }
        },
        __wbg_new_bb74001155cb8ca8: function() {
            const ret = new Error();
            return ret;
        },
        __wbg_stack_575c4e0918581b9c: function(arg0, arg1) {
            const ret = arg1.stack;
            const ptr1 = passStringToWasm0(ret, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            const len1 = WASM_VECTOR_LEN;
            getDataViewMemory0().setInt32((arg0 >>> 0) + 4 * 1, len1, true);
            getDataViewMemory0().setInt32((arg0 >>> 0) + 4 * 0, ptr1, true);
        },
        __wbindgen_init_externref_table: function() {
            const table = wasm.__wbindgen_externrefs;
            table.set(0, undefined);
            table.set(1024, undefined);
            table.set(1025, null);
            table.set(1026, true);
            table.set(1027, false);
        },
    };
    return {
        __proto__: null,
        "./tlm_wasm_bg.js": import0,
    };
}

const EmbeddingViewFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_embeddingview_free(ptr, 1));
const SessionFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_session_free(ptr, 1));
const TokenizerLabFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_tokenizerlab_free(ptr, 1));

function _assertClass(instance, klass) {
    if (!(instance instanceof klass)) {
        throw new Error(`expected instance of ${klass.name}`);
    }
}

function getArrayF32FromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    return getFloat32ArrayMemory0().subarray(ptr / 4, ptr / 4 + len);
}

function getArrayU8FromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    return getUint8ArrayMemory0().subarray(ptr / 1, ptr / 1 + len);
}

let cachedDataViewMemory0 = null;
function getDataViewMemory0() {
    if (cachedDataViewMemory0 === null || cachedDataViewMemory0.buffer.detached === true || (cachedDataViewMemory0.buffer.detached === undefined && cachedDataViewMemory0.buffer !== wasm.memory.buffer)) {
        cachedDataViewMemory0 = new DataView(wasm.memory.buffer);
    }
    return cachedDataViewMemory0;
}

let cachedFloat32ArrayMemory0 = null;
function getFloat32ArrayMemory0() {
    if (cachedFloat32ArrayMemory0 === null || cachedFloat32ArrayMemory0.byteLength === 0) {
        cachedFloat32ArrayMemory0 = new Float32Array(wasm.memory.buffer);
    }
    return cachedFloat32ArrayMemory0;
}

function getStringFromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    return decodeText(getUint8ArrayMemory0().subarray(ptr, ptr + len));
}

let cachedUint32ArrayMemory0 = null;
function getUint32ArrayMemory0() {
    if (cachedUint32ArrayMemory0 === null || cachedUint32ArrayMemory0.byteLength === 0) {
        cachedUint32ArrayMemory0 = new Uint32Array(wasm.memory.buffer);
    }
    return cachedUint32ArrayMemory0;
}

let cachedUint8ArrayMemory0 = null;
function getUint8ArrayMemory0() {
    if (cachedUint8ArrayMemory0 === null || cachedUint8ArrayMemory0.byteLength === 0) {
        cachedUint8ArrayMemory0 = new Uint8Array(wasm.memory.buffer);
    }
    return cachedUint8ArrayMemory0;
}

function isLikeNone(x) {
    return x === undefined || x === null;
}

function passArray32ToWasm0(arg, malloc) {
    const ptr = malloc(arg.length * 4, 4) >>> 0;
    getUint32ArrayMemory0().set(arg, ptr / 4);
    WASM_VECTOR_LEN = arg.length;
    return ptr;
}

function passArray8ToWasm0(arg, malloc) {
    const ptr = malloc(arg.length * 1, 1) >>> 0;
    getUint8ArrayMemory0().set(arg, ptr / 1);
    WASM_VECTOR_LEN = arg.length;
    return ptr;
}

function passArrayF32ToWasm0(arg, malloc) {
    const ptr = malloc(arg.length * 4, 4) >>> 0;
    getFloat32ArrayMemory0().set(arg, ptr / 4);
    WASM_VECTOR_LEN = arg.length;
    return ptr;
}

function passStringToWasm0(arg, malloc, realloc) {
    if (realloc === undefined) {
        const buf = cachedTextEncoder.encode(arg);
        const ptr = malloc(buf.length, 1) >>> 0;
        getUint8ArrayMemory0().subarray(ptr, ptr + buf.length).set(buf);
        WASM_VECTOR_LEN = buf.length;
        return ptr;
    }

    let len = arg.length;
    let ptr = malloc(len, 1) >>> 0;

    const mem = getUint8ArrayMemory0();

    let offset = 0;

    for (; offset < len; offset++) {
        const code = arg.charCodeAt(offset);
        if (code > 0x7F) break;
        mem[ptr + offset] = code;
    }
    if (offset !== len) {
        if (offset !== 0) {
            arg = arg.slice(offset);
        }
        ptr = realloc(ptr, len, len = offset + arg.length * 3, 1) >>> 0;
        const view = getUint8ArrayMemory0().subarray(ptr + offset, ptr + len);
        const ret = cachedTextEncoder.encodeInto(arg, view);

        offset += ret.written;
        ptr = realloc(ptr, len, offset, 1) >>> 0;
    }

    WASM_VECTOR_LEN = offset;
    return ptr;
}

function takeFromExternrefTable0(idx) {
    const value = wasm.__wbindgen_externrefs.get(idx);
    wasm.__externref_table_dealloc(idx);
    return value;
}

let cachedTextDecoder = new TextDecoder('utf-8', { ignoreBOM: true });
cachedTextDecoder.decode();
const MAX_SAFARI_DECODE_BYTES = 2146435072;
let numBytesDecoded = 0;
function decodeText(bytes) {
    numBytesDecoded += bytes.length;
    if (numBytesDecoded >= MAX_SAFARI_DECODE_BYTES) {
        cachedTextDecoder = new TextDecoder('utf-8', { ignoreBOM: true });
        cachedTextDecoder.decode();
        numBytesDecoded = bytes.length;
    }
    return cachedTextDecoder.decode(bytes);
}

const cachedTextEncoder = new TextEncoder();

if (!('encodeInto' in cachedTextEncoder)) {
    cachedTextEncoder.encodeInto = function (arg, view) {
        const buf = cachedTextEncoder.encode(arg);
        view.set(buf);
        return {
            read: arg.length,
            written: buf.length
        };
    };
}

let WASM_VECTOR_LEN = 0;

let wasmModule, wasmInstance, wasm;
function __wbg_finalize_init(instance, module) {
    wasmInstance = instance;
    wasm = instance.exports;
    wasmModule = module;
    cachedDataViewMemory0 = null;
    cachedFloat32ArrayMemory0 = null;
    cachedUint32ArrayMemory0 = null;
    cachedUint8ArrayMemory0 = null;
    wasm.__wbindgen_start();
    return wasm;
}

async function __wbg_load(module, imports) {
    if (typeof Response === 'function' && module instanceof Response) {
        if (!module.ok) {
            throw new Error(`failed to fetch Wasm: ${module.status} ${module.statusText} fetching '${module.url}'`);
        }

        if (typeof WebAssembly.instantiateStreaming === 'function') {
            try {
                return await WebAssembly.instantiateStreaming(module, imports);
            } catch (e) {
                const validResponse = expectedResponseType(module.type);

                if (validResponse && module.headers.get('Content-Type') !== 'application/wasm') {
                    console.warn("`WebAssembly.instantiateStreaming` failed because your server does not serve Wasm with `application/wasm` MIME type. Falling back to `WebAssembly.instantiate` which is slower. Original error:\n", e);

                } else { throw e; }
            }
        }

        const bytes = await module.arrayBuffer();
        return await WebAssembly.instantiate(bytes, imports);
    } else {
        const instance = await WebAssembly.instantiate(module, imports);

        if (instance instanceof WebAssembly.Instance) {
            return { instance, module };
        } else {
            return instance;
        }
    }

    function expectedResponseType(type) {
        switch (type) {
            case 'basic': case 'cors': case 'default': return true;
        }
        return false;
    }
}

function initSync(module) {
    if (wasm !== undefined) return wasm;


    if (module !== undefined) {
        if (Object.getPrototypeOf(module) === Object.prototype) {
            ({module} = module)
        } else {
            console.warn('using deprecated parameters for `initSync()`; pass a single object instead')
        }
    }

    const imports = __wbg_get_imports();
    if (!(module instanceof WebAssembly.Module)) {
        module = new WebAssembly.Module(module);
    }
    const instance = new WebAssembly.Instance(module, imports);
    return __wbg_finalize_init(instance, module);
}

let __wbg_init_promise;
async function __wbg_init(module_or_path) {
    if (wasm !== undefined) return wasm;
    if (__wbg_init_promise === undefined) {
        __wbg_init_promise = __wbg_init_once(module_or_path);
        __wbg_init_promise.catch(() => { __wbg_init_promise = undefined; });
    }
    return __wbg_init_promise;
}

async function __wbg_init_once(module_or_path) {

    if (module_or_path !== undefined) {
        if (Object.getPrototypeOf(module_or_path) === Object.prototype) {
            ({module_or_path} = module_or_path)
        } else {
            console.warn('using deprecated parameters for the initialization function; pass a single object instead')
        }
    }

    if (module_or_path === undefined) {
        module_or_path = new URL('tlm_wasm_bg.wasm', import.meta.url);
    }
    const imports = __wbg_get_imports();

    if (typeof module_or_path === 'string' || (typeof Request === 'function' && module_or_path instanceof Request) || (typeof URL === 'function' && module_or_path instanceof URL)) {
        module_or_path = fetch(module_or_path);
    }

    const { instance, module } = await __wbg_load(await module_or_path, imports);

    return __wbg_finalize_init(instance, module);
}

export { initSync, __wbg_init as default };
