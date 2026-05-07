package main

import (
	"bufio"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
)

const maxOfflineSize = 100 * 1024 * 1024 // 100MB

// writeOffline appends a telemetry payload as a single JSONL line.
func writeOffline(path string, payload TelemetryPayload) {
	if path == "" {
		return
	}

	// Ensure directory exists
	dir := filepath.Dir(path)
	if err := os.MkdirAll(dir, 0700); err != nil {
		fmt.Fprintf(os.Stderr, "tiresias-exec: warning: cannot create offline log dir %s: %v\n", dir, err)
		return
	}

	data, err := json.Marshal(payload)
	if err != nil {
		fmt.Fprintf(os.Stderr, "tiresias-exec: warning: cannot marshal offline payload: %v\n", err)
		return
	}

	// O_APPEND for atomic-ish writes from concurrent invocations
	f, err := os.OpenFile(path, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0600)
	if err != nil {
		fmt.Fprintf(os.Stderr, "tiresias-exec: warning: cannot open offline log %s: %v\n", path, err)
		return
	}
	defer f.Close()

	_, err = f.Write(append(data, 0x0a))
	if err != nil {
		fmt.Fprintf(os.Stderr, "tiresias-exec: warning: write to offline log failed: %v\n", err)
		return
	}

	// Best-effort size check and rotation
	if info, err := f.Stat(); err == nil && info.Size() > maxOfflineSize {
		rotateOfflineLog(path)
	}
}

// rotateOfflineLog drops the oldest 20% of entries when the file exceeds maxOfflineSize.
func rotateOfflineLog(path string) {
	f, err := os.Open(path)
	if err != nil {
		return
	}
	defer f.Close()

	var lines []string
	scanner := bufio.NewScanner(f)
	scanner.Buffer(make([]byte, 1024*1024), 1024*1024) // 1MB line buffer
	for scanner.Scan() {
		lines = append(lines, scanner.Text())
	}

	if len(lines) < 5 {
		return // too few lines to rotate
	}

	// Drop oldest 20%
	cutoff := len(lines) / 5
	remaining := lines[cutoff:]

	tmpPath := path + ".tmp"
	tmp, err := os.OpenFile(tmpPath, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0600)
	if err != nil {
		return
	}

	for _, line := range remaining {
		tmp.WriteString(line + "\n")
	}
	tmp.Close()

	os.Rename(tmpPath, path)
}

// syncOffline attempts to replay buffered offline events to SoulWatch.
// Best-effort, opportunistic: runs during normal invocations, not as a daemon.
func syncOffline(path string, soulwatchURL string, token string) {
	if path == "" || soulwatchURL == "" {
		return
	}

	f, err := os.Open(path)
	if err != nil {
		return // no file or can't read, nothing to sync
	}

	var lines []string
	scanner := bufio.NewScanner(f)
	scanner.Buffer(make([]byte, 1024*1024), 1024*1024)
	for scanner.Scan() {
		lines = append(lines, scanner.Text())
	}
	f.Close()

	if len(lines) == 0 {
		return
	}

	// Attempt to sync up to 100 entries
	limit := 100
	if len(lines) < limit {
		limit = len(lines)
	}

	synced := 0
	for i := 0; i < limit; i++ {
		var payload TelemetryPayload
		if err := json.Unmarshal([]byte(lines[i]), &payload); err != nil {
			synced++ // drop malformed entries
			continue
		}
		if err := reportEvent(soulwatchURL, token, payload); err != nil {
			break // SoulWatch unreachable, stop trying
		}
		synced++
	}

	if synced == 0 {
		return
	}

	// Rewrite file without synced entries
	remaining := lines[synced:]
	if len(remaining) == 0 {
		os.Remove(path)
		return
	}

	tmp, err := os.OpenFile(path+".tmp", os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0600)
	if err != nil {
		return
	}
	for _, line := range remaining {
		tmp.WriteString(line + "\n")
	}
	tmp.Close()
	os.Rename(path+".tmp", path)
}
