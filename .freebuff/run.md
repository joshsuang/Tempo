## Reproduce artifacts

- This worktree has no environment files to copy from the main checkout.
- From the worktree root, install dependencies with `npm install` using the committed `package.json` and lockfile.
- Ensure `.freebuff/vite.preview.config.ts` is present; it points Vite at this worktree and enables the React plugin.

## Run the server

- For a normal interactive run, start Vite from the worktree root with `npm run dev -- --host 127.0.0.1 --port 5173`.
- For a detached macOS Preview server, use the installed Node binary with the preview config:
  `node node_modules/vite/bin/vite.js --config /absolute/path/to/.freebuff/vite.preview.config.ts --host 127.0.0.1 --port 5173`
- If port 5173 is occupied, choose another free local port and pass it with `--port`.
- Submit the detached command through launchd so it survives the thread: `launchctl submit -l <label> -- <command>`, then obtain its PID with `launchctl print gui/$(id -u)/<label>`.
