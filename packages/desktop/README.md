# CowxCode Desktop

The Windows desktop application for **CowxCode**, built with Electron. Features a
custom title bar and a polished black / grey / red interface.

## Run (dev)

```bash
# from repo root
npm install
npm run build        # builds the core package
npm run start:desktop
```

## Build Windows installer

```bash
npm run build:desktop
```

Outputs:

- `dist/CowxCode-Setup-1.0.0.exe` — NSIS installer (x64)
- `dist/CowxCode-Portable-1.0.0.exe` — portable executable (x64)

## Notes

- Provider configuration is stored locally at
  `<userData>/cowxcode.json`. API keys are never transmitted anywhere except
  the provider you configure.
- This is an independent community project inspired by the open source
  `opencode` project. It is not affiliated with or endorsed by the OpenCode team.

## License

MIT
