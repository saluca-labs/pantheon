"""
SHA-512 hash chain engine for Aletheia CoT intercept.
Implements tamper-evident chain: genesis entry, append, verify.

Hash computations:
- cot_hash = SHA-512(reasoning_text) or SHA-512("reasoning_tokens::{count}") for OpenAI
- entry_hash = SHA-512("{entry_index}||{request_id}||{timestamp}||{cot_hash}||{prev_hash}")
- genesis prev_hash = SHA-512(tenant_id)
"""

import hashlib
import uuid
from datetime import datetime, timezone

import structlog
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from src.aletheia.extractors import CotExtraction
from src.aletheia.models import AletheiaCoTChain
from src.aletheia.storage import CotContentStorage, is_content_storage_enabled

logger = structlog.get_logger(__name__)

GENESIS_PREFIX = "genesis::"


# ---------------------------------------------------------------------------
# Pure hash functions (no I/O, deterministic, easily testable)
# ---------------------------------------------------------------------------

def compute_cot_hash(reasoning_text: str | None, token_count: int) -> str:
    """Compute SHA-512 hash of CoT content.

    For providers that expose reasoning text: SHA-512(text).
    For OpenAI (text=None): SHA-512("reasoning_tokens::{count}").
    """
    if reasoning_text is not None:
        data = reasoning_text.encode("utf-8")
    else:
        data = f"reasoning_tokens::{token_count}".encode("utf-8")
    return hashlib.sha512(data).hexdigest()


def compute_entry_hash(
    entry_index: int,
    request_id: str,
    timestamp: str,
    cot_hash: str,
    prev_hash: str,
) -> str:
    """Compute SHA-512 hash of a chain entry.

    Format: "{entry_index}||{request_id}||{timestamp}||{cot_hash}||{prev_hash}"
    """
    payload = f"{entry_index}||{request_id}||{timestamp}||{cot_hash}||{prev_hash}"
    return hashlib.sha512(payload.encode("utf-8")).hexdigest()


def compute_genesis_hash(tenant_id: str) -> str:
    """Compute SHA-512 hash of tenant_id for genesis entry prev_hash."""
    return hashlib.sha512(tenant_id.encode("utf-8")).hexdigest()


# ---------------------------------------------------------------------------
# Chain writer (manages appending to a tenant chain)
# ---------------------------------------------------------------------------

