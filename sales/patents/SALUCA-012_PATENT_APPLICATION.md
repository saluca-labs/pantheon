# UNITED STATES PROVISIONAL PATENT APPLICATION

**Application Number:** [To be assigned]
**Filing Date:** [To be assigned]
**Applicant:** Saluca LLC
**Inventor:** Cristian Xavier Ruvalcaba
**Docket Number:** SALUCA-012
**Filing Status:** Pro Se
**Entity Status:** Micro Entity

---

## 1. TITLE OF THE INVENTION

**Method and System for Covert Communication Using Steganographic Encoding Over Frozen Large Language Model Token Probability Distributions with Portable Channel Definition Files**

---

## 2. CROSS-REFERENCE TO RELATED APPLICATIONS

This application is related to the following U.S. Provisional Patent Applications filed by the same applicant, the disclosures of which are incorporated herein by reference in their entirety:

- SALUCA-014, entitled "System and Method for Health-Aware Multi-Provider Large Language Model Proxy with Cascading Failover and Encrypted Audit Logging"
- SALUCA-015, entitled "System and Method for Hybrid Offline-Online License Validation with Grace Period State Machine and Relay Proxy Renewal"

---

## 3. FIELD OF THE INVENTION

The present invention relates generally to the field of steganographic communication systems and, more particularly, to methods and systems for embedding covert messages within large language model (LLM) generated natural-language text using arithmetic coding over pre-computed, frozen token probability distributions. The invention encompasses the capture and serialization of LLM token probability distributions into portable channel definition files, deterministic steganographic encoding and decoding operations that are independent of live LLM inference infrastructure, cross-machine determinism guarantees for heterogeneous computing environments, tree-structured multi-node distribution capture for increased channel capacity, and a channel establishment and rotation protocol for operational security.

---

## 4. BACKGROUND OF THE INVENTION

### 4.1 State of the Art

Steganography is the practice of concealing a message within an innocuous carrier medium such that the existence of the hidden communication is not apparent to an observer. Traditional digital steganographic methods primarily target image, audio, or video files by modifying least-significant bits (LSB) or perceptual features of the carrier medium. The emergence of large language models (LLMs) capable of generating fluent, contextually appropriate natural-language text has introduced a fundamentally new class of steganographic carrier: generated text itself.

Neural text steganography exploits the token-by-token generative process of autoregressive language models, where at each generation step the model produces a probability distribution over its vocabulary of tokens. By manipulating the token selection process according to an encoding scheme, a sender can embed hidden information within text that appears to be ordinary model-generated output. The resulting stego-text is designed to be statistically indistinguishable from unconstrained model output, making it resistant to both human observation and automated steganalysis.

Arithmetic coding (AC) has emerged as the preferred entropy coding method for neural text steganography because it can achieve near-theoretical channel capacity -- that is, the maximum number of secret bits embeddable per generated token approaches the entropy of the model's output distribution at each step. This near-optimality makes AC-based methods substantially more efficient than fixed-width encoding schemes or Huffman-tree-based approaches.

### 4.2 Limitations of Existing Solutions

Several existing systems and academic publications address aspects of neural text steganography, but each suffers from significant limitations that the present invention overcomes:

**Ziegler et al., "Neural Linguistic Steganography" (2019)** proposed arithmetic coding over neural language model token distributions as a steganographic encoding method. This work demonstrated that AC-based neural steganography could generate realistic cover text while embedding hidden messages at rates approaching theoretical capacity. However, Ziegler et al. require live inference from the language model at both encoding and decoding time. The token probability distribution is computed on-the-fly by querying the model during each step of the encode and decode process. This creates a fundamental dependency on the specific model instance, hardware platform, floating-point precision, and inference engine used. In practice, the probability distributions produced by the same nominal model running on different hardware (e.g., GPU vs. CPU), different inference engines (e.g., llama.cpp vs. vLLM vs. Ollama), or different operating systems diverge due to floating-point non-determinism, making cross-machine decoding infeasible. Ziegler et al. do not address this cross-machine determinism problem, do not propose any mechanism for decoupling the distribution from the inference environment, and do not provide a portable channel artifact that enables LLM-independent encode/decode operations.

**Kaptchuk et al., "Meteor: Cryptographically Secure Steganography for Realistic Distributions" (ACM CCS 2021, DOI: 10.1145/3460120.3484550)** introduced a symmetric-key steganographic protocol using generative models such as GPT-2. Meteor provides provable security guarantees by ensuring that the stego-text distribution is computationally indistinguishable from the cover distribution to any polynomial-time adversary without the shared key. Meteor maps pseudorandom bit streams to token selections proportional to the model's probability distribution using a shared symmetric key. While Meteor supports deterministic decoding through shared keys and model parameters, it still requires access to the same generative model at both encode and decode time. Both parties must run the identical model to reproduce identical probability distributions. Meteor does not serialize the probability distribution into a portable artifact, does not decouple the distribution-sampling step from the text-generation step, and does not enable encode/decode operations in the complete absence of any LLM infrastructure. Furthermore, Meteor is tied to the specific model version and parameters; if the model is updated, deprecated, or becomes unavailable via API, the steganographic channel is destroyed.

**Dai & Cai, "Towards Near-Imperceptible Steganographic Text" (ACL 2019)** explored patient Huffman coding and statistical sampling-based approaches to neural text steganography. Their work focused on improving the imperceptibility of stego-text by better matching the statistical properties of generated text to the model's natural output distribution. However, Dai & Cai share the same fundamental limitation as Ziegler et al.: dependence on live model inference at encode/decode time, vulnerability to cross-machine distribution divergence, and no mechanism for portable, LLM-independent channel operation.

**Zhang et al., "Provably Secure Generative Linguistic Steganography" (Adaptive Dynamic Grouping / ADG)** introduced a method that recursively groups tokens based on probabilities from an autoregressive language model, with mathematical proof of security under the assumption that the cover distribution is perfectly replicated. ADG achieves near-perfect imperceptibility in experiments on public corpora. However, ADG requires identical model inference at both endpoints and does not address the practical problem of distribution divergence across heterogeneous computing environments. No portable channel definition mechanism is proposed.

