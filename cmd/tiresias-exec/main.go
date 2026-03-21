package main

import (
	"fmt"
	"os"
	"strings"
	"sync"
	"time"
)

var Version = "0.1.0"

func main() {
	flags, command := parseArgs(os.Args[1:])

	if flags.showVersion {
		fmt.Fprintf(os.Stderr, "tiresias-exec %s\n", Version)
		os.Exit(0)
	}

	if len(command) == 0 {
		printUsage()
		os.Exit(1)
	}

	identity := resolveIdentity(flags)

	result := executeCommand(command)

	// Write subprocess output to stdout/stderr immediately
	os.Stdout.Write(result.Stdout)
	os.Stderr.Write(result.Stderr)

	// Build telemetry payload
	cwd, _ := os.Getwd()
	payload := buildPayload(identity, command, cwd, result)

	// Report async with grace period
	var wg sync.WaitGroup
	wg.Add(1)
	go func() {
		defer wg.Done()
		if flags.forceOffline || identity.SoulWatchURL == "" {
			writeOffline(identity.OfflineLogPath, payload)
			return
		}
		err := reportEvent(identity.SoulWatchURL, identity.Token, payload)
		if err != nil {
			writeOffline(identity.OfflineLogPath, payload)
		}
	}()

	// Opportunistic offline sync (non-blocking, piggybacks on invocation)
	if !flags.forceOffline && identity.SoulWatchURL != "" {
		wg.Add(1)
		go func() {
			defer wg.Done()
			syncOffline(identity.OfflineLogPath, identity.SoulWatchURL, identity.Token)
		}()
	}

	// Grace period: wait up to 2 seconds for reporting
	done := make(chan struct{})
	go func() {
		wg.Wait()
		close(done)
	}()
	select {
	case <-done:
	case <-time.After(2 * time.Second):
	}

	os.Exit(result.ExitCode)
}

type cliFlags struct {
	agentID       string
	tenantID      string
	soulwatchURL  string
	sanitize      string
	configPath    string
	forceOffline  bool
	dryRun        bool
	showVersion   bool
}

func parseArgs(args []string) (cliFlags, []string) {
	var flags cliFlags
	var command []string

	i := 0
	for i < len(args) {
		arg := args[i]

		// Everything after "--" is the command
		if arg == "--" {
			command = args[i+1:]
			break
		}

		// Non-flag argument: treat as start of command
		if !strings.HasPrefix(arg, "-") {
			command = args[i:]
			break
		}

		switch arg {
		case "--agent-id":
			i++
			if i < len(args) {
				flags.agentID = args[i]
			}
		case "--tenant-id":
			i++
			if i < len(args) {
				flags.tenantID = args[i]
			}
		case "--soulwatch-url":
			i++
			if i < len(args) {
				flags.soulwatchURL = args[i]
			}
		case "--sanitize":
			i++
			if i < len(args) {
				flags.sanitize = args[i]
			}
		case "--config":
			i++
			if i < len(args) {
				flags.configPath = args[i]
			}
		case "--offline":
			flags.forceOffline = true
		case "--dry-run":
			flags.dryRun = true
		case "--version":
			flags.showVersion = true
		default:
			// Unknown flag -- treat as start of command
			command = args[i:]
			i = len(args)
			continue
		}
		i++
	}

	return flags, command
}

func printUsage() {
	fmt.Fprintf(os.Stderr, `tiresias-exec %s — CLI tool invocation shim

Usage:
  tiresias-exec [flags] -- <command> [args...]
  tiresias-exec [flags] <command> [args...]

Flags:
  --agent-id STRING      Override agent identity
  --tenant-id STRING     Override tenant identity
  --soulwatch-url STRING Override SoulWatch endpoint
  --sanitize STRING      Sanitizer mode (passthrough|warn|block) [reserved]
  --config STRING        Config file path (default: ~/.tiresias/agent.yaml)
  --offline              Force offline mode (skip SoulWatch reporting)
  --dry-run              Policy check only, do not execute [reserved]
  --version              Print version and exit

The wrapped command always executes. Telemetry is reported async.
`, Version)
}
