package daemon

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/multica-ai/multica/server/internal/cli"
)

const machineLockDirName = "daemon-runtime-locks"

var ErrMachineLockHeld = errors.New("daemon runtime identity is already owned by another local process")

type MachineLockHeldError struct {
	Path    string
	Owner   MachineLockOwner
	Request MachineLockOwner
}

func (e *MachineLockHeldError) Error() string {
	ownerLabel := e.Owner.LaunchedBy
	if ownerLabel == "" {
		ownerLabel = "cli"
	}
	requestLabel := e.Request.LaunchedBy
	if requestLabel == "" {
		requestLabel = "cli"
	}
	return fmt.Sprintf("%v: daemon_id %q is already held by pid %d (profile %q, launched_by %q); refused pid %d (profile %q, launched_by %q)",
		ErrMachineLockHeld,
		e.Owner.DaemonID,
		e.Owner.PID,
		e.Owner.Profile,
		ownerLabel,
		e.Request.PID,
		e.Request.Profile,
		requestLabel,
	)
}

func (e *MachineLockHeldError) Unwrap() error {
	return ErrMachineLockHeld
}

type MachineLockOwner struct {
	DaemonID   string    `json:"daemon_id"`
	PID        int       `json:"pid"`
	Profile    string    `json:"profile,omitempty"`
	LaunchedBy string    `json:"launched_by,omitempty"`
	Token      string    `json:"token"`
	CreatedAt  time.Time `json:"created_at"`
}

type MachineLock struct {
	path  string
	owner MachineLockOwner
}

func AcquireMachineLock(cfg Config) (*MachineLock, error) {
	daemonID := strings.TrimSpace(cfg.DaemonID)
	if daemonID == "" {
		return nil, errors.New("daemon_id is required for machine runtime lock")
	}

	root, err := cli.ProfileDir("")
	if err != nil {
		return nil, fmt.Errorf("resolve daemon lock directory: %w", err)
	}
	lockDir := filepath.Join(root, machineLockDirName)
	if err := os.MkdirAll(lockDir, 0o755); err != nil {
		return nil, fmt.Errorf("create daemon lock directory: %w", err)
	}

	owner := MachineLockOwner{
		DaemonID:   daemonID,
		PID:        os.Getpid(),
		Profile:    cfg.Profile,
		LaunchedBy: cfg.LaunchedBy,
		Token:      randomLockToken(),
		CreatedAt:  time.Now().UTC(),
	}
	path := filepath.Join(lockDir, machineLockFileName(daemonID))

	for attempt := 0; attempt < 2; attempt++ {
		lock, err := createMachineLock(path, owner)
		if err == nil {
			return lock, nil
		}
		if !errors.Is(err, os.ErrExist) {
			return nil, err
		}

		existing, active, readErr := readActiveMachineLock(path)
		if readErr != nil {
			return nil, readErr
		}
		if active {
			return nil, &MachineLockHeldError{Path: path, Owner: existing, Request: owner}
		}
		if err := os.Remove(path); err != nil && !errors.Is(err, os.ErrNotExist) {
			return nil, fmt.Errorf("remove stale daemon lock %s: %w", path, err)
		}
	}

	return nil, fmt.Errorf("acquire daemon runtime lock %s: retry exhausted", path)
}

func createMachineLock(path string, owner MachineLockOwner) (*MachineLock, error) {
	f, err := os.OpenFile(path, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0o600)
	if err != nil {
		return nil, err
	}
	ok := false
	defer func() {
		_ = f.Close()
		if !ok {
			_ = os.Remove(path)
		}
	}()
	if err := json.NewEncoder(f).Encode(owner); err != nil {
		return nil, fmt.Errorf("write daemon lock %s: %w", path, err)
	}
	ok = true
	return &MachineLock{path: path, owner: owner}, nil
}

func readActiveMachineLock(path string) (MachineLockOwner, bool, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return MachineLockOwner{}, false, nil
		}
		return MachineLockOwner{}, false, fmt.Errorf("read daemon lock %s: %w", path, err)
	}
	var owner MachineLockOwner
	if err := json.Unmarshal(data, &owner); err != nil {
		return MachineLockOwner{}, false, nil
	}
	if owner.PID <= 0 {
		return owner, false, nil
	}
	return owner, processAlive(owner.PID), nil
}

func (l *MachineLock) Release() error {
	if l == nil || l.path == "" {
		return nil
	}
	data, err := os.ReadFile(l.path)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return nil
		}
		return fmt.Errorf("read daemon lock %s: %w", l.path, err)
	}
	var owner MachineLockOwner
	if err := json.Unmarshal(data, &owner); err != nil {
		return nil
	}
	if owner.Token != l.owner.Token || owner.PID != l.owner.PID || owner.DaemonID != l.owner.DaemonID {
		return nil
	}
	if err := os.Remove(l.path); err != nil && !errors.Is(err, os.ErrNotExist) {
		return fmt.Errorf("remove daemon lock %s: %w", l.path, err)
	}
	return nil
}

func machineLockFileName(daemonID string) string {
	sum := sha256.Sum256([]byte(strings.ToLower(strings.TrimSpace(daemonID))))
	return hex.EncodeToString(sum[:]) + ".json"
}

func randomLockToken() string {
	var b [16]byte
	if _, err := rand.Read(b[:]); err != nil {
		return fmt.Sprintf("%d", time.Now().UnixNano())
	}
	return hex.EncodeToString(b[:])
}