**Wu et al., "Generative Text Steganography with Large Language Model" (LLM-Stega, ACM Multimedia 2024)** proposed a black-box generative text steganographic method that operates through LLM user interfaces. LLM-Stega constructs a keyword set with encrypted steganographic mapping and uses reject sampling optimization to ensure accurate secret message extraction while maintaining semantic richness. While LLM-Stega operates in a black-box setting (requiring only API access rather than model weights), it remains dependent on real-time LLM API availability. If the API changes its behavior, rate-limits the user, or becomes unavailable, the steganographic channel fails. LLM-Stega does not freeze probability distributions, does not produce a portable channel artifact, and does not guarantee cross-machine determinism.

**S2LM: Semantic Steganographic Language Model (2025)** extends steganography from bit-level to sentence-level information embedding. While this work demonstrates increased capacity, it operates in a fundamentally different paradigm (semantic embedding into images) and does not address the cross-machine determinism problem for text-based steganography over LLM token distributions.

**"Towards Next-Generation Steganalysis: LLMs Unleash the Power of Detecting Steganography" (2024)** models linguistic steganalysis as a generative paradigm using LLMs, showing superior detection performance over traditional classification methods. This work highlights the increasing sophistication of steganalysis methods, underscoring the importance of steganographic systems that produce output statistically indistinguishable from the model's natural distribution -- a property preserved by the present invention's use of the model's own frozen probability distribution for token selection.

**Discop (2023)** proposes a provably secure steganographic method using distribution copies. While Discop addresses certain security guarantees, it does not decouple the probability distribution from the live model, does not serialize distributions into portable artifacts, and does not address cross-machine determinism.

**US Patent Application Publication US2024/0073189A1** describes methods for steganographic communication using neural networks but focuses on image-domain steganography with neural network encoders and decoders, not on text-domain steganography over LLM token probability distributions.

### 4.3 Unmet Need

All prior art methods for neural text steganography share a critical architectural limitation: they require live large language model inference at both the encoding and decoding endpoints. This creates four fundamental problems:

1. **Cross-Machine Non-Determinism:** The token probability distributions produced by autoregressive language models are sensitive to hardware configuration (GPU model, CPU architecture), floating-point precision (FP16, BF16, FP32), inference engine implementation (llama.cpp, vLLM, Ollama, TensorRT-LLM), quantization scheme (GPTQ, AWQ, GGUF), batch size, and operating system numerics libraries. Two machines running the same nominal model will produce subtly different probability distributions for the same prompt, causing decode failures when the encoder and decoder run on different machines.

2. **Infrastructure Dependency:** Both communicating parties must maintain operational LLM infrastructure (GPU hardware, model weights, inference servers) for the duration of the steganographic channel's lifetime. This imposes significant cost, operational complexity, and availability risk.

3. **Model Lifecycle Vulnerability:** If the LLM is updated to a new version, deprecated by its provider, or becomes unavailable via API, the steganographic channel is permanently destroyed. No prior art method provides a mechanism for channel persistence independent of model availability.

4. **Latency and Cost:** Live LLM inference at encode/decode time introduces latency (typically hundreds of milliseconds to seconds per token) and API cost (for cloud-hosted models), making high-throughput or resource-constrained steganographic communication impractical.

There exists a need in the art for a steganographic communication system that: (a) achieves cross-machine determinism by decoupling the probability distribution from the inference environment; (b) enables encode/decode operations without any live LLM infrastructure; (c) defines a portable channel artifact that can be shared between communicating parties and used indefinitely regardless of model availability; (d) preserves statistical indistinguishability from natural LLM output; and (e) supports channel rotation as an operational security measure.

---

## 5. SUMMARY OF THE INVENTION

The present invention provides a method and system for covert steganographic communication in which hidden messages are encoded into and decoded from natural-language text using arithmetic coding over a pre-computed, frozen token probability distribution derived from a large language model.

The central inventive insight is the decoupling of the distribution-sampling step from the text-generation step. Rather than querying a live LLM during encoding or decoding, the invention captures ("freezes") the token probability distribution for a given prompt context at a specific time on a specific machine, serializes this frozen distribution into a portable channel definition file (designated a ".hchan" file), and thereafter uses only this frozen distribution for all encoding and decoding operations -- entirely independent of any LLM infrastructure.

The system comprises the following integrated subsystems:

**A Frozen Distribution Engine** that queries a large language model for top-k token logit scores at one or more prompt contexts, normalizes the logit scores via softmax into a probability distribution, constructs a tree of distribution nodes by recursively extending the prompt context with the most probable tokens to a configurable depth, pre-computes cumulative distribution functions (CDFs) for each node, and serializes the complete distribution tree with vocabulary mapping and metadata into a portable .hchan channel definition file.

**An Arithmetic Coding Encoder** that accepts a plaintext message and a .hchan channel definition file, converts the message to a framed bit string, and iteratively selects output tokens by narrowing an arithmetic coding interval over the frozen CDF at each step, producing a sequence of tokens that, when rendered through the vocabulary mapping, form natural-language text embedding the hidden message.

**An Arithmetic Coding Decoder** that accepts a stego-text token sequence and the same .hchan channel definition file, reverses the arithmetic coding process by mapping each received token to its CDF interval position in the frozen distribution, extracts the encoded bits, and recovers the original plaintext message.

**A Channel Establishment and Rotation Protocol** that governs the creation, secure distribution, operational use, and periodic rotation of .hchan channel definition files between communicating parties.

This approach achieves cross-machine determinism: any party in possession of the same .hchan file can encode and decode messages identically, regardless of their hardware, operating system, inference engine, or whether they have any LLM installed at all. The channel persists indefinitely, surviving model updates, API deprecation, and infrastructure changes.

---

## 6. BRIEF DESCRIPTION OF THE DRAWINGS

**FIG. 1** is a system architecture diagram illustrating the overall topology of the theVigil steganographic communication system, showing the Frozen Distribution Engine (200), the .hchan Channel Definition File (300), the Arithmetic Coding Encoder (400), the Arithmetic Coding Decoder (500), the Channel Establishment Protocol (600), and the relationships between communicating parties (Party A, Party B) and the optional LLM infrastructure (100).

