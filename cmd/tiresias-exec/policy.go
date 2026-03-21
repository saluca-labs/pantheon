package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"
)

// PolicyEvalRequest matches the JSON body for POST /v1/aletheia/tool/evaluate.
type PolicyEvalRequest struct {
	AgentID  string   `json:"agent_id"`
	TenantID string   `json:"tenant_id"`
	Command  string   `json:"command"`
	Args     []string `json:"args"`
}

// PolicyEvalResponse matches the JSON from POST /v1/aletheia/tool/evaluate.
type PolicyEvalResponse struct {
	Verdict         string `json:"verdict"`
	RuleMatched     string `json:"rule_matched"`
	Reason          string `json:"reason"`
	OverrideApplied bool   `json:"override_applied"`
	RateLimited     bool   `json:"rate_limited"`
	Logged          bool   `json:"logged"`
}

// evaluatePolicy calls the Action Gate API. Returns allow on any error (fail-open).
func evaluatePolicy(identity AgentIdentity, command []string) (PolicyEvalResponse, error) {
	failOpen := PolicyEvalResponse{
		Verdict: "allow",
		Reason:  "policy evaluation unavailable",
	}

	if len(command) == 0 {
		return failOpen, fmt.Errorf("empty command")
	}

	// Build request
	var args []string
	if len(command) > 1 {
		args = command[1:]
	} else {
		args = []string{}
	}

	reqBody := PolicyEvalRequest{
		AgentID:  identity.AgentID,
		TenantID: identity.TenantID,
		Command:  command[0],
		Args:     args,
	}

	data, err := json.Marshal(reqBody)
	if err != nil {
		return failOpen, fmt.Errorf("marshal policy request: %w", err)
	}

	// Construct URL: strip known ingest paths to get base, then append evaluate path
	baseURL := identity.SoulWatchURL
	for _, suffix := range []string{"/v1/aletheia/tool/ingest", "/ingest"} {
		if strings.HasSuffix(baseURL, suffix) {
			baseURL = strings.TrimSuffix(baseURL, suffix)
			break
		}
	}
	evaluateURL := strings.TrimRight(baseURL, "/") + "/v1/aletheia/tool/evaluate"

	client := &http.Client{Timeout: 2 * time.Second}
	req, err := http.NewRequest("POST", evaluateURL, bytes.NewReader(data))
	if err != nil {
		return failOpen, fmt.Errorf("create policy request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	if identity.Token != "" {
		req.Header.Set("X-Internal-Key", identity.Token)
	}

	resp, err := client.Do(req)
	if err != nil {
		return failOpen, fmt.Errorf("policy request failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return failOpen, fmt.Errorf("policy endpoint returned %d", resp.StatusCode)
	}

	var result PolicyEvalResponse
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return failOpen, fmt.Errorf("decode policy response: %w", err)
	}

	return result, nil
}
