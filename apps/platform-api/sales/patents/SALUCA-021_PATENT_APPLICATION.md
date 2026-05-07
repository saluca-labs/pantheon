# UNITED STATES PROVISIONAL PATENT APPLICATION

**Application Number:** [To be assigned]
**Filing Date:** [To be assigned]
**Applicant:** Saluca LLC
**Inventor:** Cristian Xavier Ruvalcaba
**Docket Number:** SALUCA-021
**Filing Status:** Pro Se
**Entity Status:** Micro Entity

---

## 1. TITLE OF THE INVENTION

**System and Method for Self-Describing Constrained Agent Bootstrap with Capability Manifest Generation, Cryptographic Soul Key Derivation, and Manifest-Validated Task Dispatch Across Heterogeneous Edge Node Fleets**

---

## 2. CROSS-REFERENCE TO RELATED APPLICATIONS

This application is related to U.S. Provisional Patent Application Serial No. [SALUCA-014], entitled "System and Method for Health-Aware Multi-Provider Large Language Model Proxy with Cascading Failover and Encrypted Audit Logging," filed previously by the same applicant, the disclosure of which is incorporated herein by reference in its entirety. This application is also related to U.S. Provisional Patent Application Serial No. [SALUCA-015], entitled "System and Method for Hybrid Offline-Online License Validation with Grace Period State Machine and Relay Proxy Renewal," the disclosure of which is incorporated herein by reference in its entirety.

---

## 3. FIELD OF THE INVENTION

The present invention relates generally to the field of distributed edge computing systems and, more particularly, to systems and methods for autonomously bootstrapping heterogeneous constrained edge devices into a centrally coordinated agent fleet. The invention encompasses self-describing capability manifest generation through automated hardware and software introspection, hierarchical capability tier classification, cryptographic identity establishment through master-key-derived per-node key derivation using HKDF-SHA256, manifest-validated task dispatch that enforces capability-tier constraints before routing work to edge nodes, hash-chained knowledge delta aggregation with Byzantine fault-tolerant consolidation, and adaptive credibility scoring for trust-weighted federated knowledge merging across physically distributed sensor networks.

---

## 4. BACKGROUND OF THE INVENTION

### 4.1 State of the Art

The proliferation of low-cost single-board computers -- including the Raspberry Pi family, NVIDIA Jetson series, and ESP32-class microcontrollers -- has created an unprecedented opportunity for deploying distributed sensing, inference, and actuation networks at the network edge. These devices span several orders of magnitude in computational capability, from 512 MB RAM single-core processors to 8+ GB RAM multi-core processors with dedicated neural processing units (NPUs). Managing heterogeneous fleets of such devices requires solving several interrelated problems: device identity establishment, capability discovery, secure communication, task routing based on actual device capabilities, and trustworthy aggregation of knowledge produced by devices with varying reliability.

### 4.2 Limitations of Existing Solutions

Several existing systems and standards attempt to address aspects of this problem, but each suffers from significant limitations:

**Trusted Platform Module (TPM) and UEFI Secure Boot** provide hardware-rooted device identity and firmware integrity verification. TPM 2.0 (ISO/IEC 11889:2015) establishes a hardware root of trust through endorsement keys burned into silicon, and UEFI Secure Boot verifies firmware signatures during the boot chain. However, these technologies address only identity attestation and firmware integrity -- they do not produce runtime capability manifests describing a device's actual computational resources, attached sensors, actuators, local inference models, or network characteristics. A TPM-attested device is authenticated but not self-described. Furthermore, TPM modules are not universally present on constrained edge devices such as Raspberry Pi boards, and UEFI Secure Boot is not available on ARM-based single-board computers running Linux distributions that lack UEFI firmware.

**Puppet, Ansible, and Chef** are configuration management systems that maintain desired-state descriptions of infrastructure. Puppet uses a declarative language to describe system configuration; Ansible uses YAML playbooks executed over SSH; Chef uses Ruby-based recipes. These tools operate on a push or pull model where the administrator defines what the node should be, not what the node actually is. They do not implement autonomous self-description of hardware capabilities, do not generate signed capability manifests, do not perform capability-tier classification for task routing, and do not derive per-node cryptographic keys from a master secret for fleet-wide identity management. Ansible's `setup` module collects "facts" about a host (CPU count, memory, OS), but these facts are consumed by playbook conditionals -- they are not structured into signed manifests, are not used for tier-based task dispatch, and are not cryptographically bound to a device identity.

**Kubernetes Node Labels and Pod Scheduling** implements a label-based system where administrators manually apply labels to nodes (e.g., `gpu=true`, `zone=us-east-1`) and define pod affinity/anti-affinity rules that constrain scheduling. The Kubernetes scheduler evaluates node selectors, required affinities, and preferred affinities to match pods to nodes. However, Kubernetes node labels are administrator-assigned, not autonomously generated through hardware introspection. Kubernetes does not produce signed capability manifests, does not implement hierarchical capability tiers with task-type permission matrices, does not derive per-node cryptographic identities from a master key, and does not aggregate knowledge deltas from nodes with trust-weighted Byzantine consolidation. Kubernetes is also designed for containerized application orchestration on server-class hardware and is not suitable for deployment on constrained 512 MB RAM edge devices.

**AWS IoT Greengrass** provides an edge runtime and cloud service for deploying software components to IoT devices. Greengrass v2 uses a modular component architecture where pre-built or custom components are deployed to "core devices" that run the Greengrass nucleus. Device discovery is supported through the Greengrass discovery API, which allows client devices to locate core devices using X.509 certificates. However, Greengrass does not implement self-describing capability manifests that enumerate a device's computational resources, sensors, actuators, and local inference models. Greengrass component deployment is administrator-directed, not manifest-validated -- the cloud service does not automatically determine which components a device can run based on an introspected capability tier. Greengrass does not derive per-device cryptographic keys from a master soul key using HKDF, does not implement hash-chained knowledge deltas with Byzantine consolidation, and does not implement adaptive credibility scoring for trust-weighted knowledge merging.

**Azure IoT Edge** provides a container-based runtime for deploying cloud workloads to edge devices. Azure IoT Edge uses deployment manifests defined by the cloud operator to specify which modules (Docker containers) should run on each device. Device provisioning uses the Azure Device Provisioning Service (DPS) with X.509 certificates or symmetric keys. However, Azure IoT Edge deployment manifests are operator-defined, not device-generated through hardware introspection. The system does not produce self-describing capability manifests, does not implement capability-tier classification, does not validate task dispatch against device capabilities, and does not implement federated knowledge aggregation with trust scoring.

**Google's Agent2Agent (A2A) Protocol** (2025) introduces an "Agent Card" -- a structured JSON document that describes an agent's name, skills, endpoint URL, and supported data formats. The A2A Agent Card represents the closest prior art to the concept of self-describing agent manifests. However, as noted in recent academic analysis (arXiv:2508.15819v1), the Agent Card specification lacks a standard schema for describing host-related details including OS platforms, hardware capabilities, and resource availabilities (CPU, memory, network bandwidth) of edge devices that host AI agents. A2A Agent Cards describe what an agent can do logically (skills) but not what the underlying hardware can support physically. A2A does not implement capability-tier classification, does not derive per-agent cryptographic keys from a master key, does not validate task dispatch against hardware resource thresholds, and does not implement hash-chained knowledge deltas with Byzantine consolidation.

