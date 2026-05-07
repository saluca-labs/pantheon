"""
MSSP Tenant Provisioner — Kubernetes Compute Isolation.

Generates and applies per-tenant K8s manifests for Enterprise/MSSP customers.
Three isolation modes:
  - dedicated: Single Deployment in shared namespace (Enterprise)
  - namespace: Full namespace with all services (MSSP)

Uses the K8s Python client to create resources programmatically.
Falls back to YAML generation if k8s client is unavailable.
"""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass, field
from typing import Literal

import structlog

logger = structlog.get_logger(__name__)

# Resource defaults per tier
TIER_RESOURCES = {
    "owner": {
        "proxy_replicas": 2,
        "proxy_cpu_request": "250m",
        "proxy_cpu_limit": "1",
        "proxy_mem_request": "512Mi",
        "proxy_mem_limit": "1Gi",
        "include_soulauth": True,
        "include_soulwatch": True,
        "resource_quota_cpu": "8",
        "resource_quota_mem": "16Gi",
    },
    "enterprise": {
        "proxy_replicas": 1,
        "proxy_cpu_request": "200m",
        "proxy_cpu_limit": "500m",
        "proxy_mem_request": "256Mi",
        "proxy_mem_limit": "512Mi",
        "include_soulauth": False,
        "include_soulwatch": False,
        "resource_quota_cpu": "2",
        "resource_quota_mem": "2Gi",
    },
    "mssp": {
        "proxy_replicas": 2,
        "proxy_cpu_request": "250m",
        "proxy_cpu_limit": "1",
        "proxy_mem_request": "512Mi",
        "proxy_mem_limit": "1Gi",
        "include_soulauth": True,
        "include_soulwatch": True,
        "resource_quota_cpu": "8",
        "resource_quota_mem": "16Gi",
    },
}


@dataclass
class TenantManifest:
    """Holds generated K8s manifests for a tenant."""
    tenant_id: str
    tenant_slug: str
    tier: str
    namespace: str
    manifests: list[dict] = field(default_factory=list)

    def to_yaml(self) -> str:
        """Serialize all manifests as multi-document YAML."""
        import yaml
        return "---\n".join(yaml.dump(m, default_flow_style=False) for m in self.manifests)

    def to_json(self) -> str:
        """Serialize all manifests as JSON array."""
        return json.dumps(self.manifests, indent=2, default=str)


def _labels(tenant_id: str, tenant_slug: str, component: str) -> dict:
    """Standard label set for tenant resources."""
    return {
        "app.kubernetes.io/part-of": "tiresias",
        "app.kubernetes.io/managed-by": "mssp-provisioner",
        "mssp.tiresias.io/tenant-id": tenant_id,
        "mssp.tiresias.io/tenant-slug": tenant_slug,
        "app": f"tiresias-proxy-{tenant_slug}",
        "component": component,
    }


def generate_namespace(tenant_id: str, tenant_slug: str) -> dict:
    """Generate Namespace manifest for MSSP tenant."""
    return {
        "apiVersion": "v1",
        "kind": "Namespace",
        "metadata": {
            "name": f"mssp-{tenant_slug}",
            "labels": {
                "app.kubernetes.io/part-of": "tiresias-mssp",
                "mssp.tiresias.io/tenant-id": tenant_id,
                "mssp.tiresias.io/tenant-slug": tenant_slug,
            },
        },
    }


def generate_resource_quota(tenant_id: str, tenant_slug: str, tier: str) -> dict:
    """Generate ResourceQuota for tenant namespace."""
    res = TIER_RESOURCES.get(tier, TIER_RESOURCES["enterprise"])
    ns = f"mssp-{tenant_slug}"
    return {
        "apiVersion": "v1",
        "kind": "ResourceQuota",
        "metadata": {
            "name": f"quota-{tenant_slug}",
            "namespace": ns,
            "labels": _labels(tenant_id, tenant_slug, "quota"),
        },
        "spec": {
            "hard": {
                "requests.cpu": res["resource_quota_cpu"],
                "requests.memory": res["resource_quota_mem"],
                "limits.cpu": str(int(float(res["resource_quota_cpu"]) * 2)),
                "limits.memory": str(int(float(res["resource_quota_mem"].replace("Gi", ""))) * 2) + "Gi",
                "pods": "20",
            },
        },
    }


