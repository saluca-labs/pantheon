package main

import (
	"fmt"
	"os"
	"path/filepath"

	"gopkg.in/yaml.v3"
)

type Config struct {
	AgentID      string `yaml:"agent_id"`
	TenantID     string `yaml:"tenant_id"`
	SoulWatchURL string `yaml:"soulwatch_url"`
	Token        string `yaml:"token"`
	Sanitize     string `yaml:"sanitize"`
	OfflineLog   string `yaml:"offline_log"`
}

func defaultConfigPath() string {
	home, err := os.UserHomeDir()
	if err != nil {
		return ""
	}
	return filepath.Join(home, ".tiresias", "agent.yaml")
}

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