**MCU-Token** (arXiv:2403.15271, NDSS 2024) is a hardware fingerprinting framework for MCU-based IoT devices that generates hardware fingerprints based on request payloads, binding tokens to specific requests even if cryptographic keys are compromised. MCU-Token addresses device authentication through hardware fingerprinting but does not produce capability manifests, does not implement capability-tier classification or task dispatch validation, and does not aggregate knowledge deltas from multiple devices with trust-weighted consolidation.

**Physically Unclonable Functions (PUFs)** exploit manufacturing variations in integrated circuits to produce unique device-specific responses that serve as hardware fingerprints. PUFs generate cryptographic keys on-demand rather than storing them in memory. While PUFs provide a hardware root of trust analogous to TPM, they address only identity establishment and do not produce runtime capability manifests, capability-tier classifications, or manifest-validated task dispatch.

**Model-Based Fleet Deployment** (Manzano et al., ACM/IEEE MODELS 2020; Software and Systems Modeling, Springer 2022) addresses continuous delivery of software to distributed IoT device fleets, using fleet assignment tools that map devices to deployments. This work addresses software deployment logistics but does not implement self-describing capability manifests generated by the devices themselves, does not implement capability-tier classification, does not derive per-device cryptographic identities, and does not implement trust-weighted knowledge aggregation.

### 4.3 Unmet Need

There exists a need in the art for an integrated system that: (a) enables constrained edge devices to autonomously generate signed capability manifests through hardware and software introspection at first boot and upon hardware change events; (b) classifies each device into a hierarchical capability tier based on quantitative thresholds of computational resources, sensors, actuators, and local inference performance; (c) establishes per-device cryptographic identity through deterministic key derivation from a master secret using HKDF-SHA256, without requiring pre-provisioned certificates or hardware security modules; (d) validates every task dispatch against the target device's current capability manifest and tier, preventing capability-exceeding task assignments; (e) aggregates knowledge contributions from edge devices using hash-chained deltas with adaptive credibility scoring; and (f) consolidates federated knowledge using Byzantine fault-tolerant majority analysis across physically independent nodes.

---

## 5. SUMMARY OF THE INVENTION

The present invention provides a system and method for bootstrapping, managing, and orchestrating a fleet of heterogeneous constrained edge devices as autonomous agents within a centrally coordinated architecture. The system comprises the following integrated subsystems:

**A Self-Describing Capability Manifest Generator** that executes on each edge device at first boot and upon hardware change events, performing automated introspection of computational resources (CPU cores, clock frequency, RAM, storage), attached sensors (microphone, camera, GPIO, Bluetooth, WiFi, temperature, PIR presence), attached actuators (speaker, display, GPIO output), locally installed inference models (model name, size, quantization level, measured tokens-per-second throughput), and network characteristics (uplink bandwidth, latency to fleet coordinator, connection type). The generator assembles this introspection data into a structured capability manifest conforming to a defined JSON schema, computes a stable device identifier from hardware attributes, and signs the manifest using the device's derived cryptographic key.

**A Hierarchical Capability Tier Classifier** that evaluates each device's capability manifest against a five-tier classification system with quantitative thresholds. Each tier defines minimum requirements for RAM, CPU cores, CPU frequency, inference throughput, and sensor/actuator presence, and maps to a permission matrix specifying which task types (QUERY, ACT, SYNC) and subtypes the device is authorized to execute. The tier classification determines the device's poll interval, permitted task complexity, and eligibility for specific knowledge signal types.

**A Cryptographic Soul Key Derivation Service** that maintains a master secret (the "Soul Key") on the fleet coordinator node and derives per-device signing and authentication keys using HKDF-SHA256. The derivation uses the device's stable identifier as the salt and a fixed context string as the info parameter, producing a deterministic 32-byte key for each device. The derived key is used to sign capability manifests (HMAC-SHA256 or Ed25519), generate scoped JSON Web Tokens (JWTs) for authenticated access to the fleet coordinator's data store, and establish per-device namespaces with row-level security isolation.

**A Manifest-Validated Task Dispatch Engine** that evaluates every proposed task dispatch against the target device's current registered capability manifest and tier classification before enqueuing the task. The dispatch engine verifies that the task type is permitted for the device's tier, that required sensors or actuators specified in the task are present in the device's manifest, and that the device's current status is active. Tasks that fail manifest validation are rerouted to an eligible device or rejected with a structured error code.

**A Hash-Chained Knowledge Delta Aggregation System** that receives knowledge contributions (presence signals, activity observations, environmental readings, anomaly detections, and voice summaries) from edge devices as structured, size-bounded signal payloads. Each delta includes a chain hash computed as SHA-256 of the payload hash concatenated with the previous chain hash, establishing a tamper-evident append-only log per device. The aggregation system verifies chain integrity before accepting each delta.

**An Adaptive Credibility Rating (ACR) System** that maintains a per-device credibility score between 0.0 and 1.0, initialized at 0.7, and adjusts the score based on observed device reliability. Knowledge deltas are weighted by the product of the reported confidence and the device's current ACR score, establishing a trust-weighted contribution model. The ACR score is decremented upon chain hash mismatches, payload validation failures, and spot-check capability verification failures, and is set to 0.0 upon device quarantine.

**A Byzantine Fault-Tolerant Knowledge Consolidation Engine** that identifies groups of three or more corroborating knowledge deltas from physically independent nodes within a configurable time window, applies a confidence multiplier to confirmed groups, and flags consolidated knowledge for elevated trust status. This engine provides defense against knowledge poisoning by individual compromised nodes.

---

## 6. BRIEF DESCRIPTION OF THE DRAWINGS

**FIG. 1** is a system architecture diagram illustrating the overall topology of the self-describing constrained agent bootstrap system, showing the fleet coordinator node comprising the node registry, soul memory store, and task dispatch engine, the HTTPS/WSS communication channels, and a plurality of edge nodes at varying capability tiers (Tier 1 through Tier 5), each running the bootstrap protocol and poll loop.

**FIG. 2** is a flowchart illustrating the six-step bootstrap sequence from first boot through first task execution, depicting the FOOTPRINT step (hardware introspection and manifest assembly), the REGISTER step (manifest submission and key derivation), the SIGN MANIFEST step (manifest re-signing with derived key), the FIRST HEARTBEAT step (liveness confirmation), the POLL LOOP step (tier-calibrated task polling), and the FIRST KNOWLEDGE DELTA step (genesis chain hash establishment).

**FIG. 3** is a data structure diagram illustrating the capability manifest JSON schema, depicting the platform section (hardware model, OS, kernel, architecture), the compute section (CPU cores, frequency, RAM, storage, local models with inference throughput), the sensors section (microphone, camera, GPIO, Bluetooth, WiFi, temperature, PIR, custom sensors), the actuators section (speaker, display, GPIO output, custom actuators), and the network section (uplink bandwidth, latency, connection type, interfaces).

**FIG. 4** is a block diagram illustrating the HKDF-SHA256 key derivation hierarchy, depicting the master Soul Key stored on the fleet coordinator, the HKDF Extract phase using the node identifier as salt, the HKDF Expand phase using the fixed context string as info, the resulting 32-byte per-node derived key, and the JWT generation flow producing namespace-scoped authentication tokens.

**FIG. 5** is a decision flow diagram illustrating the manifest-validated task dispatch algorithm, depicting the task receipt, the capability tier lookup, the tier-permission matrix evaluation, the sensor/actuator presence verification, the device status check, the task enqueue upon successful validation, and the reroute or rejection upon validation failure, with structured error codes for each failure mode.

