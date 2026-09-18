# Student application platform contract

- Treat Horarium Classium as a cross-platform Tauri desktop app supporting Windows, macOS, and Linux (especially Ubuntu/Xubuntu).
- Keep the existing TypeScript/Vanilla HTML/CSS frontend, Rust scheduler, and frontend schedule loading.
- Prefer Tauri's cross-platform APIs. Keep genuinely necessary OS differences in small adapters/conditional blocks; do not introduce Windows-only features.
- Use platform-neutral UI terms: “native system notification” and “Launch at login”.
- Resolve persistent paths through Tauri application-data/config APIs; never hard-code OS directories.
- Consider notification, tray, launch-at-login, startup visibility, sound, and speech behavior on all three platforms. Do not assume a visible tray or a speech voice exists.
- Keep dependencies small and feature-gated. The audio dependency enables playback only, without codec bundles.
- Preserve native packaging and the desktop CI matrix for all three OS families.
- Run relevant tests/builds; report exactly which OS/architecture was verified. CI configuration alone is not evidence of a successful remote build.
- Keep README.md and TESTING.md current, including separate manual checks for each OS.
