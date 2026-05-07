package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"
)

// SanitizeResponse matches JSON from POST /v1/aletheia/sanitize.
type SanitizeResponse struct {
	Verdict         string         `json:"verdict"`
	PatternsMatched []PatternMatch `json:"patterns_matched"`
	ScanDurationMs  float64        `json:"scan_duration_ms"`
	SanitizedOutput *string        `json:"sanitized_output"`
}

// PatternMatch represents a single matched pattern from the sanitizer.
type PatternMatch struct {
	PatternID string `json:"pattern_id"`
	Category  string `json:"category"`
	Severity  string `json:"severity"`
}

// SanitizeRequest is the JSON body for POST /v1/aletheia/sanitize.
type SanitizeRequest struct {
	Tool     string `json:"tool"`
	Command  string `json:"command"`
	Output   string `json:"output"`
	AgentID  string `json:"agent_id"`
	TenantID string `json:"tenant_id"`
	Mode     string `json:"mode"`
}

// sanitizeOutput calls the sanitizer API. Returns nil on error (fail-open).
func sanitizeOutput(identity AgentIdentity, command []string, stdout []byte) (*SanitizeResponse, error) {
	if len(command) == 0 {
		return nil, fmt.Errorf("empty command")
	}

	// Construct URL: strip known ingest/evaluate paths to get base
	baseURL := identity.SoulWatchURL
	for _, suffix := range []string{"/v1/aletheia/tool/ingest", "/v1/aletheia/tool/evaluate", "/ingest"} {
		if strings.HasSuffix(baseURL, suffix) {
			baseURL = strings.TrimSuffix(baseURL, suffix)
			break
		}
	}
	sanitizeURL := strings.TrimRight(baseURL, "/") + "/v1/aletheia/sanitize"

	reqBody := SanitizeRequest{
		Tool:     command[0],
		Command:  strings.Join(command, " "),
		Output:   string(stdout),
		AgentID:  identity.AgentID,
		TenantID: identity.TenantID,
		Mode:     identity.SanitizeMode,
	}

	data, err := json.Marshal(reqBody)
	if err != nil {
		return nil, fmt.Errorf("marshal sanitize request: %w", err)
	}

	// 3-second timeout (larger than policy because output can be up to 1MB)
	client := &http.Client{Timeout: 3 * time.Second}
	req, err := http.NewRequest("POST", sanitizeURL, bytes.NewReader(data))
	if err != nil {
		return nil, fmt.Errorf("create sanitize request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	if identity.Token != "" {
		req.Header.Set("X-Internal-Key", identity.Token)
	}

	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("sanitize request failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, fmt.Errorf("sanitize endpoint returned %d", resp.StatusCode)
	}

	var result SanitizeResponse
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, fmt.Errorf("decode sanitize response: %w", err)
	}

	return &result, nil
}

// extractPatternIDs extracts pattern IDs from sanitizer matches for telemetry.
func extractPatternIDs(matches []PatternMatch) []string {
	ids := make([]string, len(matches))
	for i, m := range matches {
		ids[i] = m.PatternID
	}
	return ids
}