**FIG. 6** is a table diagram illustrating the five-tier capability classification system, depicting for each tier (1 through 5): the minimum hardware requirements (RAM, CPU cores, CPU frequency, inference throughput), the required sensor and actuator presence, the permitted task types and subtypes, the calibrated poll interval, and representative hardware examples.

**FIG. 7** is a sequence diagram illustrating the hash-chained knowledge delta flow, depicting the edge node's local observation, signal payload construction with size enforcement, chain hash computation (SHA-256 of payload hash concatenated with previous chain hash), delta transmission to the fleet coordinator, chain integrity verification, ACR-weighted confidence computation, and merge-or-queue decision.

**FIG. 8** is a diagram illustrating the Byzantine fault-tolerant knowledge consolidation process, depicting the collection of correlated deltas from three or more physically independent nodes within a time window, the payload similarity grouping, the physical independence verification, the confidence multiplier application, and the consolidated knowledge record with the byzantine_confirmed flag.

**FIG. 9** is a state diagram illustrating the node lifecycle, depicting the states REGISTERING, ACTIVE, OFFLINE, and QUARANTINED, with transitions triggered by successful registration, heartbeat timeout, signature verification failure, manual quarantine, and manual re-registration approval.

---

## 7. DETAILED DESCRIPTION OF PREFERRED EMBODIMENTS

The following detailed description sets forth specific embodiments of the present invention. It will be understood that the invention is not limited to the specific embodiments described herein, and that various modifications, substitutions, and equivalents will be apparent to those skilled in the art.

### 7.1 System Architecture Overview

Referring now to FIG. 1, the system of the present invention comprises a fleet coordinator node (100) and a plurality of edge nodes (200a, 200b, 200c, ..., 200n). The fleet coordinator node (100) is a centrally located server maintaining the authoritative registry of all edge nodes, their current capability manifests, and a federated knowledge store populated by node contributions. Each edge node (200x) is a constrained computing device running a bootstrap protocol at first boot and on hardware change events.

The fleet coordinator node (100) comprises the following components:

- A node registry data store (110) that stores the current capability manifest, capability tier, derived key identifier, soul namespace, status, ACR score, and manifest signature for each registered edge node;
- A task dispatch engine (120) that evaluates proposed task assignments against registered capability manifests and tier-permission matrices before enqueuing tasks;
- A soul memory store (130) comprising hot-tier, warm-tier, and cold-tier knowledge repositories populated by merged knowledge deltas from edge nodes;
- A master Soul Key vault (140) that securely stores the root cryptographic secret used for per-node key derivation;
- An HKDF key derivation service (150) that derives per-node 32-byte signing keys on demand from the master Soul Key; and
- A Byzantine consolidation engine (160) that identifies and validates corroborating knowledge contributions from physically independent nodes.

Each edge node (200x) comprises:

- A bootstrap agent (210) that performs hardware and software introspection and generates capability manifests;
- A manifest signing module (220) that signs manifests using the node's derived key;
- A poll loop agent (230) that polls the task dispatch queue at a tier-calibrated interval;
- A task execution engine (240) that executes dispatched tasks (QUERY, ACT, SYNC) within the bounds of the node's declared capabilities;
- A knowledge delta producer (250) that constructs hash-chained knowledge contributions from local sensor observations; and
- A heartbeat transmitter (260) that reports node health status at regular intervals.

Communication between the fleet coordinator (100) and edge nodes (200x) occurs over HTTPS or WSS (WebSocket Secure) channels. Edge nodes do not communicate peer-to-peer. All knowledge flows through the fleet coordinator. This star topology is a structural privacy property: no edge node can observe another edge node's raw contributions, and the fleet coordinator mediates all inter-node information flow.

### 7.2 Self-Describing Capability Manifest Generation

Referring now to FIGS. 2 and 3, the bootstrap agent (210) on each edge node executes a hardware and software introspection process that produces a structured capability manifest. The manifest conforms to the following schema:

```
CapabilityManifest {
    node_id: String,                    // Stable identifier: SHA-256(hw_model + mac_address)[:16]
    manifest_version: String,           // Semantic version (e.g., "1.0")
    signed_at: Timestamp,              // ISO 8601 UTC timestamp of manifest generation
    signature: String,                  // Hex-encoded signature over canonical JSON
    signature_method: String,           // "ed25519" or "hmac-sha256"

    platform: {
        hw_model: String,              // e.g., "Raspberry Pi 5 Model B Rev 1.0"
        os: String,                    // e.g., "Raspberry Pi OS Bookworm 64-bit"
        kernel: String,                // e.g., "6.6.31+rpt-rpi-2712"
        architecture: String           // e.g., "aarch64"
    },

    compute: {
        cpu_cores: Integer,            // Number of CPU cores detected
        cpu_mhz: Integer,             // Maximum CPU frequency detected
        ram_mb: Integer,              // Total physical RAM in megabytes
        ram_available_mb: Integer,     // Available RAM at introspection time
        storage_mb: Integer,           // Total filesystem storage
        storage_available_mb: Integer, // Available storage at introspection time
        local_models: Array[{
            model_name: String,        // e.g., "phi-2"
            model_size_mb: Integer,
            quantization: String,      // e.g., "Q4_K_M"
            inference_tps: Float       // Tokens per second measured at introspection
        }],
        inference_tps: Float           // Aggregate inference throughput (0 if no models)
    },

    sensors: {
        microphone: Boolean,
        microphone_channels: Integer,
        camera: Boolean,
        camera_resolution_mp: Float,
        gpio_count: Integer,
        bluetooth: Boolean,
        bluetooth_version: String | Null,
        wifi: Boolean,
        wifi_bands: Array[String],
        temperature_sensor: Boolean,
        pir_presence: Boolean,
        custom: Array[{
            sensor_type: String,
            sensor_id: String,
            protocol: String           // "I2C", "SPI", "USB", or "GPIO"
        }]
    },

    actuators: {
        speaker: Boolean,
        display_type: String | Null,   // "hdmi", "dsi", "spi-tft", "epaper"
        display_resolution: String | Null,
        gpio_output: Boolean,
        gpio_output_count: Integer,
        custom: Array[{
            actuator_type: String,
            actuator_id: String,
            protocol: String
        }]
    },

    network: {
        uplink_kbps: Integer,          // Measured at introspection time
        latency_ms: Integer,           // RTT to fleet coordinator endpoint
        connection_type: String,       // "wifi", "ethernet", "lte", "none"
        interfaces: Array[String]
    },

    soul_namespace: String,            // Assigned by fleet coordinator
    capability_tier: Integer,          // 1-5, computed by tier classifier
    footprint_duration_ms: Integer     // Duration of introspection process
}
```

**7.2.1 Hardware Introspection Process**

The bootstrap agent (210) performs the following introspection steps using only standard library facilities available on the target operating system (no external dependencies required):

1. **Platform Detection**: Reads `/proc/cpuinfo`, `/proc/device-tree/model`, and `uname` output to determine hardware model, operating system, kernel version, and CPU architecture.

2. **Compute Resource Enumeration**: Reads `/proc/meminfo` for total and available RAM, queries `/sys/devices/system/cpu/` for CPU core count and maximum frequency, and reads filesystem statistics for storage capacity and availability.

3. **Local Model Detection**: Scans for locally installed inference runtimes (e.g., Ollama) and enumerates available models, executing a brief benchmark to measure tokens-per-second throughput for each model.

