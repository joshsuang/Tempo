## Reproduce artifacts

- This worktree has no environment files to copy from the main checkout.
- From the worktree root, install dependencies with `npm install` using the committed `package.json` and lockfile.

## Run the server

- Start the Vite development server from the worktree root with `npm run dev -- --host 127.0.0.1 --port 5173`.
- If port 5173 is occupied, choose another free local port and pass it with `--port`.
