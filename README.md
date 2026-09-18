# Agent activity animation measurements

Synthetic issue-page fixture, not the application or a Windows Electron reproduction. Uses the repository's actual shared CSS, compiled with its Tailwind plugin, and the changed activity classes. Six running sub-issues, header chip, chat FAB, 164 synthetic comments; 1936 × 1096 CSS px, device scale 2. Placeholder avatars and content. No React, network traffic, query subscriptions, task timer, or JavaScript spinner is simulated.

Each case warms for one second and records five seconds of Chrome DevTools `devtools.timeline` tracing and Performance metrics. `mainThreadBusyPercent` is delta TaskDuration / wall time, not operating-system renderer CPU or GPU usage. Paint counts include all Paint trace events. Timing varies by load; this is a short isolation experiment, not a throughput benchmark. Idle and reduced-motion controls are included. Reduced motion was already respected by the baseline shared global styles.

`measurements.json` records the final complete run. Before: upstream 2df765a3c; after: 3947944ce. PNGs show the fixture in light/dark mode; JSON traces are supplied in the Multica issue attachment.

To reproduce: place a checkout at `./multica`, install dependencies with `pnpm install --frozen-lockfile`, check out the fix commit with the baseline in git history, place this script at `./artifacts/profile-activity.mjs`, then run `node artifacts/profile-activity.mjs` from the parent directory. Requires installed Google Chrome. The script checks the fixture's activity class references against source and fails if after-state CSS animations remain.

The result demonstrates removal of the identified CSS repaint cost only. It does not explain the reporter's sustained JS load. Before calling the full issue resolved, capture a Windows Electron renderer performance trace with active runs, idle and reduced motion; inspect remaining JS stacks and verify actual OS CPU/GPU usage. Full local application checks were blocked: Docker was absent from PATH and its installed daemon was unavailable. `make check-worktree` printed a misleading success after the prerequisite failed; it is not counted as a pass.