4. **Sensor Detection**: Enumerates USB devices via `/sys/bus/usb/devices/`, detects audio input devices via ALSA or PulseAudio interfaces, detects camera devices via `/dev/video*` device nodes, enumerates GPIO pins via `/sys/class/gpio/`, detects Bluetooth adapters via `hciconfig` or `/sys/class/bluetooth/`, detects WiFi interfaces via `/sys/class/net/`, and probes I2C and SPI buses for attached sensor peripherals.

5. **Actuator Detection**: Detects audio output devices, display interfaces (HDMI via `/sys/class/drm/`, DSI, SPI-TFT, e-paper via device tree overlays), and GPIO output capabilities.

6. **Network Measurement**: Measures uplink bandwidth through a lightweight probe to the fleet coordinator endpoint and computes round-trip latency.

7. **Stable Identifier Computation**: Computes `node_id = SHA-256(hw_model + mac_address)[:16]`, producing a deterministic 16-character hexadecimal identifier that remains stable across reboots but changes if hardware is swapped.

**7.2.2 Manifest Signature Computation**

The manifest is signed by computing an HMAC-SHA256 over the canonical JSON representation of all manifest fields except the `signature` and `signature_method` fields:

```
FUNCTION sign_manifest(manifest: Dict, node_key: Bytes) -> String:
    // Remove signature fields
    payload = {k: v FOR k, v IN manifest.items() WHERE k NOT IN ("signature", "signature_method")}

    // Canonical JSON: sorted keys, no whitespace
    canonical = JSON_SERIALIZE(payload, sort_keys=TRUE, separators=(',', ':'))

    // HMAC-SHA256 signature
    signature = HMAC_SHA256(key=node_key, message=canonical.encode('utf-8'))

    RETURN hex_encode(signature)
```

Alternatively, for devices with Ed25519 capability, the signature is computed using the Ed25519 algorithm with the derived key as the signing key. The `signature_method` field indicates which algorithm was used, enabling the fleet coordinator to select the correct verification algorithm.

**7.2.3 Re-Footprint Triggers**

The bootstrap agent is re-invoked upon:

- USB device addition or removal (detected via udev rules on Linux);
- Daily scheduled execution (cron job at 03:00 local time);
- Operating system or kernel update events.

Upon re-invocation, the bootstrap agent generates a new manifest and compares it to the previously stored manifest. If the capability tier or any sensor, actuator, or compute field has changed, the updated manifest is transmitted to the fleet coordinator for registry update. If unchanged, the agent logs "no change" and exits without network communication.

### 7.3 Hierarchical Capability Tier Classification

Referring now to FIG. 6, the capability tier classifier evaluates each device's manifest against a five-tier classification system. Each tier is defined by quantitative minimum requirements and maps to a permission matrix.

**7.3.1 Tier 1 -- Minimal Sensor Node**

Minimum requirements: RAM >= 256 MB; any CPU configuration; no local inference capability (inference_tps = 0); at least one sensor or actuator present.

Permitted task types: QUERY (lightweight subtypes only: presence_check, status, config_fetch), SYNC.
Not permitted: ACT tasks, inference tasks, voice tasks.
Calibrated poll interval: 60 seconds.
Representative hardware: Raspberry Pi Zero 2W, ESP32 with Linux companion.

**7.3.2 Tier 2 -- Sensor with Light Processing**

Minimum requirements: RAM >= 1024 MB; CPU >= 2 cores at >= 1 GHz; inference runtime available with inference_tps >= 3.0; USB support.

Permitted task types: QUERY (standard), SYNC, ACT (GPIO subtypes only: gpio_write, relay_control, display_write).
Not permitted: Inference ACT tasks, voice_summary SYNC tasks.
Calibrated poll interval: 30 seconds.
Representative hardware: Raspberry Pi 3B+.

**7.3.3 Tier 3 -- Inference-Capable Node**

Minimum requirements: RAM >= 2048 MB; CPU >= 4 cores at >= 1.5 GHz; inference runtime available with inference_tps >= 6.0; at least one actuator (speaker or display); camera or microphone present.

Permitted task types: QUERY (all subtypes), SYNC (signal types: presence, activity, environmental, anomaly), ACT (GPIO + inference subtypes: gpio_write, relay_control, display_write, local_inference_query).
Calibrated poll interval: 15 seconds.
Representative hardware: Raspberry Pi 4 4GB with 1B parameter quantized model.

**7.3.4 Tier 4 -- Full Edge AI Node**

Minimum requirements: RAM >= 6144 MB; CPU >= 4 cores at >= 1.8 GHz; inference runtime available with inference_tps >= 12.0; camera AND microphone present.

Permitted task types: QUERY (all), SYNC (all signal types including voice_summary), ACT (all non-physical-risk subtypes including voice_capture_analyze, scene_describe, local_reasoning).
Calibrated poll interval: 10 seconds.
Representative hardware: Raspberry Pi 5 8GB with 3B parameter model, USB camera, USB microphone.

**7.3.5 Tier 5 -- High-Capability Edge AI Node**

Minimum requirements: RAM >= 12288 MB; inference runtime with inference_tps >= 25.0; dedicated inference hardware (NPU, GPU, or AI accelerator HAT); full sensor suite (camera, microphone, GPIO, Bluetooth).

Permitted task types: All task types including high-privilege ACT tasks (physical_actuator_control, autonomous_decision_execute).
Calibrated poll interval: 5 seconds.
Note: Physical-risk ACT tasks (actuating relays that control physical infrastructure) require Tier 5 AND an explicit capability flag in the manifest's `actuators.custom` array confirming the specific actuator type.
Representative hardware: Raspberry Pi 5 with AI HAT+ (26 TOPS), NVIDIA Jetson Nano, NVIDIA Jetson Orin NX.

### 7.4 Cryptographic Soul Key Derivation

Referring now to FIG. 4, the HKDF key derivation service (150) on the fleet coordinator derives per-node cryptographic keys from the master Soul Key.

**7.4.1 Master Soul Key**

The master Soul Key is the root credential of the fleet. It is stored in the fleet coordinator's secure vault (140) and is loaded into process memory at startup. The master Soul Key never leaves the fleet coordinator node. It is never transmitted to any edge node.

**7.4.2 HKDF-SHA256 Derivation**

Per-node keys are derived using HKDF-SHA256 (RFC 5869) with the following parameters:

```
FUNCTION derive_node_key(master_soul_key: Bytes, node_id: String) -> Bytes:
    // HKDF Extract phase
    salt = node_id.encode('utf-8')
    prk = HMAC_SHA256(key=salt, message=master_soul_key)

    // HKDF Expand phase
    info = b"saluca-021-node-key"
    t = HMAC_SHA256(key=prk, message=info + bytes([0x01]))

    RETURN t[:32]  // 32-byte (256-bit) derived key
```

The derivation is deterministic: given the same master Soul Key and node identifier, the same derived key is always produced. This enables the fleet coordinator to re-derive a node's key at any time without storing derived keys, as only the master Soul Key and node identifier are needed.

**7.4.3 JWT Generation for Data Store Access**

The derived key is used as an HMAC-SHA256 secret to generate JWTs for the edge node's authenticated access to the fleet coordinator's data store:

```
JWT_PAYLOAD {
    sub: "<node_id>",          // Subject: the node's stable identifier
    role: "node_agent",        // Role: constrained agent role
    namespace: "<soul_namespace>",  // Scoped data namespace
    exp: <now + 3600>,         // Expiry: 1 hour
    iat: <now>                 // Issued at
}
```

The JWT is signed with the derived node key and transmitted to the node during the registration handshake. The data store enforces row-level security (RLS) policies that restrict this JWT to reading and writing only within its designated namespace. A node's JWT cannot access any other node's data.