**FIG. 2** is a flowchart illustrating the frozen distribution capture process, depicting the LLM query step for top-k token logit scores, the softmax normalization step, the recursive tree construction with branching factor N and depth D, the CDF pre-computation step, and the serialization to .hchan format.

**FIG. 3** is a data flow diagram illustrating the arithmetic coding encoder pipeline, showing the message-to-bit-string conversion with UTF-8 encoding and framing, the iterative interval narrowing process over the frozen CDF, the token selection at each step, and the output token sequence assembly.

**FIG. 4** is a data flow diagram illustrating the arithmetic coding decoder pipeline, showing the stego-text token input, the per-token CDF interval lookup in the frozen distribution, the interval narrowing and bit extraction process, and the plaintext message recovery with deframing.

**FIG. 5** is a comparison diagram illustrating cross-machine determinism, contrasting the prior art approach (live LLM inference at encode/decode time producing non-deterministic distributions across Machine A and Machine B) with the present invention (frozen distribution file producing identical encode/decode results across arbitrary machines without LLM infrastructure).

**FIG. 6** is a sequence diagram illustrating the channel establishment and rotation protocol, showing the channel creation phase (requiring LLM access), the secure .hchan distribution phase, the operational use phase (no LLM required), and the channel rotation phase.

**FIG. 7** is a block diagram illustrating the .hchan channel definition file internal structure, showing the channel_id field, model_id field, created_at timestamp, encoding_parameters block, vocab_map section, and the tree of distribution nodes each containing a context string, token_probs mapping, and pre-computed CDF array.

**FIG. 8** is a diagram illustrating the multi-node distribution tree structure, showing the root node with its top-N token branches, the recursive extension to depth D, and the entropy accumulation across the tree enabling encoding of messages of arbitrary length.

---

## 7. DETAILED DESCRIPTION OF PREFERRED EMBODIMENTS

The following detailed description sets forth specific embodiments of the present invention. It will be understood that the invention is not limited to the specific embodiments described herein, and that various modifications, substitutions, and equivalents will be apparent to those skilled in the art.

### 7.1 Definitions

For the purposes of this specification, the following terms have the stated meanings:

**"Large Language Model" (LLM):** A neural network trained on natural language corpora that, given a prompt (a sequence of tokens), produces a probability distribution over a vocabulary V of tokens representing the likelihood of each token being the next in the sequence. Examples include but are not limited to GPT-class models, LLaMA-class models, Phi-class models, and Mistral-class models.

**"Token Probability Distribution":** The vector P = {p_1, p_2, ..., p_V} where p_i is the probability assigned by the LLM to token i being the next token given a specific prompt context. In practice, only the top-k tokens with highest probability are captured, and the distribution is renormalized over this subset.

**"Frozen Distribution":** A token probability distribution captured from an LLM at a specific point in time on a specific machine, serialized to persistent storage, and used thereafter independently of any live LLM inference. Once frozen, the distribution is immutable and deterministic across all computing environments.

**"Channel Definition File" (.hchan):** A portable, self-contained, serialized artifact containing one or more frozen token probability distributions organized as a tree, a vocabulary mapping from token identifiers to token strings, pre-computed cumulative distribution functions, and channel metadata. The .hchan file constitutes the complete shared secret channel definition between communicating parties and is the sole artifact required for encode/decode operations.

**"Arithmetic Coding" (AC):** A form of entropy coding that encodes a sequence of symbols by mapping them to a sub-interval of [0, 1) according to a cumulative probability distribution (CDF). AC achieves near-theoretical channel capacity, meaning the average number of bits encoded per symbol approaches the entropy of the source distribution.

**"Stego-text":** The natural-language text output produced by the steganographic encoder, which embeds a hidden message and is designed to be statistically indistinguishable from text generated directly by the LLM.

**"Cross-Machine Determinism":** The property that, given the same .hchan file and the same input (message for encoding, or stego-text for decoding), the output is bit-for-bit identical on any computing platform, regardless of hardware architecture, operating system, floating-point implementation, or whether any LLM software is installed.

### 7.2 System Architecture Overview

Referring now to FIG. 1, the system of the present invention comprises four principal subsystems and a channel protocol.

An LLM inference environment (100) provides access to one or more large language models for the purpose of distribution capture. The LLM inference environment (100) is required only during the channel creation phase and is not required for any subsequent encode or decode operations. The LLM inference environment (100) may comprise a local GPU server running an open-weight model via an inference engine such as Ollama, llama.cpp, or vLLM, or may comprise an API connection to a cloud-hosted LLM service.

A Frozen Distribution Engine (200) interfaces with the LLM inference environment (100) to capture, normalize, and serialize token probability distributions. The Frozen Distribution Engine (200) produces .hchan channel definition files (300).

A .hchan Channel Definition File (300) is the portable artifact that fully specifies a steganographic channel. Once created, the .hchan file is the sole input required by both the encoder and decoder. The .hchan file may be distributed between communicating parties via any secure channel (e.g., end-to-end encrypted messaging, physical media, secure file transfer).

An Arithmetic Coding Encoder (400) accepts a plaintext message and a .hchan file (300) as inputs and produces stego-text as output. The encoder operates entirely over the frozen distributions contained in the .hchan file, without any LLM query.

An Arithmetic Coding Decoder (500) accepts stego-text and the same .hchan file (300) as inputs and produces the recovered plaintext message as output. The decoder operates entirely over the frozen distributions contained in the .hchan file, without any LLM query.

A Channel Establishment Protocol (600) governs the creation, distribution, operational use, and rotation of .hchan files between communicating parties.

### 7.3 Frozen Distribution Engine

Referring now to FIG. 2, the Frozen Distribution Engine (200) performs the following operations to capture and serialize a frozen token probability distribution.

**7.3.1 Single-Node Distribution Capture**

Given an LLM M accessible via the LLM inference environment (100) and a prompt context C (a string of text), the Frozen Distribution Engine queries M for the logit scores of the next token position. The engine requests the top-k token logit scores, where k is a configurable parameter (in the preferred embodiment, k = 200).

The LLM returns a set of (token_id, logit_score) pairs:

