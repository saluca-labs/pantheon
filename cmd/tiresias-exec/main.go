package main

import (
	"encoding/json"
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

	// === Action Gate: evaluate policy before execution ===
	var policyResult PolicyEvalResponse
	policyEvaluated := false

	if !flags.forceOffline && identity.SoulWatchURL != "" {
		pr, err := evaluatePolicy(identity, command)
		if err != nil {
			fmt.Fprintf(os.Stderr, "tiresias-exec: policy check skipped: %v\n", err)
			policyResult = PolicyEvalResponse{Verdict: "allow", Reason: "policy evaluation unavailable"}
		} else {
			policyResult = pr
			policyEvaluated = true
		}

		// Dry-run: print policy result as JSON and exit
		if flags.dryRun {
			out, _ := json.MarshalIndent(policyResult, "", "  ")
			fmt.Println(string(out))
			os.Exit(0)
		}

		// Deny: exit 77 (EX_NOPERM) without executing
		if policyResult.Verdict == "deny" {
			ruleName := policyResult.RuleMatched
			if ruleName == "" {
				ruleName = "default"
			}
			fmt.Fprintf(os.Stderr, "tiresias-exec: DENIED by policy rule '%s': %s\n", ruleName, policyResult.Reason)

			// Build and report telemetry for the denied invocation
			cwd, _ := os.Getwd()
			payload := buildPayloadWithPolicy(identity, command, cwd, ExecutionResult{ExitCode: 77}, policyResult, true)

			// Fire-and-forget report with brief grace period
			done := make(chan struct{})
			go func() {
				defer close(done)
				if err := reportEvent(identity.SoulWatchURL, identity.Token, payload); err != nil {
					writeOffline(identity.OfflineLogPath, payload)
				}
			}()
			select {
			case <-done:
			case <-time.After(500 * time.Millisecond):
			}
			os.Exit(77)
		}

		// Warn: print warning but continue execution
		if policyResult.Verdict == "warn" {
			ruleName := policyResult.RuleMatched
			if ruleName == "" {
				ruleName = "default"
			}
			fmt.Fprintf(os.Stderr, "tiresias-exec: WARNING from policy rule '%s': %s\n", ruleName, policyResult.Reason)
		}
	} else if flags.dryRun {
		// Dry-run in offline mode: report no policy available
		out, _ := json.MarshalIndent(PolicyEvalResponse{
			Verdict: "allow",
			Reason:  "offline mode -- no policy evaluation",
		}, "", "  ")
		fmt.Println(string(out))
		os.Exit(0)
	}

	result := executeCommand(command)

	// Write subprocess output to stdout/stderr immediately
	os.Stdout.Write(result.Stdout)
	os.Stderr.Write(result.Stderr)

	// Build telemetry payload with policy result
	cwd, _ := os.Getwd()
	payload := buildPayloadWithPolicy(identity, command, cwd, result, policyResult, policyEvaluated)

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
  --dry-run              Policy check only, do not execute
  --version              Print version and exit

The wrapped command always executes (unless denied by policy).
Telemetry is reported async.
`, Version)
}