**7.4.4 Key Rotation**

Key rotation is triggered when: (a) a node re-registers after quarantine; (b) the fleet coordinator detects manifest signature verification failure; or (c) an administrator manually revokes a node's key.

Upon rotation, the fleet coordinator increments a rotation counter in the HKDF info string (e.g., `b"saluca-021-node-key-v2"`), derives a new key, invalidates the old JWT by adding its signature to a blocklist, issues a new JWT signed with the new key, and updates the `derived_key_id` field in the node registry.

### 7.5 Six-Step Bootstrap Sequence

Referring now to FIG. 2, the complete bootstrap sequence from first boot through first task execution proceeds as follows:

**Step 1: FOOTPRINT**

The bootstrap agent (210) executes the hardware and software introspection process described in Section 7.2.1, enumerating all computational resources, sensors, actuators, local models, and network characteristics. The agent computes the stable node identifier (`SHA-256(hw_model + mac_address)[:16]`), evaluates the tier classifier to determine the capability tier, and assembles the complete capability manifest JSON.

**Step 2: REGISTER**

The bootstrap agent transmits the unsigned manifest to the fleet coordinator's registration endpoint via HTTPS POST. The fleet coordinator validates the manifest structure, derives the node key using `HKDF(master_soul_key, node_id)`, inserts a new row in the node registry (110), and returns to the node: (a) the assigned soul namespace, (b) a signed JWT for data store access, and (c) the tier-calibrated poll interval.

**Step 3: SIGN MANIFEST**

The edge node re-signs the manifest using the received derived key (via HMAC-SHA256 or Ed25519) and transmits the signed manifest to the fleet coordinator. The fleet coordinator verifies the signature by independently re-deriving the key and performing the same signature computation. Upon successful verification, the fleet coordinator writes the signature to the `manifest_signature` field in the node registry in the format `"<method>:<hex>"` (e.g., `"hmac-sha256:a1b2c3..."`).

**Step 4: FIRST HEARTBEAT**

The edge node transmits its first heartbeat as a lightweight SYNC response containing:

```
Heartbeat {
    node_id: String,
    timestamp: Timestamp,           // ISO 8601 UTC
    status: String,                 // "healthy", "degraded", or "low_resource"
    ram_available_mb: Integer,
    cpu_load_1m: Float,
    uptime_seconds: Integer,
    manifest_version: String,
    chain_hash_current: String      // "genesis" for first heartbeat
}
```

The fleet coordinator updates `last_seen_at` in the node registry and confirms the node as active.

**Step 5: POLL LOOP**

The edge node begins polling the task dispatch queue at the tier-calibrated interval. The poll loop retrieves pending tasks assigned to the node's identifier, ordered by dispatch time, limited to a batch of 5 tasks per poll cycle.

**Step 6: FIRST KNOWLEDGE DELTA**

After one observation cycle, the edge node constructs its first knowledge delta with a genesis chain hash:

```
genesis_chain_hash = SHA-256(payload_hash || "genesis")
```

This establishes the root of the node's hash chain. Subsequent deltas reference the previous chain hash, creating a tamper-evident append-only log.

### 7.6 Manifest-Validated Task Dispatch

Referring now to FIG. 5, the task dispatch engine (120) evaluates every proposed task dispatch against the target device's current registered capability manifest.

**7.6.1 Task Request Schema**

All tasks are classified into three types:

QUERY tasks request information from the node:
```
QUERY_PAYLOAD {
    query_type: String,     // "presence_check", "status", "config_fetch",
                            //  "sensor_read", "inference_query"
    query_params: Dict,
    response_format: "json",
    timeout_ms: Integer     // Default: 5000
}
```

ACT tasks instruct the node to perform a physical or computational action:
```
ACT_PAYLOAD {
    act_type: String,       // "gpio_write", "relay_control", "display_write",
                            //  "voice_capture_analyze", "local_inference_query",
                            //  "scene_describe", "physical_actuator_control",
                            //  "autonomous_decision_execute"
    act_params: Dict,
    safety_check: Boolean,  // Default: TRUE
    timeout_ms: Integer,    // Default: 10000
    rollback_on_failure: Boolean  // Default: TRUE
}
```

SYNC tasks request knowledge exchange:
```
SYNC_PAYLOAD {
    sync_direction: String, // "push", "pull", "bidirectional"
    signal_types: Array[String],
    since: Timestamp,
    max_deltas: Integer     // Default: 50
}
```

**7.6.2 Dispatch Validation Algorithm**

```
FUNCTION validate_dispatch(task, target_node_manifest, target_node_registry):
    // Step 1: Verify node status
    IF target_node_registry.status != "active":
        RETURN ERROR("node_offline")

    // Step 2: Verify tier permits task type
    tier = target_node_registry.capability_tier
    permitted_types = TIER_PERMISSION_MATRIX[tier].task_types
    IF task.task_type NOT IN permitted_types:
        RETURN ERROR("tier_insufficient")

    // Step 3: Verify tier permits task subtype
    IF task.task_type == "ACT":
        permitted_subtypes = TIER_PERMISSION_MATRIX[tier].act_subtypes
        IF task.payload.act_type NOT IN permitted_subtypes:
            RETURN ERROR("tier_insufficient")

    IF task.task_type == "QUERY":
        permitted_subtypes = TIER_PERMISSION_MATRIX[tier].query_subtypes
        IF task.payload.query_type NOT IN permitted_subtypes:
            RETURN ERROR("tier_insufficient")

    // Step 4: Verify required hardware capabilities
    IF task requires camera AND NOT target_node_manifest.sensors.camera:
        RETURN ERROR("capability_missing")
    IF task requires microphone AND NOT target_node_manifest.sensors.microphone:
        RETURN ERROR("capability_missing")
    IF task requires speaker AND NOT target_node_manifest.actuators.speaker:
        RETURN ERROR("capability_missing")
    IF task requires display AND target_node_manifest.actuators.display_type IS NULL:
        RETURN ERROR("capability_missing")
    IF task requires inference AND target_node_manifest.compute.inference_tps == 0:
        RETURN ERROR("capability_missing")

    // Step 5: Verify physical-risk actuator for Tier 5 ACT tasks
    IF task.payload.act_type IN ("physical_actuator_control", "autonomous_decision_execute"):
        IF tier < 5:
            RETURN ERROR("tier_insufficient")
        IF task.payload.act_params.actuator_type NOT IN
           [a.actuator_type FOR a IN target_node_manifest.actuators.custom]:
            RETURN ERROR("capability_missing")

    // Validation passed: enqueue task
    RETURN SUCCESS
```

**7.6.3 Error Codes and Rerouting**

The dispatch engine defines the following structured error codes:

| Code | Meaning | Recovery Action |
|------|---------|----------------|
| `capability_missing` | Required hardware not in manifest | Reroute to eligible node |
| `node_offline` | Node not seen within 2x poll interval | Tasks expire; node marked offline |
| `signature_invalid` | Manifest signature verification failed | Node quarantined; tasks cleared |
| `tier_insufficient` | Task requires higher capability tier | Reroute to higher-tier node |
| `chain_hash_mismatch` | Delta's prev_hash doesn't match stored | Delta rejected; ACR decremented by 0.05 |
| `payload_size_exceeded` | Delta payload exceeds 1KB limit | Delta rejected |

Upon a reroutable error, the dispatch engine queries the node registry for alternative nodes with sufficient capability tier and the required hardware capabilities, and re-dispatches the task to the most suitable available node.