```
L = {(t_1, l_1), (t_2, l_2), ..., (t_k, l_k)}
```

where t_i is a token identifier and l_i is the unnormalized log-probability (logit) score for that token.

The engine converts logit scores to probabilities via softmax normalization over the captured subset:

```
FUNCTION normalize_logits(logit_pairs):
    // Numerical stability: subtract max logit before exponentiation
    max_logit = MAX(l_i FOR ALL (t_i, l_i) IN logit_pairs)

    exp_values = []
    FOR EACH (t_i, l_i) IN logit_pairs:
        exp_values[i] = EXP(l_i - max_logit)

    sum_exp = SUM(exp_values)

    probabilities = {}
    FOR EACH (t_i, l_i) IN logit_pairs:
        probabilities[t_i] = exp_values[i] / sum_exp

    RETURN probabilities
```

The resulting distribution sums to 1.0 over the captured top-k subset. Tokens not in the top-k are assigned probability zero within the channel; the encoder will never select them, and the decoder recognizes them as out-of-channel tokens.

**7.3.2 Cumulative Distribution Function Pre-Computation**

For each captured distribution node, the engine pre-computes a cumulative distribution function (CDF) for use by the arithmetic coder. The tokens are sorted by token identifier to establish a canonical ordering:

```
FUNCTION compute_cdf(probabilities):
    // Sort tokens by token_id for canonical ordering
    sorted_tokens = SORT(probabilities.keys())

    cdf = []
    cumulative = 0.0

    FOR EACH token IN sorted_tokens:
        cdf_entry = {
            token_id: token,
            lower: cumulative,
            upper: cumulative + probabilities[token]
        }
        cdf.APPEND(cdf_entry)
        cumulative += probabilities[token]

    // Final entry upper should be 1.0 (within floating-point tolerance)
    ASSERT ABS(cumulative - 1.0) < 1e-9

    RETURN cdf
```

The CDF partitions the interval [0, 1) into contiguous sub-intervals, one per token, with interval width proportional to token probability. This pre-computation eliminates the need for CDF construction at encode/decode time, ensuring that both encoder and decoder operate on bit-for-bit identical interval boundaries.

**7.3.3 Multi-Node Distribution Tree Construction**

Referring now to FIG. 8, steganographic capacity from a single distribution node is limited to approximately log2(k) bits per encoded token. To support messages of arbitrary length, the Frozen Distribution Engine constructs a tree of distribution nodes.

Starting from an initial prompt context C_root, the engine captures the distribution at C_root (the root node). From the root distribution, the top-N most probable tokens (in the preferred embodiment, N = 5) are identified. For each of these N tokens, the engine extends the prompt context by appending the token's text to C_root, producing N child contexts. Each child context is used as the prompt for a new distribution capture, producing N child distribution nodes. This process recurses to a configurable depth D (in the preferred embodiment, D = 3).

```
FUNCTION build_distribution_tree(llm, root_context, N, D):
    tree = {}

    FUNCTION capture_recursive(context, current_depth):
        // Capture distribution at this context
        logits = llm.get_top_k_logits(context, k=200)
        probs = normalize_logits(logits)
        cdf = compute_cdf(probs)

        node = {
            context: context,
            token_probs: probs,
            cdf: cdf,
            children: {}
        }

        tree[context] = node

        // Recurse if depth budget remains
        IF current_depth < D:
            top_n_tokens = GET_TOP_N(probs, N)
            FOR EACH token IN top_n_tokens:
                child_context = context + token.text
                capture_recursive(child_context, current_depth + 1)
                node.children[token.id] = child_context

    capture_recursive(root_context, 0)
    RETURN tree
```

The resulting tree has O(N^D) nodes. For the preferred embodiment parameters (N=5, D=3), this produces up to 156 distribution nodes (1 + 5 + 25 + 125), each containing 200 tokens with pre-computed CDFs. The total entropy budget of the tree is sufficient for messages of several hundred bytes, which is adequate for typical covert communication payloads.

**7.3.4 Serialization to .hchan Format**

Referring now to FIG. 7, the Frozen Distribution Engine serializes the complete distribution tree into a .hchan channel definition file. The .hchan file is structured as follows:

```
HChanFile {
    // Header
    format_version: String,         // e.g., "1.0"
    channel_id: UUID,               // Unique identifier for this channel instance
    model_id: String,               // Nominal model identifier (e.g., "phi3:mini")
    created_at: ISO8601_Timestamp,  // Timestamp of distribution capture
    creator_fingerprint: String,    // Optional: hash of creator identity

    // Encoding parameters
    encoding_params: {
        top_k: Integer,             // Number of tokens per distribution node (e.g., 200)
        branch_factor: Integer,     // N: branching factor for tree construction (e.g., 5)
        tree_depth: Integer,        // D: maximum tree depth (e.g., 3)
        ac_precision: Integer,      // Arithmetic coder precision in bits (e.g., 32)
        message_framing: String     // Framing scheme identifier (e.g., "utf8-length-prefixed")
    },

    // Vocabulary mapping
    vocab_map: {
        token_id_1: "token_string_1",
        token_id_2: "token_string_2",
        ...
    },

    // Distribution tree
    nodes: [
        {
            node_id: String,                    // Context string identifying this node
            context: String,                    // The prompt context used for capture
            token_probs: {                      // Probability distribution
                token_id: probability,
                ...
            },
            cdf: [                              // Pre-computed CDF
                { token_id, lower, upper },
                ...
            ],
            children: {                         // Child node references
                token_id: child_node_id,
                ...
            }
        },
        ...
    ],

    // Integrity
    checksum: String                // SHA-256 hash of all preceding fields
}
```

The .hchan file may be serialized in JSON format for interoperability or in a compact binary format (e.g., MessagePack, CBOR) for efficiency. In the preferred embodiment, JSON is used for the reference implementation, with binary serialization available as an optimization.

The checksum field provides integrity verification: upon loading a .hchan file, the decoder recomputes the SHA-256 hash of the file contents (excluding the checksum field itself) and compares it to the stored checksum, rejecting the file if they do not match.

### 7.4 Arithmetic Coding Encoder