def generate_network_policy(tenant_id: str, tenant_slug: str) -> dict:
    """Generate default-deny + internal-allow NetworkPolicy for tenant namespace."""
    ns = f"mssp-{tenant_slug}"
    return {
        "apiVersion": "networking.k8s.io/v1",
        "kind": "NetworkPolicy",
        "metadata": {
            "name": f"default-{tenant_slug}",
            "namespace": ns,
            "labels": _labels(tenant_id, tenant_slug, "network-policy"),
        },
        "spec": {
            "podSelector": {},
            "policyTypes": ["Ingress", "Egress"],
            "ingress": [
                {
                    "from": [
                        # Allow from same namespace
                        {"namespaceSelector": {"matchLabels": {"mssp.tiresias.io/tenant-id": tenant_id}}},
                        # Allow GCE health checks
                        {"ipBlock": {"cidr": "130.211.0.0/22"}},
                        {"ipBlock": {"cidr": "35.191.0.0/16"}},
                    ],
                },
            ],
            "egress": [
                # DNS
                {"ports": [{"port": 53, "protocol": "UDP"}, {"port": 53, "protocol": "TCP"}]},
                # Internal services
                {"to": [{"namespaceSelector": {"matchLabels": {"mssp.tiresias.io/tenant-id": tenant_id}}}]},
                # Shared tiresias namespace (for DB, shared services)
                {"to": [{"namespaceSelector": {"matchLabels": {"kubernetes.io/metadata.name": "tiresias"}}}],
                 "ports": [{"port": 5432, "protocol": "TCP"}, {"port": 8000, "protocol": "TCP"}]},
                # External HTTPS (LLM providers)
                {"ports": [{"port": 443, "protocol": "TCP"}]},
            ],
        },
    }


def generate_proxy_deployment(
    tenant_id: str,
    tenant_slug: str,
    tier: str,
    namespace: str,
    image: str = "us-central1-docker.pkg.dev/salucainfrastructure/tiresias/tiresias-proxy:latest",
    database_url_secret: str | None = None,
    kek_provider: str = "local",
) -> list[dict]:
    """Generate Deployment + Service + HPA for a dedicated tenant proxy."""
    res = TIER_RESOURCES.get(tier, TIER_RESOURCES["enterprise"])
    labels = _labels(tenant_id, tenant_slug, "proxy")
    name = f"tiresias-proxy-{tenant_slug}"

    env_vars = [
        {"name": "TIRESIAS_MODE", "value": "dedicated"},
        {"name": "TIRESIAS_TENANT_ID", "value": tenant_id},
        {"name": "TIRESIAS_KEK_PROVIDER", "value": kek_provider},
        {"name": "TIRESIAS_PROVIDERS", "value": "anthropic,openai"},
        {"name": "TIRESIAS_RETENTION_DAYS", "value": "90"},
    ]

    if database_url_secret:
        env_vars.append({
            "name": "TIRESIAS_DATABASE_URL",
            "valueFrom": {"secretKeyRef": {"name": database_url_secret, "key": "database-url"}},
        })

    deployment = {
        "apiVersion": "apps/v1",
        "kind": "Deployment",
        "metadata": {
            "name": name,
            "namespace": namespace,
            "labels": labels,
        },
        "spec": {
            "replicas": res["proxy_replicas"],
            "selector": {"matchLabels": {"app": name}},
            "template": {
                "metadata": {"labels": {**labels, "app": name}},
                "spec": {
                    "serviceAccountName": f"tiresias-{tenant_slug}",
                    "containers": [
                        {
                            "name": "tiresias-proxy",
                            "image": image,
                            "ports": [{"containerPort": 8080}],
                            "env": env_vars,
                            "resources": {
                                "requests": {"cpu": res["proxy_cpu_request"], "memory": res["proxy_mem_request"]},
                                "limits": {"cpu": res["proxy_cpu_limit"], "memory": res["proxy_mem_limit"]},
                            },
                            "livenessProbe": {
                                "httpGet": {"path": "/health", "port": 8080},
                                "initialDelaySeconds": 10,
                                "periodSeconds": 15,
                            },
                            "readinessProbe": {
                                "httpGet": {"path": "/health", "port": 8080},
                                "initialDelaySeconds": 5,
                                "periodSeconds": 10,
                            },
                            "securityContext": {
                                "readOnlyRootFilesystem": True,
                                "runAsNonRoot": True,
                                "runAsUser": 1000,
                                "allowPrivilegeEscalation": False,
                                "capabilities": {"drop": ["ALL"]},
                            },
                            "volumeMounts": [{"name": "tmp", "mountPath": "/tmp"}],
                        },
                    ],
                    "volumes": [{"name": "tmp", "emptyDir": {"sizeLimit": "100Mi"}}],
                },
            },
        },
    }

    service = {
        "apiVersion": "v1",
        "kind": "Service",
        "metadata": {
            "name": name,
            "namespace": namespace,
            "labels": labels,
        },
        "spec": {
            "type": "ClusterIP",
            "selector": {"app": name},
            "ports": [{"port": 80, "targetPort": 8080}],
        },
    }

    service_account = {
        "apiVersion": "v1",
        "kind": "ServiceAccount",
        "metadata": {
            "name": f"tiresias-{tenant_slug}",
            "namespace": namespace,
            "labels": labels,
        },
    }

    hpa = {
        "apiVersion": "autoscaling/v2",
        "kind": "HorizontalPodAutoscaler",
        "metadata": {
            "name": f"{name}-hpa",
            "namespace": namespace,
            "labels": labels,
        },
        "spec": {
            "scaleTargetRef": {
                "apiVersion": "apps/v1",
                "kind": "Deployment",
                "name": name,
            },
            "minReplicas": res["proxy_replicas"],
            "maxReplicas": res["proxy_replicas"] * 5,
            "metrics": [
                {
                    "type": "Resource",
                    "resource": {"name": "cpu", "target": {"type": "Utilization", "averageUtilization": 70}},
                },
            ],
        },
    }

    return [service_account, deployment, service, hpa]


