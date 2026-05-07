package main

import (
	"fmt"
	"os"
	"path/filepath"

	"gopkg.in/yaml.v3"
)

// Config holds agent configuration loaded from the YAML config file
// (default: ~/.tiresias/agent.yaml). All fields are optional; unset fields
// are resolved from environment variables or CLI flags via the identity layer.
type Config struct {
	AgentID      string `yaml:"agent_id"`      // Unique identifier for this agent instance
	TenantID     string `yaml:"tenant_id"`     // Tenant scope for multi-tenant policy evaluation
	SoulWatchURL string `yaml:"soulwatch_url"` // Base URL for the Tiresias ingest API
	Token        string `yaml:"token"`         // Bearer token (JWT or static key) for API auth
	Sanitize     string `yaml:"sanitize"`      // Output sanitizer mode: passthrough|warn|block
	OfflineLog   string `yaml:"offline_log"`   // Path for offline telemetry spooling
}

// defaultConfigPath returns ~/.tiresias/agent.yaml, or empty string if
// the home directory cannot be determined.
func defaultConfigPath() string {
	home, err := os.UserHomeDir()
	if err != nil {
		return ""
	}
	return filepath.Join(home, ".tiresias", "agent.yaml")
}

// loadConfig reads and parses the YAML config file at the given path.
// If path is empty, it falls back to defaultConfigPath. Returns an empty
// Config on missing or malformed file (fail-open: never blocks execution).
func loadConfig(path string) Config {
	if path == "" {
		path = defaultConfigPath()
	}
	if path == "" {
		return Config{}
	}

	data, err := os.ReadFile(path)
	if err != nil {
		// File not found is fine -- return empty config
		if !os.IsNotExist(err) {
			fmt.Fprintf(os.Stderr, "tiresias-exec: warning: could not read config %s: %v\n", path, err)
		}
		return Config{}
	}

	var cfg Config
	if err := yaml.Unmarshal(data, &cfg); err != nil {
		fmt.Fprintf(os.Stderr, "tiresias-exec: warning: malformed config %s: %v\n", path, err)
		return Config{}
	}

	return cfg
}