### 7.7 Hash-Chained Knowledge Delta Aggregation

Referring now to FIG. 7, the knowledge delta aggregation system receives structured knowledge contributions from edge nodes.

**7.7.1 Knowledge Signal Types**

The system defines six signal types, each with a structured payload schema:

- **presence**: Reports detection or absence of human presence via PIR sensor, camera motion detection, audio activity detection, or Bluetooth scan, with confidence score, estimated count, and location hint.

- **activity**: Reports classified human activity (conversation, movement, focused work, media consumption, sleep) with confidence, duration, and derivation source references.

- **topic_signal**: Reports semantic topic detection from voice summaries, displayed text, or inference results, with topic list, sentiment score, and urgency estimate. Requires Tier 3 or higher.

- **environmental**: Reports ambient environmental measurements including temperature, humidity, light level, noise level, and air quality index.

- **anomaly**: Reports detected anomalies (unexpected presence, unusual activity pattern, environmental spike, hardware fault) with severity score and a flag indicating whether the anomaly requires fleet coordinator attention.

- **voice_summary**: Reports compressed natural language summaries of audio observations, with topic extraction, sentiment analysis, and duration. Requires Tier 4 or higher. Raw audio is never transmitted; only the locally-inferred summary is transmitted.

**7.7.2 Payload Size Enforcement**

All signal payloads are serialized as compact JSON with no whitespace. Maximum payload size is 1024 bytes, enforced before transmission. Payloads exceeding 1KB are truncated at the application layer with a `truncated: true` flag. Voice summaries are capped at 500 characters. Raw audio, video, or image data is never transmitted to the fleet coordinator.

**7.7.3 Chain Hash Computation**

Each knowledge delta includes a chain hash establishing tamper-evident ordering:

```
FUNCTION compute_chain_hash(payload: Dict, prev_chain_hash: String) -> String:
    payload_json = JSON_SERIALIZE(payload, sort_keys=TRUE, separators=(',', ':'))
    payload_hash = SHA256(payload_json.encode('utf-8'))
    chain_input = payload_hash + "||" + prev_chain_hash
    RETURN SHA256(chain_input.encode('utf-8'))
```

For the first delta from a node, `prev_chain_hash` is the string `"genesis"`. Each subsequent delta references the chain hash of the immediately preceding delta from the same node.

**7.7.4 Chain Integrity Verification**

The fleet coordinator verifies each incoming delta's chain integrity by:

1. Retrieving the most recent stored chain hash for the submitting node;
2. Comparing the delta's declared `prev_hash` to the stored chain hash;
3. Recomputing the chain hash from the payload and declared `prev_hash`;
4. Verifying that the recomputed chain hash matches the delta's declared `chain_hash`.

If `prev_hash` does not match the stored chain hash, the delta is rejected with error code `chain_hash_mismatch`, and the node's ACR score is decremented by 0.05.

### 7.8 Adaptive Credibility Rating (ACR) System

The ACR system maintains a per-device credibility score that weights the device's knowledge contributions.

**7.8.1 ACR-Weighted Confidence Computation**

```
FUNCTION weighted_confidence(delta: Dict) -> Float:
    RETURN delta.confidence * delta.acr_at_time
```

Where `delta.confidence` is the node's self-reported confidence in its observation (0.0 to 1.0), and `delta.acr_at_time` is the node's ACR score at the time of delta submission.

**7.8.2 Merge Decision**

If `weighted_confidence >= 0.5`, the delta is merged into the cold-tier knowledge store immediately.
If `weighted_confidence < 0.5`, the delta is stored with `merge_status = 'pending'` and reconsidered when the node's ACR score changes or when Byzantine majority is established for corroborating deltas.

**7.8.3 ACR Score Adjustments**

The ACR score is adjusted as follows:

- Decremented by 0.05 upon `chain_hash_mismatch`;
- Decremented by 0.10 upon spot-check capability verification failure (the fleet coordinator dispatches test tasks that exercise claimed capabilities and verifies results);
- Set to 0.0 upon node quarantine;
- Reset to 0.7 upon successful re-registration after quarantine (with manual admin approval).

The ACR score is bounded between 0.0 and 1.0.

### 7.9 Byzantine Fault-Tolerant Knowledge Consolidation

Referring now to FIG. 8, the Byzantine consolidation engine (160) implements a corroboration-based trust amplification mechanism.

**7.9.1 Consolidation Algorithm**

```
FUNCTION check_byzantine_majority(signal_type: String, time_window_seconds: Integer) -> Array:
    // Step 1: Query knowledge deltas of the specified signal type
    //         within the time window
    recent_deltas = QUERY(node_knowledge_deltas
                          WHERE signal_type = signal_type
                          AND created_at >= NOW() - time_window_seconds)

    // Step 2: Group by payload similarity
    //         (cosine similarity on topic vectors for topic_signal,
    //          exact match on anomaly_type for anomaly signals,
    //          threshold proximity for environmental readings)
    groups = CLUSTER_BY_SIMILARITY(recent_deltas)

    // Step 3: Filter for groups with 3+ physically independent nodes
    confirmed_groups = []
    FOR EACH group IN groups:
        unique_nodes = DISTINCT(group, key=node_id)
        IF COUNT(unique_nodes) >= 3:
            // Verify physical independence: nodes must have distinct
            // location metadata in node_registry
            independent = VERIFY_PHYSICAL_INDEPENDENCE(unique_nodes)
            IF independent:
                confirmed_groups.APPEND(group)

    // Step 4: Apply confidence multiplier to confirmed groups
    FOR EACH group IN confirmed_groups:
        FOR EACH delta IN group:
            delta.byzantine_confirmed = TRUE
            delta.effective_confidence = delta.weighted_confidence * 1.5

    RETURN confirmed_groups
```

**7.9.2 Defense Against Knowledge Poisoning**

The Byzantine consolidation mechanism provides defense against individual compromised nodes:

1. A single compromised node cannot establish Byzantine majority -- three or more physically independent nodes are required.
2. Fabricated deltas from a compromised node are weighted by the node's ACR score, which is decremented upon chain hash mismatches that a fabricating node inevitably produces.
3. ACR weighting limits the impact: a single node's contribution is weighted by its ACR score (default 0.7), so even a high-confidence fabricated delta contributes weighted_confidence of at most 0.7.

### 7.10 Node Security Model

**7.10.1 Node Compromise Response**

When a node is compromised (hardware stolen, firmware modified):

1. The fleet coordinator detects manifest signature verification failure on next registration attempt;
2. The node's status is set to `quarantined` in the node registry;
3. The derived key is invalidated (JWT added to blocklist);
4. All pending tasks are cleared from the task queue;
5. All unmerged deltas from the node are re-evaluated before merge;
6. The ACR score is set to 0.0;
7. Any merged knowledge attributed primarily to the quarantined node (ACR-weighted contribution > 0.8) is flagged for review.

Re-registration requires manual approval from the fleet coordinator's administrative interface. A new derived key is generated with a new rotation counter.

**7.10.2 Capability Spoofing Defense**

A node cannot successfully claim capabilities it does not possess because:

1. The manifest is signed with the derived key -- the fleet coordinator verifies the signature independently before routing any tasks;
2. The bootstrap protocol produces conservative capability estimates (floor, not ceiling);
3. The fleet coordinator performs spot-check ACT tasks on newly registered nodes, dispatching tasks that exercise claimed capabilities and verifying results before granting full capability routing.

