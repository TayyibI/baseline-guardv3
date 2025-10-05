
Build notes:
- Run `npm ci` to install dependencies.
- Run `npm run build` to generate `dist/` with bundled code and copied `data.json` from `web-features`.
- The build step copies `node_modules/web-features/data.json` -> `dist/data.json` using `copyfiles -u 2` so your runtime code can load `path.join(__dirname, 'data.json')`.
