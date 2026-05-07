"""
Configuration models for SIEM integration destinations.
Each forwarder type has its own Pydantic config model.
"""

from typing import Literal, Optional, Union
from pydantic import BaseModel, Field


class SplunkConfig(BaseModel):
    """Splunk HTTP Event Collector configuration."""
    type: Literal["splunk"] = "splunk"
    hec_url: str = Field(..., description="Splunk HEC endpoint URL, e.g. https://splunk:8088/services/collector")
    hec_token: str = Field(..., description="HEC authentication token")
    index: str = Field(default="main", description="Target Splunk index")
    source: str = Field(default="soulauth", description="Event source identifier")
    sourcetype: str = Field(default="soulauth:audit", description="Splunk sourcetype")
    verify_ssl: bool = Field(default=True, description="Verify TLS certificates")
    batch_size: int = Field(default=50, description="Max events per batch POST")


class ElasticConfig(BaseModel):
    """Elasticsearch / OpenSearch configuration."""
    type: Literal["elastic"] = "elastic"
    url: str = Field(..., description="Elasticsearch base URL, e.g. https://es:9200")
    index_pattern: str = Field(
        default="soulauth-audit-{date}",
        description="Index name pattern. {date} is replaced with YYYY.MM.DD",
    )
    api_key: Optional[str] = Field(default=None, description="Elasticsearch API key (base64)")
    username: Optional[str] = Field(default=None, description="Basic auth username")
    password: Optional[str] = Field(default=None, description="Basic auth password")
    verify_ssl: bool = Field(default=True, description="Verify TLS certificates")
    batch_size: int = Field(default=100, description="Max events per bulk request")


class SyslogConfig(BaseModel):
    """RFC 5424 syslog configuration."""
    type: Literal["syslog"] = "syslog"
    host: str = Field(..., description="Syslog server hostname or IP")
    port: int = Field(default=514, description="Syslog server port")
    protocol: Literal["tcp", "udp"] = Field(default="tcp", description="Transport protocol")
    facility: int = Field(default=13, description="Syslog facility (13 = log audit)")
    use_cef: bool = Field(default=True, description="Format messages as CEF")


class WebhookConfig(BaseModel):
    """Generic webhook configuration."""
    type: Literal["webhook"] = "webhook"
    url: str = Field(..., description="Webhook POST URL")
    headers: dict[str, str] = Field(default_factory=dict, description="Custom headers (e.g. auth tokens)")
    verify_ssl: bool = Field(default=True, description="Verify TLS certificates")
    max_retries: int = Field(default=3, description="Max retry attempts on failure")
    retry_base_delay: float = Field(default=1.0, description="Base delay in seconds for exponential backoff")
    batch_size: int = Field(default=50, description="Max events per batch POST")


class AzureSentinelConfig(BaseModel):
    """Azure Sentinel / Log Analytics configuration."""
    type: Literal["azure_sentinel"] = "azure_sentinel"
    workspace_id: str = Field(..., description="Log Analytics workspace ID")
    shared_key: str = Field(..., description="Primary or secondary shared key")
    log_type: str = Field(default="SoulAuth_Audit", description="Custom log type name")


# Union type for destination config discrimination
SIEMDestinationConfig = Union[
    SplunkConfig,
    ElasticConfig,
    SyslogConfig,
    WebhookConfig,
    AzureSentinelConfig,
]
