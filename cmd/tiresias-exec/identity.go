package main

import (
	"encoding/base64"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

type AgentIdentity struct {
	AgentID      string
	TenantID     string
	SoulWatchURL string
	Token        string
	SanitizeMode string
	OfflineLogPath string
}

func resolveIdentity(flags cliFlags) AgentIdentity {
	cfg := loadConfig(flags.configPath)

	id := AgentIdentity{
		SanitizeMode: "passthrough",
	}

	// Layer 4: JWT token claims (lowest priority)
	token := os.Getenv("TIRESIAS_TOKEN")
	if token != "" {
		id.Token = token
		if claims := extractJWTClaims(token); claims != nil {
			if sub, ok := claims["sub"].(string); ok {
				id.AgentID = sub
			}
			if tid, ok := claims["tenant_id"].(string); ok {
				id.TenantID = tid
			}
		}
	}

	// Layer 3: Config file
	if cfg.AgentID != "" {
		id.AgentID = cfg.AgentID
	}
	if cfg.TenantID != "" {
		id.TenantID = cfg.TenantID
	}
	if cfg.SoulWatchURL != "" {
		id.SoulWatchURL = cfg.SoulWatchURL
	}
	if cfg.Token != "" {
		id.Token = cfg.Token
	}
	if cfg.Sanitize != "" {
		id.SanitizeMode = cfg.Sanitize
	}
	if cfg.OfflineLog != "" {
		id.OfflineLogPath = cfg.OfflineLog
	}

	// Layer 2: Environment variables
	if env := os.Getenv("TIRESIAS_AGENT_ID"); env != "" {
		id.AgentID = env
	}
	if env := os.Getenv("TIRESIAS_TENANT_ID"); env != "" {
		id.TenantID = env
	}
	if env := os.Getenv("TIRESIAS_SOULWATCH_URL"); env != "" {
		id.SoulWatchURL = env
	}

	// Layer 1: CLI flags (highest priority)
	if flags.agentID != "" {
		id.AgentID = flags.agentID
	}
	if flags.tenantID != "" {
		id.TenantID = flags.tenantID
	}
	if flags.soulwatchURL != "" {
		id.SoulWatchURL = flags.soulwatchURL
	}
	if flags.sanitize != "" {
		id.SanitizeMode = flags.sanitize
	}

	// Default offline log path
	if id.OfflineLogPath == "" {
		home, err := os.UserHomeDir()
		if err == nil {
			id.OfflineLogPath = filepath.Join(home, ".tiresias", "offline.jsonl")
		} else {
			id.OfflineLogPath = "/tmp/tiresias-offline.jsonl"
		}
	}

	// Warn if identity is missing
	if id.AgentID == "" {
		fmt.Fprintf(os.Stderr, "tiresias-exec: warning: agent_id not resolved (set --agent-id, TIRESIAS_AGENT_ID, or ~/.tiresias/agent.yaml)\n")
	}
	if id.TenantID == "" {
		fmt.Fprintf(os.Stderr, "tiresias-exec: warning: tenant_id not resolved (set --tenant-id, TIRESIAS_TENANT_ID, or ~/.tiresias/agent.yaml)\n")
	}

	return id
}

// extractJWTClaims decodes the payload segment of a JWT without signature validation.
// Signature validation is SoulWatch's responsibility.
func extractJWTClaims(token string) map[string]interface{} {
	parts := strings.Split(token, ".")
	if len(parts) != 3 {
		return nil
	}

	// Base64url decode the payload (second segment)
	payload := parts[1]
	// Add padding if needed
	switch len(payload) % 4 {
	case 2:
		payload += "=="
	case 3:
		payload += "="
	}

	decoded, err := base64.URLEncoding.DecodeString(payload)
	if err != nil {
		return nil
	}

	var claims map[string]interface{}
	if err := json.Unmarshal(decoded, &claims); err != nil {
		return nil
	}

	return claims
}
