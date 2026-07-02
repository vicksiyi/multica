package daemon

import (
	"errors"
	"os"
	"strings"
	"testing"
)

func TestAcquireMachineLockRejectsActiveSameDaemonID(t *testing.T) {
	t.Setenv("HOME", t.TempDir())

	first, err := AcquireMachineLock(Config{
		DaemonID:   "daemon-1",
		Profile:    "",
		LaunchedBy: "cli",
	})
	if err != nil {
		t.Fatalf("first AcquireMachineLock: %v", err)
	}
	defer first.Release()

	_, err = AcquireMachineLock(Config{
		DaemonID:   "daemon-1",
		Profile:    "desktop-example",
		LaunchedBy: "desktop",
	})
	if !errors.Is(err, ErrMachineLockHeld) {
		t.Fatalf("second AcquireMachineLock error = %v, want ErrMachineLockHeld", err)
	}
	if got := err.Error(); !strings.Contains(got, "daemon-1") || !strings.Contains(got, "desktop-example") {
		t.Fatalf("lock error should identify the competing daemon, got %q", got)
	}

	if err := first.Release(); err != nil {
		t.Fatalf("release first lock: %v", err)
	}
	if _, err := os.Stat(first.path); !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("lock file should be removed after release, stat err = %v", err)
	}

	second, err := AcquireMachineLock(Config{
		DaemonID:   "daemon-1",
		Profile:    "desktop-example",
		LaunchedBy: "desktop",
	})
	if err != nil {
		t.Fatalf("AcquireMachineLock after release: %v", err)
	}
	defer second.Release()
}

func TestAcquireMachineLockAllowsDistinctDaemonIDs(t *testing.T) {
	t.Setenv("HOME", t.TempDir())

	first, err := AcquireMachineLock(Config{DaemonID: "daemon-1"})
	if err != nil {
		t.Fatalf("first AcquireMachineLock: %v", err)
	}
	defer first.Release()

	second, err := AcquireMachineLock(Config{DaemonID: "daemon-2", Profile: "other"})
	if err != nil {
		t.Fatalf("distinct daemon_id AcquireMachineLock: %v", err)
	}
	defer second.Release()
}