**7.10.3 Physical Access Attack Mitigation**

The highest-value secret on an edge node is its current JWT. Compromise of this JWT allows reading the node's own registry row, submitting knowledge deltas under the node's identity, and claiming tasks for this node. It does NOT allow accessing any other node's data (RLS enforced), reading the master Soul Key, writing to other nodes' namespaces, or bypassing manifest signature verification. The JWT is time-limited (1-hour expiry, rotated on heartbeat), limiting the attack window.

### 7.11 Node Registry Data Store Schema

The node registry (110) maintains the following schema:

```
NodeRegistry {
    node_id:              String PRIMARY KEY,
    capability_manifest:  JSON,          // Full manifest as described in Section 7.2
    capability_tier:      Integer,       // 1-5
    derived_key_id:       String,        // HKDF derivation identifier
    soul_namespace:       String,        // Data namespace for this node
    last_footprint_at:    Timestamp,     // When manifest was last produced
    last_seen_at:         Timestamp,     // Last heartbeat or task interaction
    status:               String,        // "active", "offline", "quarantined"
    acr_score:            Float,         // 0.0-1.0, default 0.7
    manifest_signature:   String,        // "<method>:<hex>"
    created_at:           Timestamp
}
```

Indices are maintained on `capability_tier`, `status`, `last_seen_at` (descending), and `soul_namespace` for efficient dispatch queries.

Row-level security policies ensure:
- Each node's derived key JWT is scoped to its `soul_namespace`;
- A node JWT can only SELECT its own row;
- Only the fleet coordinator's service role key can INSERT, UPDATE, or DELETE rows;
- Nodes submit manifests via a dedicated edge function that validates signature before write.

---

## 8. CLAIMS

### Independent Claims

**Claim 1.** A computer-implemented system for bootstrapping and managing a fleet of heterogeneous constrained edge devices as autonomous agents, the system comprising:

a processor; and

a non-transitory computer-readable memory storing instructions that, when executed by the processor, cause the system to:

(a) receive, from each of a plurality of edge devices, a self-describing capability manifest generated by the edge device through automated hardware and software introspection, the capability manifest comprising: a stable device identifier computed from hardware attributes, an enumeration of computational resources including processor core count, processor frequency, total memory, and available storage, an enumeration of attached sensors, an enumeration of attached actuators, an enumeration of locally installed inference models with measured inference throughput in tokens per second, and network characteristics including measured uplink bandwidth and latency;

(b) classify each edge device into one of a plurality of hierarchical capability tiers based on quantitative thresholds applied to the computational resources, sensors, actuators, and inference throughput enumerated in the capability manifest, wherein each capability tier maps to a permission matrix specifying which task types and task subtypes the edge device is authorized to execute;

(c) derive, for each edge device, a per-device cryptographic key from a master secret using HKDF-SHA256, using the device's stable identifier as the salt parameter and a fixed context string as the info parameter, to produce a deterministic derived key;

(d) verify the integrity of each capability manifest by validating a cryptographic signature computed over the canonical JSON representation of the manifest using the per-device derived key;

(e) for each proposed task dispatch directed to a target edge device, evaluate the proposed task against the target device's registered capability manifest and capability tier by: verifying that the task type is permitted by the target device's tier-specific permission matrix, verifying that hardware capabilities required by the task are present in the target device's manifest, and verifying that the target device's status is active; and

(f) enqueue the task for the target edge device only upon successful validation, or reroute the task to an alternative edge device with sufficient capability upon validation failure.

**Claim 2.** The system of Claim 1, wherein the capability manifest further comprises a signature field and a signature method field, and wherein the signature is computed as one of HMAC-SHA256 or Ed25519 over a canonical JSON serialization of all manifest fields excluding the signature field and the signature method field.

**Claim 3.** The system of Claim 1, wherein the stable device identifier is computed as the first 16 hexadecimal characters of a SHA-256 hash of the concatenation of a hardware model string and a MAC address.

**Claim 4.** The system of Claim 1, wherein the plurality of hierarchical capability tiers comprises at least five tiers, wherein a first tier requires minimum RAM of 256 megabytes and permits only lightweight query tasks with a poll interval of 60 seconds, and a fifth tier requires minimum RAM of 12,288 megabytes, minimum inference throughput of 25 tokens per second, and dedicated inference hardware, and permits all task types including physical actuator control.

**Claim 5.** The system of Claim 1, wherein the instructions further cause the system to generate, for each edge device, a JSON Web Token (JWT) signed with the per-device derived key, the JWT comprising a subject claim set to the device's stable identifier, a role claim set to a constrained agent role, and a namespace claim scoped to a device-specific data partition, and wherein a data store enforces row-level security policies restricting the JWT to read and write operations within the device-specific data partition.

**Claim 6.** The system of Claim 1, wherein the automated hardware and software introspection performed by each edge device comprises: reading processor information from operating system interfaces, enumerating USB-connected devices, detecting audio input and output devices, detecting camera devices via device nodes, enumerating GPIO pins, detecting Bluetooth and WiFi interfaces, and benchmarking locally installed inference models to measure tokens-per-second throughput.

**Claim 7.** The system of Claim 1, wherein the capability manifest is regenerated upon detection of a hardware change event, the hardware change event comprising one of: addition of a USB device, removal of a USB device, or a scheduled daily re-introspection, and wherein the regenerated manifest is transmitted to the fleet coordinator only if the capability tier or any sensor, actuator, or compute field has changed.

**Claim 8.** A computer-implemented method for trust-weighted federated knowledge aggregation across a fleet of heterogeneous edge devices, the method comprising:

(a) receiving, from each of a plurality of edge devices, knowledge deltas comprising structured signal payloads, each knowledge delta including: a signal type, a signal payload bounded to a maximum size, a self-reported confidence score, the submitting device's current adaptive credibility rating (ACR) score, a chain hash computed as SHA-256 of the concatenation of a payload hash and a previous chain hash, and a reference to the previous chain hash;

(b) verifying chain integrity for each received knowledge delta by comparing the declared previous chain hash to the most recently stored chain hash for the submitting device, and rejecting the delta with a decrement to the device's ACR score upon mismatch;

(c) computing a weighted confidence for each accepted knowledge delta as the product of the self-reported confidence score and the device's ACR score at the time of submission;

(d) merging knowledge deltas with weighted confidence meeting or exceeding a threshold value into a knowledge store, and storing knowledge deltas below the threshold with a pending status; and

(e) identifying groups of three or more corroborating knowledge deltas from physically independent edge devices within a configurable time window, and applying a confidence multiplier to the corroborating group to establish Byzantine fault-tolerant knowledge consolidation.

**Claim 9.** The method of Claim 8, wherein the ACR score for each edge device is initialized at a default value of 0.7, is decremented by a first amount upon chain hash mismatch, is decremented by a second amount upon spot-check capability verification failure, is set to zero upon device quarantine, and is reset to the default value upon successful re-registration with administrative approval.

**Claim 10.** The method of Claim 8, wherein the signal types comprise: presence detection, activity classification, topic signal detection, environmental measurement, anomaly detection, and voice summary, and wherein voice summary signals are restricted to edge devices classified at a capability tier of four or higher, and wherein raw audio, video, and image data are never transmitted from edge devices.

**Claim 11.** The method of Claim 8, wherein each knowledge delta's signal payload is serialized as compact JSON with no whitespace and is bounded to a maximum of 1024 bytes, and wherein payloads exceeding the maximum are truncated at the application layer with a truncation flag.