Referring now to FIG. 3, the Arithmetic Coding Encoder (400) encodes a plaintext message into stego-text using a .hchan channel definition file.

**7.4.1 Message Preparation**

The plaintext message M is prepared for encoding as follows:

```
FUNCTION prepare_message(plaintext):
    // Step 1: Encode to bytes using UTF-8
    message_bytes = UTF8_ENCODE(plaintext)

    // Step 2: Compute length prefix (4 bytes, big-endian)
    length_prefix = INT_TO_BYTES(LEN(message_bytes), length=4, byteorder='big')

    // Step 3: Append termination marker
    termination = BYTES(0xFF, 0xFE)

    // Step 4: Concatenate and convert to bit string
    framed = length_prefix + message_bytes + termination
    bit_string = BYTES_TO_BITS(framed)

    RETURN bit_string
```

The 4-byte length prefix enables the decoder to determine message boundaries without ambiguity. The 2-byte termination marker (0xFF 0xFE) provides a redundant end-of-message signal for error detection. The framed message is converted to a bit string B = (b_0, b_1, ..., b_{n-1}) for input to the arithmetic coder.

**7.4.2 Token Selection via Arithmetic Coding**

The encoder maintains an arithmetic coding state comprising an interval [lo, hi) initialized to [0.0, 1.0), using fixed-point arithmetic with configurable precision (in the preferred embodiment, 32-bit precision):

```
FUNCTION encode(bit_string, hchan_file):
    // Initialize arithmetic coding state
    lo = 0
    hi = 2^PRECISION - 1       // e.g., 0xFFFFFFFF for 32-bit
    output_tokens = []
    current_node = hchan_file.root_node
    bit_index = 0

    WHILE bit_index < LEN(bit_string):
        cdf = current_node.cdf

        // Compute the target value from remaining bits
        range = hi - lo + 1
        target_fraction = bits_to_fraction(bit_string, bit_index, PRECISION)
        target = lo + FLOOR(target_fraction * range)

        // Find the token whose CDF interval contains the target
        selected_token = NONE
        FOR EACH entry IN cdf:
            entry_lo = lo + FLOOR(entry.lower * range)
            entry_hi = lo + FLOOR(entry.upper * range) - 1

            IF entry_lo <= target AND target <= entry_hi:
                selected_token = entry.token_id
                // Narrow the interval
                hi = entry_hi
                lo = entry_lo
                BREAK

        output_tokens.APPEND(selected_token)

        // Advance bit index by the information content of this token
        token_prob = current_node.token_probs[selected_token]
        bits_encoded = FLOOR(-LOG2(token_prob))
        bit_index += bits_encoded

        // Navigate to child node if available
        IF selected_token IN current_node.children:
            current_node = hchan_file.nodes[current_node.children[selected_token]]
        ELSE:
            current_node = hchan_file.root_node  // Reset to root

        // Interval renormalization (E1/E2/E3 scaling)
        lo, hi = renormalize(lo, hi)

    RETURN output_tokens
```

**7.4.3 Stego-Text Assembly**

The output token sequence is converted to natural-language text using the vocabulary mapping from the .hchan file:

```
FUNCTION tokens_to_text(token_sequence, vocab_map):
    text = ""
    FOR EACH token_id IN token_sequence:
        text += vocab_map[token_id]
    RETURN text
```

The resulting stego-text is statistically indistinguishable from unconstrained LLM output because each token was selected from the model's own probability distribution -- higher-probability tokens are selected more frequently than lower-probability tokens, matching the statistical profile of natural model output.

### 7.5 Arithmetic Coding Decoder

Referring now to FIG. 4, the Arithmetic Coding Decoder (500) recovers the hidden message from stego-text using the same .hchan channel definition file.

**7.5.1 Token-to-Interval Mapping**

The decoder receives the stego-text (as a sequence of token identifiers, obtained by tokenizing the text against the .hchan vocabulary mapping) and proceeds as follows:

```
FUNCTION decode(token_sequence, hchan_file):
    // Initialize arithmetic coding state
    lo = 0
    hi = 2^PRECISION - 1
    recovered_bits = []
    current_node = hchan_file.root_node

    FOR EACH token_id IN token_sequence:
        cdf = current_node.cdf

        // Find the CDF entry for the received token
        entry = FIND_CDF_ENTRY(cdf, token_id)

        IF entry IS NONE:
            RAISE OutOfChannelTokenError(token_id)

        // Compute interval boundaries
        range = hi - lo + 1
        new_lo = lo + FLOOR(entry.lower * range)
        new_hi = lo + FLOOR(entry.upper * range) - 1

        // Extract bits from the narrowed interval
        extracted = extract_bits(new_lo, new_hi, PRECISION)
        recovered_bits.EXTEND(extracted)

        // Update interval
        lo = new_lo
        hi = new_hi

        // Navigate to child node
        IF token_id IN current_node.children:
            current_node = hchan_file.nodes[current_node.children[token_id]]
        ELSE:
            current_node = hchan_file.root_node

        // Interval renormalization
        lo, hi = renormalize(lo, hi)

    RETURN recovered_bits
```

**7.5.2 Message Recovery**

The recovered bit string is converted back to the original plaintext:

```
FUNCTION recover_message(recovered_bits):
    // Convert bits to bytes
    recovered_bytes = BITS_TO_BYTES(recovered_bits)

    // Extract length prefix
    message_length = BYTES_TO_INT(recovered_bytes[0:4], byteorder='big')

    // Extract message bytes
    message_bytes = recovered_bytes[4 : 4 + message_length]

    // Verify termination marker
    termination = recovered_bytes[4 + message_length : 4 + message_length + 2]
    ASSERT termination == BYTES(0xFF, 0xFE), "Termination marker mismatch"

    // Decode UTF-8
    plaintext = UTF8_DECODE(message_bytes)

    RETURN plaintext
```

The decoded message is identical to the original plaintext provided the same .hchan file is used for both encoding and decoding. This identity guarantee holds across all computing environments because the decode operation references only the frozen distributions in the .hchan file, which are bit-for-bit identical on every machine.

### 7.6 Cross-Machine Determinism

