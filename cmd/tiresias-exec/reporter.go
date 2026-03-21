package main

import (
	"bytes"
	"crypto/rand"
	"crypto/sha256"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"sort"
	"strings"
	"time"
)

type TelemetryPayload struct {
	EventType        string            `json:"event_type"`
	Version          string            `json:"version"`
	Timestamp        string            `json:"timestamp"`
	AgentID          string            `json:"agent_id"`
	TenantID         string            `json:"tenant_id"`
	InvocationID     string            `json:"invocation_id"`
	Command          string            `json:"command"`
	Args             []string          `json:"args"`
	FullCommand      string            `json:"full_command"`
	WorkingDirectory string            `json:"working_directory"`
	EnvironmentHash  string            `json:"environment_hash"`
	Execution        ExecutionPayload  `json:"execution"`
	Policy           PolicyPayload     `json:"policy"`
	Sanitizer        SanitizerPayload  `json:"sanitizer"`
}

type ExecutionPayload struct {
	ExitCode    int    `json:"exit_code"`
	DurationMs  int64  `json:"duration_ms"`
	StdoutBytes int64  `json:"stdout_bytes"`
	StderrBytes int64  `json:"stderr_bytes"`
	StdoutHash  string `json:"stdout_hash"`
	StderrHash  string `json:"stderr_hash"`
}

type PolicyPayload struct {
	Evaluated    bool     `json:"evaluated"`
	Verdict      string   `json:"verdict"`
	RulesMatched []string `json:"rules_matched"`
}

type SanitizerPayload struct {
	Mode            string   `json:"mode"`
	Verdict         string   `json:"verdict"`
	PatternsMatched []string `json:"patterns_matched"`
	ScanDurationMs  int64    `json:"scan_duration_ms"`
}

func generateInvocationID() string {
	b := make([]byte, 6)
	rand.Read(b)
	return fmt.Sprintf("inv_%x", b)
}

func computeEnvironmentHash() string {
	envVars := os.Environ()
	keys := make([]string, 0, len(envVars))
	for _, e := range envVars {
		if idx := strings.IndexByte(e, '='); idx > 0 {
			keys = append(keys, e[:idx])
		}
	}
	sort.Strings(keys)
	h := sha256.Sum256([]byte(strings.Join(keys, ",")))
	return fmt.Sprintf("sha256:%x", h)
}

func buildPayload(identity AgentIdentity, command []string, cwd string, result ExecutionResult) TelemetryPayload {
	var args []string
	if len(command) > 1 {
		args = command[1:]
	} else {
		args = []string{}
	}

	return TelemetryPayload{
		EventType:        "tool_invocation",
		Version:          "1.0",
		Timestamp:        time.Now().UTC().Format(time.RFC3339Nano),
		AgentID:          identity.AgentID,
		TenantID:         identity.TenantID,
		InvocationID:     generateInvocationID(),
		Command:          command[0],
		Args:             args,
		FullCommand:      strings.Join(command, " "),
		WorkingDirectory: cwd,
		EnvironmentHash:  computeEnvironmentHash(),
		Execution: ExecutionPayload{
			ExitCode:    result.ExitCode,
			DurationMs:  result.DurationMs,
			StdoutBytes: result.StdoutBytes,
			StderrBytes: result.StderrBytes,
			StdoutHash:  result.StdoutHash,
			StderrHash:  result.StderrHash,
		},
		Policy: PolicyPayload{
			Evaluated:    false,
			Verdict:      "skipped",
			RulesMatched: []string{},
		},
		Sanitizer: SanitizerPayload{
			Mode:            identity.SanitizeMode,
			Verdict:         "skipped",
			PatternsMatched: []string{},
			ScanDurationMs:  0,
		},
	}
}

func reportEvent(soulwatchURL string, token string, payload TelemetryPayload) error {
	data, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("marshal payload: %w", err)
	}

	client := &http.Client{Timeout: 5 * time.Second}
	req, err := http.NewRequest("POST", soulwatchURL, bytes.NewReader(data))
	if err != nil {
		return fmt.Errorf("create request: %w", err)
	}

	req.Header.Set("Content-Type", "application/json")
	if token != "" {
		req.Header.Set("X-Internal-Key", token)
	}

	resp, err := client.Do(req)
	if err != nil {
		return fmt.Errorf("soulwatch request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return fmt.Errorf("soulwatch returned %d", resp.StatusCode)
	}

	return nil
}