**Claim 12.** The method of Claim 8, wherein the first knowledge delta from each edge device uses a genesis string as the previous chain hash, establishing the root of a per-device tamper-evident append-only hash chain.

**Claim 13.** The method of Claim 8, wherein verifying physical independence of corroborating edge devices comprises confirming that the devices have distinct location metadata in a node registry.

**Claim 14.** A computer-implemented method for secure fleet-wide cryptographic identity establishment and capability-validated task routing for constrained edge devices, the method comprising:

(a) maintaining, on a fleet coordinator node, a master secret that is never transmitted to any edge device;

(b) receiving, from an edge device performing first-boot bootstrap, a capability manifest generated through automated hardware and software introspection;

(c) computing a stable device identifier from hardware attributes of the edge device;

(d) deriving a per-device cryptographic key by applying HKDF-SHA256 to the master secret using the stable device identifier as salt and a fixed context string as info, producing a deterministic 32-byte derived key;

(e) transmitting to the edge device: a scoped data namespace, a JWT signed with the derived key and scoped to the data namespace, and a poll interval calibrated to the device's capability tier;

(f) receiving from the edge device a re-signed capability manifest signed with the derived key;

(g) verifying the manifest signature by independently re-deriving the key on the fleet coordinator and performing the same signature computation;

(h) upon successful signature verification, registering the edge device in a node registry with the verified capability manifest, computed capability tier, and derived key identifier;

(i) receiving periodic heartbeat transmissions from the edge device, each heartbeat comprising device health metrics and a current chain hash reference; and

(j) for each proposed task dispatch, validating the task against the registered capability manifest and tier-specific permission matrix before enqueuing the task for the edge device.

**Claim 15.** The method of Claim 14, further comprising:

(k) upon detecting manifest signature verification failure for a previously registered edge device, setting the device status to quarantined, invalidating the device's JWT, clearing all pending tasks, setting the device's ACR score to zero, and flagging for review any merged knowledge attributed primarily to the quarantined device.

**Claim 16.** The method of Claim 14, further comprising performing spot-check validation of newly registered edge devices by dispatching test tasks that exercise capabilities claimed in the device's manifest and verifying the results before granting full capability routing.

**Claim 17.** The method of Claim 14, wherein key rotation is performed by incrementing a rotation counter in the HKDF info parameter, deriving a new key, adding the old JWT signature to a blocklist, and issuing a new JWT signed with the new key.

**Claim 18.** A computer-implemented system for manifest-validated task dispatch across heterogeneous edge devices, the system comprising:

a fleet coordinator node comprising a processor and memory, the memory storing instructions that, when executed by the processor, cause the fleet coordinator node to:

(a) maintain a node registry storing, for each of a plurality of registered edge devices: a capability manifest generated by the edge device through hardware introspection, a capability tier classification, a per-device cryptographic key identifier, an adaptive credibility rating score, and a device status;

(b) maintain a tier-permission matrix mapping each capability tier to a set of permitted task types, permitted task subtypes, and required hardware capabilities;

(c) receive task dispatch requests specifying a task type, task subtype, and required hardware capabilities;

(d) identify candidate edge devices by querying the node registry for devices with active status, a capability tier permitting the requested task type and subtype, and manifest-declared hardware capabilities matching the required capabilities;

(e) validate the dispatch against the selected candidate device's full capability manifest, including verification of specific sensor, actuator, and inference capabilities; and

(f) enqueue the validated task for the candidate device with a task expiration time, or reroute the task to an alternative candidate upon validation failure;

and a plurality of edge devices, each edge device comprising a processor and memory, the memory storing instructions that cause the edge device to:

(g) execute a bootstrap protocol comprising automated hardware and software introspection to generate a self-describing capability manifest;

(h) transmit the capability manifest to the fleet coordinator for registration;

(i) poll the fleet coordinator's task queue at a tier-calibrated interval for pending tasks; and

(j) execute dispatched tasks within the bounds of the device's declared capabilities and transmit results to the fleet coordinator.

**Claim 19.** The system of Claim 18, wherein each edge device further transmits hash-chained knowledge deltas to the fleet coordinator, each delta comprising a signal payload, a chain hash linking to the previous delta, and a confidence score, and wherein the fleet coordinator weights each delta's contribution by the product of the confidence score and the device's adaptive credibility rating score.

**Claim 20.** The system of Claim 18, wherein the fleet coordinator further comprises a Byzantine consolidation engine that identifies groups of three or more corroborating knowledge deltas from physically independent edge devices within a time window and applies a confidence multiplier to the corroborating group, providing defense against knowledge poisoning by individual compromised devices.

---

## 9. ABSTRACT

A computer-implemented system and method for autonomously bootstrapping heterogeneous constrained edge devices into a centrally coordinated agent fleet with manifest-validated task dispatch and trust-weighted federated knowledge aggregation. Each edge device executes a self-describing bootstrap protocol that performs automated hardware and software introspection -- enumerating computational resources, sensors, actuators, locally installed inference models with measured throughput, and network characteristics -- and assembles the results into a signed capability manifest. A fleet coordinator classifies each device into a hierarchical capability tier based on quantitative thresholds and derives per-device cryptographic keys from a master secret using HKDF-SHA256, enabling deterministic key derivation without pre-provisioned certificates. A manifest-validated task dispatch engine evaluates every proposed task against the target device's registered manifest and tier-specific permission matrix before routing, preventing capability-exceeding assignments. Edge devices contribute federated knowledge through hash-chained deltas weighted by adaptive credibility ratings, and a Byzantine fault-tolerant consolidation engine validates corroborating signals from three or more physically independent nodes, providing defense against knowledge poisoning by compromised devices.

---

## APPENDIX A: AI DISCLOSURE STATEMENT

Pursuant to USPTO guidance on the use of AI-assisted tools in patent preparation (February 2024 Federal Register Notice, 89 FR 10043), the applicant discloses the following:

**AI Tools Used in Preparation:** Portions of this application were drafted with the assistance of Claude (Anthropic), a large language model, used as a writing and analysis tool under the direct supervision and review of the inventor.

**Inventive Contribution:** All inventive concepts disclosed herein -- including the self-describing capability manifest schema, the hierarchical five-tier capability classification system, the HKDF-SHA256 soul key derivation hierarchy for fleet-wide identity, the manifest-validated task dispatch algorithm with tier-permission matrices, the hash-chained knowledge delta aggregation with ACR-weighted trust scoring, and the Byzantine fault-tolerant knowledge consolidation mechanism -- originated from the inventor, Cristian Xavier Ruvalcaba. The AI tool was used for text drafting, formatting, and prior art research assistance. The AI tool did not contribute to the conception of any claimed invention.

**Inventor Verification:** The inventor has reviewed the entirety of this application and confirms that all technical disclosures, claims, and descriptions accurately represent the invented system. The inventor assumes full responsibility for the content of this application.

**Duty of Candor:** This disclosure is made in compliance with 37 C.F.R. 1.56 (duty of disclosure) and the USPTO's evolving guidance on AI-assisted patent preparation. The applicant affirms that the use of AI tools does not affect the inventorship determination, as all inventive contributions are attributable solely to the named inventor.

---

*Respectfully submitted,*

**Saluca LLC**

By: /s/ Cristian Xavier Ruvalcaba
Cristian Xavier Ruvalcaba, Sole Inventor

Date: _______________

Prepared by:
Cristian Xavier Ruvalcaba, Pro Se Applicant
Saluca LLC
Docket No. SALUCA-021
Entity Status: Micro Entity
