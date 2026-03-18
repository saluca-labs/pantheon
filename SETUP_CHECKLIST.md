# SoulAuth Development Environment Setup Checklist

## Prerequisites Overview

This checklist ensures all dependencies and configurations are in place before starting implementation.

## System Requirements

### Development Environment
- [ ] **Operating System**: Ubuntu 22.04+ or macOS 13.0+
- [ ] **Memory**: 8GB+ RAM recommended
- [ ] **Storage**: 50GB+ free space
- [ ] **CPU**: 4+ cores recommended

### Development Tools
- [ ] **Python 3.11+** with pip
- [ ] **Node.js 18+** (for potential frontend components)
- [ ] **Docker & Docker Compose** (for containerization)
- [ ] **Git** (for version control)
- [ ] **VS Code** with Python extensions
- [ ] **PostgreSQL client** (psql)

### Infrastructure Requirements
- [ ] **Supabase account** with project created
- [ ] **Git repository** for policy-as-code
- [ ] **Email service** API key (SendGrid/Mailgun)
- [ ] **DNS configuration** for trial system
- [ ] **Monitoring infrastructure** (Prometheus/Grafana)

## Project Structure Setup

### Directory Structure
```
soulAuth/
├── ARCHITECTURE.md          # System architecture design ✓
├── DECISION_REQUESTS.md     # Critical decisions requiring approval ✓
├── IMPLEMENTATION_ROADMAP.md # Implementation timeline ✓
├── SETUP_CHECKLIST.md       # This checklist ✓
├── SPEC.md                 # Original specification ✓
├── gsd_workflow.md         # Development workflow ✓
├── requirements.txt        # Python dependencies
├── src/                    # Source code
│   ├── __init__.py
│   ├── main.py            # FastAPI application
│   ├── auth/              # Authentication module
│   ├── database/          # Database models
│   ├── policy/            # Policy evaluation
│   ├── tokens/            # Token management
│   ├── audit/             # Audit logging
│   └── admin/             # Admin API
├── tests/                 # Test files
│   ├── __init__.py
│   ├── test_auth/
│   ├── test_database/
│   ├── test_policy/
│   └── test_tokens/
├── config/                # Configuration files
│   ├── settings.py
│   ├── development.yaml
│   └── production.yaml
├── database/              # Database migrations
│   ├── migrations.sql
│   └── schema.sql
├── schemas/               JSON Schemas
│   ├── policy-schema.json
│   └── audit-schema.json
└── docs/                 # Documentation
    ├── api/
    └── operations/
```

### Required Files
- [ ] `requirements.txt` updated with dependencies
- [ ] `docker-compose.yml` for local development
- [ ] `.env.example` for environment configuration
- [ ] `.gitignore` for version control

## Database Setup

### Supabase Configuration
- [ ] Supabase project created
- [ ] Database connection string available
- [ ] Service account credentials obtained
- [ ] Database role permissions configured
- [ ] Connection pooling configured

### Schema Implementation
- [ ] `_soulkeys` table created with indexes
- [ ] `_soulauth_policy_cache` table created
- [ ] `_soulauth_audit` table created with partitioning
- [ ] `_soulauth_delegations` table created
- [ ] `_soulauth_trials` table created

### Test Data Setup
- [ ] Sample tenant records inserted
- [ ] Sample soulkeys created for testing
- [ ] Sample policy records loaded
- [ ] Test audit data configured
- [ ] Performance test data prepared

## Development Environment Setup

### Python Environment
- [ ] Virtual environment created (`python -m venv venv`)
- [ ] Virtual environment activated
- [ ] Requirements installed (`pip install -r requirements.txt`)
- [ ] Development dependencies installed (pytest, black, mypy)
- [ ] Linters configured (flake8, black)
- [ ] Type checking configured (mypy)