Referring now to FIG. 5, the central novelty of the invention is that, once the .hchan file has been created, all subsequent encode/decode operations are performed entirely over the serialized frozen distributions. No live LLM query is performed at encode or decode time. This architectural decision produces the following determinism guarantees:

**(a) Hardware Independence:** Both communicating parties may run on arbitrary hardware architectures (x86, ARM, RISC-V), with arbitrary GPU configurations (or no GPU at all), and produce identical results. The only computational requirement is basic arithmetic operations over the fixed-point values stored in the .hchan file.

**(b) Software Independence:** The encode/decode operations do not depend on any LLM inference engine, machine learning framework, CUDA library, or model file. A minimal implementation requires only arithmetic operations, JSON parsing (for .hchan loading), and UTF-8 encoding/decoding.

**(c) Temporal Persistence:** The steganographic channel survives model updates, version deprecation, API retirement, and service outages. Once a .hchan file exists, the channel operates indefinitely.

**(d) Reproducibility:** The encode output for a given (message, .hchan) pair is identical across all environments. The decode output for a given (stego-text, .hchan) pair is identical across all environments. This enables formal verification and testing of the steganographic system.

This is in direct contrast to all prior art methods (Ziegler et al. 2019, Kaptchuk et al. 2021, Dai & Cai 2019, Zhang et al. ADG, Wu et al. LLM-Stega 2024) that require live LLM inference at encode/decode time and are therefore subject to cross-machine distribution divergence.

### 7.7 Channel Establishment and Rotation Protocol

Referring now to FIG. 6, the Channel Establishment Protocol (600) governs the lifecycle of steganographic channels.

**7.7.1 Channel Creation Phase**

One party (designated the "channel creator") operates in an environment with access to the LLM inference environment (100). The channel creator invokes the Frozen Distribution Engine (200) with a chosen root prompt context, branching parameters (N, D), and top-k value. The engine produces a .hchan file. This is the only phase that requires LLM access.

**7.7.2 Secure Distribution Phase**

The .hchan file is transmitted from the channel creator to the other communicating party (or parties) via a separate secure channel. Suitable distribution mechanisms include:

- End-to-end encrypted messaging (e.g., Signal, encrypted email)
- Physical media (e.g., USB drive, air-gapped transfer)
- Secure file transfer protocol (SFTP) over an authenticated channel
- Pre-shared via a key exchange ceremony

The .hchan file functions analogously to a shared symmetric key in cryptographic protocols: possession of the file is necessary and sufficient for participation in the steganographic channel.

**7.7.3 Operational Use Phase**

After .hchan distribution, neither party requires LLM access. Messages are encoded and decoded using only the .hchan file and the Arithmetic Coding Encoder/Decoder. The channel remains operational indefinitely.

**7.7.4 Channel Rotation**

A new .hchan file may be generated at any time (requiring LLM access) and distributed to replace an aging channel. Rotation may be triggered by:

- Periodic rotation schedule (operational security policy)
- Suspected compromise of the .hchan file
- Desire to use a different LLM model for improved text quality
- Desire to change the root prompt context for different cover text characteristics

The old .hchan file should be securely destroyed after rotation. Rotation frequency is a security parameter; the invention imposes no constraint on rotation interval.

**7.7.5 Multi-Channel Operation**

Multiple .hchan files may coexist for different communication partners, different security levels, or different cover text styles. Each .hchan file defines an independent channel. A party may maintain a library of .hchan files, each identified by its channel_id.

### 7.8 Canonical Identity Normalization (Ancillary Method)

In embodiments where communicating party identity is associated with email addresses, the system additionally implements canonical email normalization for Gmail-style addresses of the form "user+tag@gmail.com." Because Gmail ignores the "+tag" portion for delivery, multiple addresses may refer to the same physical identity. The system computes three canonical hash forms for cross-reference:

```
FUNCTION canonical_email_hashes(email_address):
    // Parse email into components
    local_part, domain = email_address.SPLIT("@")
    base_user = local_part.SPLIT("+")[0]  // Strip plus-tag

    // Compute canonical hashes
    canonical_1 = SHA256(base_user)                    // Base username hash
    canonical_2 = SHA256(base_user + "@" + domain)     // Canonical email hash
    canonical_3 = SHA256(email_address)                // Full tagged email hash

    RETURN (canonical_1, canonical_2, canonical_3)
```

This enables identity cross-referencing in systems where channel participants may use plus-tagged email variations.

### 7.9 Security Properties

The steganographic system of the present invention provides the following security properties:

**Statistical Indistinguishability:** Because each token in the stego-text is selected from the model's own probability distribution (frozen at capture time), the statistical profile of the stego-text matches that of unconstrained model output. Tokens with higher model probability are selected more frequently, matching the expected token frequency of natural model output. This property is preserved regardless of the message content being encoded.

**Channel Confidentiality:** The .hchan file functions as a shared secret. Without possession of the .hchan file, an adversary cannot determine which tokens encode hidden bits versus which are natural model output, because the adversary does not have access to the specific probability distribution used for encoding.

**Forward Secrecy via Rotation:** Channel rotation with secure destruction of old .hchan files ensures that compromise of a current channel file does not reveal messages encoded under previous channel files.

**Resistance to Model-Based Steganalysis:** Because the frozen distribution is captured from a real LLM's output distribution, steganalysis methods that compare stego-text statistics against model output statistics (as in the 2024 "Next-Generation Steganalysis" work) will find that the stego-text's token frequency distribution matches the model's natural distribution, limiting the effectiveness of such detection methods.

---

## 8. CLAIMS

### Independent Claims

**Claim 1.** A computer-implemented method for steganographic communication, the method comprising:

(a) querying, by a frozen distribution engine, a large language model (LLM) to obtain a token probability distribution for a given prompt context, the token probability distribution comprising probability values for each of a plurality of tokens in the model's vocabulary;

(b) serializing the token probability distribution into a channel definition file stored on a non-transitory computer-readable medium independently of the LLM inference infrastructure, the channel definition file comprising the token probability distribution, a pre-computed cumulative distribution function derived therefrom, and a vocabulary mapping from token identifiers to token strings;

(c) distributing the channel definition file to one or more communicating parties via a secure channel;