def generate_ingress_rule(tenant_slug: str, namespace: str, base_domain: str = "proxy.tiresias.network") -> dict:
    """Generate an Ingress rule for a tenant subdomain."""
    host = f"{tenant_slug}.{base_domain}"
    name = f"tiresias-proxy-{tenant_slug}"

    return {
        "apiVersion": "networking.k8s.io/v1",
        "kind": "Ingress",
        "metadata": {
            "name": f"ingress-{tenant_slug}",
            "namespace": namespace,
            "annotations": {
                "kubernetes.io/ingress.class": "gce",
                "networking.gke.io/managed-certificates": f"cert-{tenant_slug}",
            },
        },
        "spec": {
            "rules": [
                {
                    "host": host,
                    "http": {
                        "paths": [
                            {
                                "path": "/*",
                                "pathType": "ImplementationSpecific",
                                "backend": {
                                    "service": {"name": name, "port": {"number": 80}},
                                },
                            },
                        ],
                    },
                },
            ],
        },
    }


def generate_managed_certificate(tenant_slug: str, namespace: str, base_domain: str = "proxy.tiresias.network") -> dict:
    """Generate GKE ManagedCertificate for tenant subdomain."""
    return {
        "apiVersion": "networking.gke.io/v1",
        "kind": "ManagedCertificate",
        "metadata": {
            "name": f"cert-{tenant_slug}",
            "namespace": namespace,
        },
        "spec": {
            "domains": [f"{tenant_slug}.{base_domain}"],
        },
    }


def provision_tenant_manifests(
    tenant_id: str,
    tenant_slug: str,
    tier: str,
    image: str = "us-central1-docker.pkg.dev/salucainfrastructure/tiresias/tiresias-proxy:latest",
    database_url_secret: str | None = None,
    kek_provider: str = "local",
    base_domain: str = "proxy.tiresias.network",
) -> TenantManifest:
    """Generate all K8s manifests for a tenant based on tier.

    Enterprise: Dedicated proxy Deployment in shared 'tiresias' namespace.
    MSSP: Full namespace with proxy, network policy, resource quota, ingress.
    """
    if tier == "mssp":
        namespace = f"mssp-{tenant_slug}"
        manifests = [
            generate_namespace(tenant_id, tenant_slug),
            generate_resource_quota(tenant_id, tenant_slug, tier),
            generate_network_policy(tenant_id, tenant_slug),
        ]
        manifests.extend(
            generate_proxy_deployment(
                tenant_id, tenant_slug, tier, namespace, image, database_url_secret, kek_provider,
            )
        )
        manifests.append(generate_ingress_rule(tenant_slug, namespace, base_domain))
        manifests.append(generate_managed_certificate(tenant_slug, namespace, base_domain))
    else:
        # Enterprise: dedicated pod in shared namespace
        namespace = "tiresias"
        manifests = list(
            generate_proxy_deployment(
                tenant_id, tenant_slug, tier, namespace, image, database_url_secret, kek_provider,
            )
        )

    result = TenantManifest(
        tenant_id=tenant_id,
        tenant_slug=tenant_slug,
        tier=tier,
        namespace=namespace,
        manifests=manifests,
    )

    logger.info(
        "mssp.manifests_generated",
        tenant_id=tenant_id,
        tenant_slug=tenant_slug,
        tier=tier,
        namespace=namespace,
        manifest_count=len(manifests),
    )

    return result


async def apply_tenant_manifests(manifest: TenantManifest) -> dict:
    """Apply generated manifests to the K8s cluster.

    Uses the kubernetes Python client if available, otherwise returns
    the manifests for manual application via kubectl.
    """
    try:
        from kubernetes import client, config
        config.load_incluster_config()
    except Exception:
        try:
            from kubernetes import client, config
            config.load_kube_config()
        except Exception:
            logger.warning("K8s client unavailable — returning manifests for manual apply")
            return {
                "status": "manifests_generated",
                "namespace": manifest.namespace,
                "manifest_count": len(manifest.manifests),
                "apply_command": f"echo '<manifests>' | kubectl apply -f -",
            }

    api = client.ApiClient()
    from kubernetes.utils import create_from_dict

    applied = []
    errors = []

    for m in manifest.manifests:
        try:
            create_from_dict(api, m, namespace=manifest.namespace)
            applied.append(f"{m['kind']}/{m['metadata']['name']}")
        except Exception as e:
            if "AlreadyExists" in str(e):
                applied.append(f"{m['kind']}/{m['metadata']['name']} (exists)")
            else:
                errors.append(f"{m['kind']}/{m['metadata']['name']}: {e}")

    return {
        "status": "applied" if not errors else "partial",
        "namespace": manifest.namespace,
        "applied": applied,
        "errors": errors,
    }
