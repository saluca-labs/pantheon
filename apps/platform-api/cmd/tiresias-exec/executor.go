package main

import (
	"bytes"
	"crypto/sha512"
	"errors"
	"fmt"
	"io"
	"os"
	"os/exec"
	"syscall"
	"time"
)

// ExecutionResult captures the outcome of a wrapped command execution,
// including exit code, timing, byte counts, raw output, and SHA-512
// content integrity hashes for tamper detection.
type ExecutionResult struct {
	ExitCode    int
	DurationMs  int64
	StdoutBytes int64
	StderrBytes int64
	StdoutHash  string // SHA-512 content integrity hash for tamper detection
	StderrHash  string // SHA-512 content integrity hash for tamper detection
	Stdout      []byte
	Stderr      []byte
}

// executeCommand runs the given command, capturing stdout and stderr while
// streaming through SHA-512 hash writers. Exit codes are translated:
// 127 = command not found, 126 = exec error, 128+N = killed by signal N.
func executeCommand(command []string) ExecutionResult {
	cmd := exec.Command(command[0], command[1:]...)
	cmd.Dir, _ = os.Getwd()
	cmd.Stdin = os.Stdin

	var stdoutBuf, stderrBuf bytes.Buffer
	stdoutHash := sha512.New()
	stderrHash := sha512.New()

	cmd.Stdout = io.MultiWriter(&stdoutBuf, stdoutHash)
	cmd.Stderr = io.MultiWriter(&stderrBuf, stderrHash)

	start := time.Now()
	err := cmd.Run()
	duration := time.Since(start)

	result := ExecutionResult{
		DurationMs:  duration.Milliseconds(),
		StdoutBytes: int64(stdoutBuf.Len()),
		StderrBytes: int64(stderrBuf.Len()),
		StdoutHash:  fmt.Sprintf("sha512:%x", stdoutHash.Sum(nil)),
		StderrHash:  fmt.Sprintf("sha512:%x", stderrHash.Sum(nil)),
		Stdout:      stdoutBuf.Bytes(),
		Stderr:      stderrBuf.Bytes(),
	}

	if err != nil {
		var exitErr *exec.ExitError
		if errors.As(err, &exitErr) {
			result.ExitCode = exitErr.ExitCode()
			// Check for signal-based termination
			if status, ok := exitErr.Sys().(syscall.WaitStatus); ok {
				if status.Signaled() {
					result.ExitCode = 128 + int(status.Signal())
				}
			}
		} else if errors.Is(err, exec.ErrNotFound) {
			fmt.Fprintf(os.Stderr, "tiresias-exec: command not found: %s\n", command[0])
			result.ExitCode = 127
		} else {
			fmt.Fprintf(os.Stderr, "tiresias-exec: exec error: %v\n", err)
			result.ExitCode = 126
		}
	}

	return result
}