(d) encoding, by an arithmetic coding encoder operating on a first computing platform, a plaintext message into a steganographic token sequence by applying arithmetic coding over the token probability distribution contained in the channel definition file, wherein each token in the steganographic token sequence is selected from the token probability distribution without querying the LLM at encode time; and

(e) decoding, by an arithmetic coding decoder operating on a second computing platform different from the first computing platform, the steganographic token sequence to recover the plaintext message by applying inverse arithmetic coding over the same token probability distribution contained in the same channel definition file without querying the LLM at decode time;

wherein the encoding and decoding operations produce identical results across heterogeneous computing environments given the same channel definition file, achieving cross-machine determinism independent of hardware architecture, operating system, or LLM inference engine.

**Claim 2.** A computer-implemented system for covert steganographic communication, the system comprising:

a processor; and

a non-transitory computer-readable memory storing instructions that, when executed by the processor, cause the system to implement:

(a) a frozen distribution engine configured to query a large language model for token probability distributions at one or more prompt contexts, to normalize the token probability distributions via softmax over a top-k token subset, to pre-compute cumulative distribution functions for each distribution, and to serialize the distributions, cumulative distribution functions, and a vocabulary mapping into a channel definition file;

(b) an arithmetic coding encoder configured to accept a plaintext message and the channel definition file as inputs and to produce a steganographic token sequence by iteratively narrowing an arithmetic coding interval over the pre-computed cumulative distribution function at each token selection step, without querying the large language model;

(c) an arithmetic coding decoder configured to accept a steganographic token sequence and the channel definition file as inputs and to recover the plaintext message by mapping each token to its interval position in the pre-computed cumulative distribution function and extracting the encoded bits, without querying the large language model; and

(d) a channel protocol manager configured to govern the creation, secure distribution, operational use, and rotation of channel definition files between communicating parties;

wherein the encoder and decoder produce identical results on any computing platform given the same channel definition file, independent of hardware, operating system, or the presence of any LLM inference infrastructure.

**Claim 3.** A non-transitory computer-readable medium storing instructions that, when executed by a processor, cause the processor to perform a method for steganographic communication comprising:

(a) loading a channel definition file comprising a frozen token probability distribution captured from a large language model at a defined point in time, a pre-computed cumulative distribution function derived from the frozen token probability distribution, and a vocabulary mapping from token identifiers to token strings;

(b) receiving a plaintext message for steganographic encoding;

(c) converting the plaintext message to a framed bit string comprising a length prefix, message bytes encoded in UTF-8, and a termination marker;

(d) iteratively selecting output tokens by: for each iteration, computing a target value within a current arithmetic coding interval from the remaining bits, identifying the token whose cumulative distribution function sub-interval contains the target value, appending the identified token to an output token sequence, and narrowing the arithmetic coding interval to the identified token's sub-interval;

(e) converting the output token sequence to natural-language text using the vocabulary mapping from the channel definition file; and

(f) outputting the natural-language text as stego-text embedding the plaintext message;

wherein all operations in steps (d) and (e) reference only the frozen token probability distribution and vocabulary mapping stored in the channel definition file, without querying any large language model.

### Dependent Claims

**Claim 4.** The method of Claim 1, wherein querying the large language model comprises requesting top-k token logit scores from the LLM, where k is a configurable parameter, and normalizing the logit scores via softmax over the captured top-k subset, the softmax normalization comprising subtracting the maximum logit value for numerical stability prior to exponentiation.

**Claim 5.** The method of Claim 1, wherein serializing the token probability distribution further comprises constructing a tree of distribution nodes by:

(a) capturing a root distribution at an initial prompt context;

(b) identifying the top-N most probable tokens from the root distribution;

(c) for each of the top-N tokens, extending the prompt context by appending the token's text and capturing a child distribution at the extended context; and

(d) recursing to steps (b) and (c) for each child distribution to a configurable depth D;

thereby producing a tree of O(N^D) distribution nodes with increased steganographic channel capacity sufficient for encoding messages of arbitrary length.

**Claim 6.** The method of Claim 5, wherein the tree has a branching factor N of 5 and a maximum depth D of 3, producing up to 156 distribution nodes.

**Claim 7.** The method of Claim 1, wherein the channel definition file is a structured file comprising:

a channel identifier uniquely identifying the channel instance;
a model identifier identifying the nominal LLM used for distribution capture;
a creation timestamp recording when the distributions were captured;
encoding parameters comprising the top-k value, branching factor, tree depth, and arithmetic coding precision;
a vocabulary mapping from token identifiers to token strings;
a plurality of distribution nodes each comprising a context string, a token probability mapping, a pre-computed cumulative distribution function, and references to child nodes; and
a checksum comprising a SHA-256 hash of the preceding fields for integrity verification.

**Claim 8.** The method of Claim 1, wherein the plaintext message is prepared for encoding by converting to UTF-8 byte encoding, prepending a 4-byte big-endian length prefix, and appending a 2-byte termination marker, the length prefix and termination marker enabling unambiguous message boundary detection and error detection during decoding.

**Claim 9.** The method of Claim 1, wherein the steganographic token sequence, when rendered through the vocabulary mapping of the channel definition file, produces natural-language text that is statistically indistinguishable from text generated directly by the LLM, because each token is selected with probability proportional to the model's own probability distribution captured in the channel definition file.

**Claim 10.** The method of Claim 1, further comprising rotating the steganographic channel by:

(a) generating a new channel definition file by querying the LLM to capture a new token probability distribution;

(b) distributing the new channel definition file to communicating parties via a secure channel; and

(c) securely destroying the previous channel definition file;

wherein the rotation is performed independently of the encode/decode infrastructure and does not require reconfiguration of the encoder or decoder beyond loading the new channel definition file.

**Claim 11.** The method of Claim 1, wherein the encoding step uses fixed-point arithmetic with a configurable precision of at least 32 bits to represent the arithmetic coding interval boundaries, ensuring reproducible interval narrowing across computing environments with different floating-point implementations.

**Claim 12.** The system of Claim 2, wherein neither the encoder nor the decoder requires a graphics processing unit (GPU), a machine learning framework, a model weights file, or any LLM inference software to be installed on the computing platform on which it operates.

