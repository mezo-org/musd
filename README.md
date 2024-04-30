# MUSD

Smart contracts and the dApp powering MUSD on Mezo.

## Development

### Installation

This project uses [pnpm](https://pnpm.io/) as a package manager ([installation documentation](https://pnpm.io/installation)).

To install dependencies run:

```bash
pnpm install
```

### Pre-commit hooks

Setup [pre-commit](https://pre-commit.com/) hooks to automatically discover code issues before submitting the code.

1. Install `pre-commit` tool:
   ```bash
   brew install pre-commit
   ```
2. Install the pre-commit hooks in the current repository:
   ```bash
   pre-commit install
   ```

#### Testing pre-commit hooks

To test configuration or debug problems hooks can be invoked manually:

```bash
# Execute hooks for all files:
pre-commit run --all-files

# Execute hooks for specific files:
pre-commit run --files <path-to-file>
```
