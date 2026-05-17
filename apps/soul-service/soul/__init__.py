"""
soul — AI Memory Management Package

Apache 2.0 Licensed. Open source.

Implements the Soul dual-integrity hash memory architecture.

Modules:
    tkhr        TKHR-Index: topic-keyed hash routing (O(1) topic lookup)
    storage     Dual-path storage: hot cache + Supabase cold tier
    hashing     Dual-integrity hash mapping (content hash + structure hash)
    compression Recursive compression engine → Soul synthesis
    prefetch    Pre-fetch state-loading protocol (cold-start injection)
    graph       Hash-graph v2 node types (FULL / CAN / PGN density spectrum)
"""

from .storage import write_memory, read_memory, evict_to_cold
from .hashing import content_hash, structure_hash, compute_dual_hash, verify_integrity
from .compression import compress_memory, should_compress, recursive_compress
from .prefetch import build_soul_payload, inject_soul, cold_start_init
from .graph import NodeType, create_node, downgrade_node, get_node_type

__all__ = [
    # storage
    'write_memory',
    'read_memory',
    'evict_to_cold',
    # hashing
    'content_hash',
    'structure_hash',
    'compute_dual_hash',
    'verify_integrity',
    # compression
    'compress_memory',
    'should_compress',
    'recursive_compress',
    # prefetch
    'build_soul_payload',
    'inject_soul',
    'cold_start_init',
    # graph
    'NodeType',
    'create_node',
    'downgrade_node',
    'get_node_type',
]