**Claim 13.** The system of Claim 2, wherein the channel definition file is serialized in JSON format or in a binary serialization format selected from MessagePack and CBOR.

**Claim 14.** The system of Claim 2, wherein the frozen distribution engine captures distributions from an LLM accessible via a local inference engine selected from Ollama, llama.cpp, and vLLM, or via a remote API endpoint.

**Claim 15.** The system of Claim 2, further comprising a multi-channel manager configured to maintain a plurality of channel definition files, each identified by a unique channel identifier, enabling simultaneous steganographic communication with multiple parties using independent channels.

**Claim 16.** The method of Claim 1, wherein the channel definition file further comprises a creator fingerprint comprising a cryptographic hash of the channel creator's identity, enabling authentication of the channel's provenance.

**Claim 17.** The non-transitory computer-readable medium of Claim 3, wherein the instructions further cause the processor to verify the integrity of the channel definition file upon loading by recomputing a SHA-256 hash of the file contents and comparing it to a stored checksum, rejecting the file if the hashes do not match.

**Claim 18.** The non-transitory computer-readable medium of Claim 3, wherein the arithmetic coding encoder navigates a tree of distribution nodes contained in the channel definition file, advancing to a child node when the selected token has a corresponding child entry, and resetting to the root node when the selected token has no child entry, thereby enabling continuous encoding across the distribution tree.

**Claim 19.** The method of Claim 1, further comprising normalizing email addresses of communicating parties by:

(a) parsing each email address into a local part and a domain;

(b) stripping plus-tag extensions from the local part to obtain a base username;

(c) computing a first cryptographic hash of the base username, a second cryptographic hash of the base username concatenated with the domain, and a third cryptographic hash of the full email address; and

(d) using the computed hashes for identity cross-referencing across channel definition files.

**Claim 20.** The method of Claim 1, wherein the steganographic channel established by the channel definition file persists independently of the availability of the large language model, surviving model version updates, API deprecation, service outages, and infrastructure changes, because no LLM query is required after channel creation.

---

## 9. ABSTRACT

A method and system for covert steganographic communication embeds hidden messages within natural-language text by applying arithmetic coding over a pre-computed, frozen token probability distribution derived from a large language model (LLM). Unlike prior art methods that require live LLM inference at encode and decode time -- resulting in hardware-bound non-determinism and infrastructure dependency -- the present invention decouples the distribution-sampling step from the text-generation step. A Frozen Distribution Engine captures the LLM's top-k token probability distribution for one or more prompt contexts, normalizes via softmax, pre-computes cumulative distribution functions, constructs a tree of distribution nodes for increased channel capacity, and serializes the complete distribution tree into a portable channel definition file (.hchan format). Thereafter, an Arithmetic Coding Encoder and Decoder operate solely over the frozen distributions in the .hchan file, without any LLM query, achieving cross-machine determinism: any party possessing the .hchan file can encode and decode messages identically, regardless of hardware, operating system, inference engine, or whether any LLM software is installed. The stego-text is statistically indistinguishable from unconstrained LLM output because each token is selected from the model's own probability distribution. The invention encompasses the Frozen Distribution Engine, the .hchan channel definition file format with integrity verification, the arithmetic coding encode/decode procedures with fixed-point precision, the multi-node distribution tree for arbitrary-length message support, and the channel establishment and rotation protocol.

---

## APPENDIX A -- AI DISCLOSURE STATEMENT

This work was developed by Cristian Xavier Ruvalcaba under Saluca LLC with AI coding assistance from Claude (Anthropic). The following table delineates human-originated creative/inventive contributions from AI-assisted implementation work.

### Human-Originated (Cristian Xavier Ruvalcaba / Saluca LLC)

Inventive, architectural, and creative contributions constituting patentable novelty:

1. **Core Concept:** The insight that decoupling the distribution-sampling step from the encode/decode step enables cross-machine determinism. This is the central inventive step. Originated entirely with the inventor.

2. **Frozen Distribution Architecture:** The decision to capture LLM token probabilities once, freeze them, and use only the frozen artifact for all subsequent operations, eliminating live LLM dependency.

3. **.hchan Channel File Concept:** The design of a portable, self-contained "channel" artifact that fully specifies a steganographic channel and can be shared between parties. The file format specification, field definitions, and channel protocol were designed by the inventor.

4. **Cross-Machine Determinism Requirement:** Identifying cross-machine determinism as a critical unsolved problem in neural text steganography and specifying it as a design requirement. No prior art addresses this as a primary design goal.

5. **Tree-Structured Distribution Capture:** The idea of recursively extending prompt contexts to build a distribution tree, increasing channel capacity beyond a single-node distribution.

6. **Channel Rotation Protocol:** The operational security design of channel rotation, separating channel establishment (requires LLM) from channel use (no LLM required).

7. **Gmail-Plus Canonical Hashing:** The specific method of deriving multiple canonical hash forms from plus-tagged Gmail addresses for identity cross-reference.

8. **System Integration Architecture:** The design decision to integrate the theVigil steganographic engine into the broader Saluca AI platform.

9. **Product Direction and Scope:** All decisions about what to build, what problems to solve, and what capabilities to prioritize.

### AI-Assisted (Claude, Anthropic -- Implementation Only, Not Inventive)

Code scaffolding and implementation that does not constitute inventive contribution:

1. Python implementation of arithmetic coding encode/decode loops, given the algorithm specification provided by the inventor.

2. Python implementation of distribution capture and serialization, given the .hchan format designed by the inventor.

3. Test harness structure and assertion logic.

4. Syntactic and boilerplate code: imports, exception handling, logging, file I/O utilities.

5. This patent application document -- drafted with AI assistance at the inventor's direction, based on technical specifications, architecture descriptions, and claim strategy provided by the inventor. All inventive content herein originated with the inventor.

---

*Respectfully submitted,*

**Saluca LLC**

By: /s/ Cristian Xavier Ruvalcaba
Cristian Xavier Ruvalcaba, Sole Inventor

Date: _______________

Prepared by:
Cristian Xavier Ruvalcaba, Pro Se Applicant
Saluca LLC
Docket No. SALUCA-012
