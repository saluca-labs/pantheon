"""
Configuration models for SIEM integration destinations.
"""

from typing import Literal, Optional, Union
from pydantic import BaseModel, Field


class SplunkConfig(BaseModel):
    type: Literal["splunk"] = "splunk"
    hec_url: str = Field(...)
    hec_token: str = Field(...)
    index: str = Field(default="main")
    source: str = Field(default="soulwatch")
    sourcetype: str = Field(default="soulwatch:audit")
    verify_ssl: bool = Field(default=True)
    batch_size: int = Field(default=50)


class ElasticConfig(BaseModel):
    type: Literal["elastic"] = "elastic"
    url: str = Field(...)
    index_pattern: str = Field(default="soulwatch-audit-{date}")
    api_key: Optional[str] = Field(default=None)
    username: Optional[str] = Field(default=None)
    password: Optional[str] = Field(default=None)
    verify_ssl: bool = Field(default=True)
    batch_size: int = Field(default=100)


class SyslogConfig(BaseModel):
    type: Literal["syslog"] = "syslog"
    host: str = Field(...)
    port: int = Field(default=514)
    protocol: Literal["tcp", "udp"] = Field(default="tcp")
    facility: int = Field(default=13)  # RFC 5424 facility 13 = "log audit" (security/auth)
    use_cef: bool = Field(default=True)


class WebhookConfig(BaseModel):
    type: Literal["webhook"] = "webhook"
    url: str = Field(...)
    headers: dict[str, str] = Field(default_factory=dict)
    verify_ssl: bool = Field(default=True)
    max_retries: int = Field(default=3)
    retry_base_delay: float = Field(default=1.0)
    batch_size: int = Field(default=50)


class AzureSentinelConfig(BaseModel):
    type: Literal["azure_sentinel"] = "azure_sentinel"
    workspace_id: str = Field(...)
    shared_key: str = Field(...)
    log_type: str = Field(default="SoulWatch_Audit")


SIEMDestinationConfig = Union[
    SplunkConfig, ElasticConfig, SyslogConfig,
    WebhookConfig, AzureSentinelConfig,
]
