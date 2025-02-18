# mUSD

Smart contracts and the dApp powering mUSD on Mezo.

## Development

Developer documentation can be found in the [docs](docs) directory. Particularly, the [README](docs/README.md), which contains a system overview and breakdown of the main contracts.

### Installation

This project uses [pnpm](https://pnpm.io/) as a package manager ([installation documentation](https://pnpm.io/installation)).

To install dependencies run:

```bash
pnpm install --frozen-lockfile
cd solidity
pnpm install --frozen-lockfile
```

### Running Tests

To run tests:

```bash
cd solidity
pnpm test
```

### Deployment

1. `$ cd solidity`
1. `$ cp .env.example .env` and fill in the values.
1. `$ pnpm run deploy --network matsnet` to deploy the contracts. This will resolve and use the current deployment at `deployments/matsnet`, so if you want to deploy a fresh set of contracts, delete (or archive) the `deployments/matsnet` directory.

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