### Git Configuration
- [ ] Repository initialized
- [ Remote origin configured
- [ ] Initial commit created
- [ ] Branch structure configured
- [ ] Git hooks installed
- [ ] `.gitignore` configured

### IDE Setup
- [ ] VS Code workspace configured
- [ ] Python extensions installed
- [ ] Docker extensions installed
- [ ] Git extensions installed
- [ ] Debugging configuration added
- [ ] Code formatting tools configured

## Testing Environment

### Test Infrastructure
- [ ] Test database container running
- [ ] Test data loaded
- [ ] Mock services configured
- [ ] Test fixtures created
- [ ] Integration test environment ready

### Testing Tools
- [ ] pytest configured
- [ ] Coverage setup
- [ ] Mock libraries installed
- [ ] Performance testing tools
- [ ] Security testing tools

## Policy Repository Setup

### Git Repository Structure
- [ ] Policy repository initialized
- [ ] Basic tenant structure created
- [ ] Sample policies loaded
- [ ] Git hooks for policy validation
- [ ] CI/CD configuration
- [ ] Webhook endpoints configured

### Policy Validation
- [ ] JSON Schema validation configured
- [ ] Policy linting tools installed
- [ ] Security scanning configured
- [ ] Version control workflow defined

## Monitoring Setup

### Local Development Monitoring
- [ ] Local monitoring stack (Prometheus/Grafana)
- [ ] Logging configuration
- [ ] Performance profiling tools
- [ ] Error tracking configured

### Production Monitoring (if applicable)
- [ ] Production monitoring stack configured
- [ ] Alerting rules defined
- [ ] Dashboard created
- [ ] Logging aggregation configured

## Security Setup

### Security Configuration
- [ ] Secrets management configured
- [ ] SSL/TLS certificates obtained
- [ ] Firewall rules configured
- [ ] Access control policies defined

### Security Testing
- [ ] Security scanning tools installed
- [ ] Penetration testing tools
- [ ] Vulnerability management tools
- [ ] Incident response procedures defined

## Integration Points

### External Service Integration
- [ ] Email service integration tested
- [ ] DNS validation configured
- [ ] Payment service integration (if applicable)
- [ ] CRM system integration tested

### Internal Service Integration
- [ ] Existing `sk_soul_*` system compatibility verified
- [ ] Asphodel memory access configured
- [ ] Tailscale mesh integration tested
- [ ] Vault integration configured

## Documentation

### Documentation Setup
- [ ] API documentation framework
- [ ] Architecture diagrams created
- [ ] Operational procedures documented
- [ ] Troubleshooting guide created
- [ ] Training materials prepared

### Documentation Tools
- [ ] Sphinx or MkDocs configured
- [ ] API documentation tools installed
- [ ] Diagram tools configured
- [ ] Version-controlled documentation

## Team Setup

### Development Environment
- [ ] All team members have access to repositories
- [ ] Team development environment standardization
- [ ] Onboarding checklist created
- [ ] Team training materials prepared

### Collaboration Tools
- [ ] Code review workflow defined
- [ ] Issue tracking system configured
- [ ] Knowledge base created
- [ ] Communication channels established

## Checklist Verification

### Pre-Implementation Verification
- [ ] All prerequisites installed and tested
- [ ] Project structure validated
- [ ] Database schema verified
- [ ] Configuration files validated
- [ ] Testing environment ready

### Readiness Confirmation
- [ ] All critical dependencies available
- [ ] Team members trained on setup
- [ ] Integration points tested
- [ ] Security measures in place
- [ ] Backup procedures defined

## Troubleshooting

### Common Issues
- [ ] Database connection problems
- [ ] Dependency conflicts
- [ ] Environment variable configuration
- [ ] Docker container issues
- [ ] Git repository problems

### Support Resources
- [ ] Documentation location
- [ ] Team contacts
- [ ] External support contacts
- [ ] Escalation procedures

## Next Steps

1. **Phase 1 Complete**: Planning documents created ✓
2. **Environment Setup**: Complete this checklist
3. **Implementation Phase**: Begin Day 1 implementation tasks
4. **Validation Phase**: Test implementation against requirements
5. **Production Deployment**: Move to production environment

## Success Criteria

The environment setup is complete when:
- [ ] All checkmarked items are verified
- [ ] Development team can reproduce setup on new machines
- [ ] All integration points function correctly
- [ ] Security requirements are met
- [ ] Monitoring and observability are functional
## Production Secrets Checklist

### Required Before Email Functionality Works

> **WARNING**: The `resend-api-key` in `k8s/secrets.yaml` is currently set to a placeholder
> value (`NEEDS_TO_BE_SET`). Email verification (trial onboarding, password reset) will
> fail silently until this is replaced.

- [ ] **Resend API key**: Obtain from https://resend.com → API Keys. Replace the
  `resend-api-key` value in `k8s/secrets.yaml` with `echo -n 're_xxxx' | base64`\n  then re-apply: `kubectl apply -f k8s/secrets.yaml -n tiresias`\n- [ ] **Stripe keys**: Verify `stripe-secret-key` and `stripe-webhook-secret` are live\n  values (not test keys) before enabling billing.\n- [ ] **License**: After running `tiresias keygen`, set `SOULAUTH_LICENSE_REQUIRED=true`\n  in `k8s/soulauth-deployment.yaml` and re-deploy.\n
