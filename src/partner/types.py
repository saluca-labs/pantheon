from enum import Enum


class PartnerType(str, Enum):
    RESELLER = "reseller"
    MSSP = "mssp"


PARTNER_CAPABILITIES: dict[str, set[PartnerType]] = {
    "tenant_create":      {PartnerType.MSSP},
    "tenant_manage":      {PartnerType.MSSP},
    "tenant_delete":      {PartnerType.MSSP},
    "whitelabel_config":  {PartnerType.MSSP},
    "referral_track":     {PartnerType.RESELLER, PartnerType.MSSP},
    "commission_view":    {PartnerType.RESELLER, PartnerType.MSSP},
    "commission_withdraw": {PartnerType.RESELLER, PartnerType.MSSP},
    "promo_create":       {PartnerType.RESELLER, PartnerType.MSSP},
    "promo_manage":       {PartnerType.RESELLER, PartnerType.MSSP},
    "connect_setup":      {PartnerType.RESELLER, PartnerType.MSSP},
    "dashboard_view":     {PartnerType.RESELLER, PartnerType.MSSP},
    "billing_view":       {PartnerType.RESELLER, PartnerType.MSSP},
    "settings_edit":      {PartnerType.RESELLER, PartnerType.MSSP},
}

PARTNER_TIER_MAP: dict[PartnerType, str] = {
    PartnerType.RESELLER: "pro",
    PartnerType.MSSP: "mssp",
}

PARTNER_REQUIRES_CONNECT: dict[PartnerType, bool] = {
    PartnerType.RESELLER: False,
    PartnerType.MSSP: True,
}


def has_capability(partner_type: PartnerType, capability: str) -> bool:
    allowed = PARTNER_CAPABILITIES.get(capability)
    if allowed is None:
        return False
    return partner_type in allowed