class CotChainWriter:
    """Manages appending CoT entries to a tenant's hash chain."""

    def __init__(self, session_factory: async_sessionmaker[AsyncSession], tenant_id: uuid.UUID):
        self.session_factory = session_factory
        self.tenant_id = tenant_id
        self._chain_id: uuid.UUID | None = None

    async def get_or_create_chain(self) -> uuid.UUID:
        """Get existing chain_id for this tenant, or create genesis entry."""
        async with self.session_factory() as session:
            # Check for existing chain
            result = await session.execute(
                select(AletheiaCoTChain.chain_id)
                .where(AletheiaCoTChain.tenant_id == self.tenant_id)
                .order_by(AletheiaCoTChain.entry_index.desc())
                .limit(1)
            )
            row = result.scalar_one_or_none()
            if row is not None:
                self._chain_id = row
                return self._chain_id

            # Create genesis entry
            chain_id = uuid.uuid4()
            now = datetime.now(timezone.utc)
            genesis_cot_hash = hashlib.sha512(b"genesis").hexdigest()
            genesis_prev_hash = compute_genesis_hash(str(self.tenant_id))
            genesis_entry_hash = compute_entry_hash(
                entry_index=0,
                request_id=str(uuid.UUID(int=0)),
                timestamp=now.isoformat(),
                cot_hash=genesis_cot_hash,
                prev_hash=genesis_prev_hash,
            )

            genesis = AletheiaCoTChain(
                tenant_id=self.tenant_id,
                chain_id=chain_id,
                entry_index=0,
                request_id=uuid.UUID(int=0),
                timestamp=now,
                model="system",
                provider="system",
                agent_id=None,
                cot_hash=genesis_cot_hash,
                cot_token_count=0,
                cot_byte_count=0,
                prev_hash=genesis_prev_hash,
                entry_hash=genesis_entry_hash,
                content_stored=False,
                content_ref=None,
            )
            session.add(genesis)
            await session.commit()

            self._chain_id = chain_id
            logger.info(
                "cot_chain.genesis_created",
                tenant_id=str(self.tenant_id),
                chain_id=str(chain_id),
            )
            return self._chain_id

    async def append(
        self,
        extraction: CotExtraction,
        request_id: uuid.UUID,
        agent_id: str | None = None,
    ) -> AletheiaCoTChain:
        """Atomically append a new entry to the chain.

        Uses SELECT ... FOR UPDATE to ensure serialized append.
        """
        if self._chain_id is None:
            await self.get_or_create_chain()

        async with self.session_factory() as session:
            async with session.begin():
                # Lock the latest entry
                result = await session.execute(
                    select(AletheiaCoTChain)
                    .where(
                        AletheiaCoTChain.tenant_id == self.tenant_id,
                        AletheiaCoTChain.chain_id == self._chain_id,
                    )
                    .order_by(AletheiaCoTChain.entry_index.desc())
                    .limit(1)
                    .with_for_update()
                )
                last_entry = result.scalar_one()

                new_index = last_entry.entry_index + 1
                prev_hash = last_entry.entry_hash
                now = datetime.now(timezone.utc)

                cot_hash = compute_cot_hash(
                    extraction.reasoning_text, extraction.token_count,
                )
                entry_hash = compute_entry_hash(
                    entry_index=new_index,
                    request_id=str(request_id),
                    timestamp=now.isoformat(),
                    cot_hash=cot_hash,
                    prev_hash=prev_hash,
                )

                entry = AletheiaCoTChain(
                    tenant_id=self.tenant_id,
                    chain_id=self._chain_id,
                    entry_index=new_index,
                    request_id=request_id,
                    timestamp=now,
                    model=extraction.model,
                    provider=extraction.provider,
                    agent_id=agent_id,
                    cot_hash=cot_hash,
                    cot_token_count=extraction.token_count,
                    cot_byte_count=extraction.byte_count,
                    prev_hash=prev_hash,
                    entry_hash=entry_hash,
                    content_stored=False,
                    content_ref=None,
                )
                session.add(entry)
                # session.begin() context will auto-commit

                # Optionally store encrypted content (ALETH-10)
                if extraction.reasoning_text and await is_content_storage_enabled(session, self.tenant_id):
                    try:
                        storage = CotContentStorage(self.session_factory)
                        stored = await storage.store_content(entry.id, self.tenant_id, extraction.reasoning_text)
                        if stored:
                            logger.debug("cot_chain.content_stored", entry_id=str(entry.id))
                    except Exception:
                        logger.warning("cot_chain.content_store_failed", entry_id=str(entry.id), exc_info=True)

            logger.debug(
                "cot_chain.appended",
                tenant_id=str(self.tenant_id),
                chain_id=str(self._chain_id),
                entry_index=new_index,
            )
            return entry


# ---------------------------------------------------------------------------
# Chain verification
# ---------------------------------------------------------------------------

async def verify_chain_range(
    session: AsyncSession,
    tenant_id: uuid.UUID,
    chain_id: uuid.UUID,
    from_index: int,
    to_index: int,
) -> dict:
    """Verify integrity of a chain range [from_index, to_index].

    Returns:
        {
            "valid": bool,
            "entries_checked": int,
            "first_broken_index": int | None,
            "error": str | None,
        }
    """
    result = await session.execute(
        select(AletheiaCoTChain)
        .where(
            AletheiaCoTChain.tenant_id == tenant_id,
            AletheiaCoTChain.chain_id == chain_id,
            AletheiaCoTChain.entry_index >= from_index,
            AletheiaCoTChain.entry_index <= to_index,
        )
        .order_by(AletheiaCoTChain.entry_index.asc())
    )
    entries = list(result.scalars().all())

    if not entries:
        return {
            "valid": True,
            "entries_checked": 0,
            "first_broken_index": None,
            "error": None,
        }

    for i, entry in enumerate(entries):
        # Recompute entry_hash and verify
        recomputed = compute_entry_hash(
            entry_index=entry.entry_index,
            request_id=str(entry.request_id),
            timestamp=entry.timestamp.isoformat(),
            cot_hash=entry.cot_hash,
            prev_hash=entry.prev_hash,
        )
        if recomputed != entry.entry_hash:
            return {
                "valid": False,
                "entries_checked": i + 1,
                "first_broken_index": entry.entry_index,
                "error": f"entry_hash mismatch at index {entry.entry_index}",
            }

        # Check prev_hash linkage for consecutive entries
        if i > 0:
            prev_entry = entries[i - 1]
            if entry.prev_hash != prev_entry.entry_hash:
                return {
                    "valid": False,
                    "entries_checked": i + 1,
                    "first_broken_index": entry.entry_index,
                    "error": f"prev_hash linkage broken at index {entry.entry_index}",
                }

    return {
        "valid": True,
        "entries_checked": len(entries),
        "first_broken_index": None,
        "error": None,
    }
