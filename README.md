# Onboarding regression evidence for #9722

Actual shared React components rendered in headless Chromium using the UI Lab Vite configuration. Runtime picker data and model HTTP responses are synthetic; no Electron shell, live daemon, login, or backend is involved.

Before source: `908456c60192907f3c7e65709e18846f08eea2f8`. After source: the `multica-fix/issue-9722-onboarding-runtime-context` PR branch.

Six runtime registrations share `daemon-1`. No current workspace route is set. Both steps receive `wsSlug="new-workspace"`. The simulated API rejects requests without that workspace header, then uses pending/completed responses to exercise polling. The after run also clicks Refresh. `requests.json` records the actual requests.

To reproduce: install dependencies in the fix checkout, copy the three `onboarding-evidence.*` files into `apps/ui-lab/`, create `../evidence`, then run `node apps/ui-lab/onboarding-evidence.mjs` from the repository root. It starts and stops its own Vite and Chromium instances.

- Web before: six computers and model discovery error.
- Web after: one computer and available model.
- Desktop before/after: discovery error becomes an available model (desktop correctly labels its count as runtimes).

Full stack verification was unavailable because Docker is not installed.
