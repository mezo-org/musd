# MUSD

Smart contracts and the dApp powering MUSD on Mezo.

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

#### Smart Contracts

1. `$ cd solidity`
1. `$ cp .env.example .env` and fill in the values.
1. `$ pnpm run deploy --network matsnet` to deploy the contracts. This will resolve and use the current deployment at `deployments/matsnet`, so if you want to deploy a fresh set of contracts, delete (or archive) the `deployments/matsnet` directory.

#### Payment Integration & dApp

The MUSD payment integration includes a React dApp and Node.js payment service.

**📚 [Complete Deployment Documentation Index](DEPLOYMENT_INDEX.md)** ⭐ START HERE

**Quick Links:**
- 🚀 **[Deployment Quick Reference](DEPLOYMENT_QUICK_REFERENCE.md)** - Quick start guide
- 📖 **[Vercel Deployment Guide](VERCEL_DEPLOYMENT.md)** - Step-by-step deployment (30-60 min)
- 🌐 **[Boar Network Deployment Guide](BOAR_DEPLOYMENT.md)** - Premium infrastructure (30-60 min)
- 🏢 **[Spectrum Deployment Guide](SPECTRUM_DEPLOYMENT.md)** - Enterprise deployment (1-2 hours)
- 🔧 **[Deployment Resolution](DEPLOYMENT_RESOLUTION.md)** - Understanding current errors
- 🐛 **[Troubleshooting Guide](TROUBLESHOOTING.md)** - Common issues and solutions
- 💻 **[Quick Start Guide](QUICK_START.md)** - Run locally in 5 minutes

**Deployment Options:**
- **Vercel + Railway:** $0-5/month (development), $40-70/month (production)
- **Boar Network:** $5/month + custom pricing (premium, multi-region, WebSocket)
- **Spectrum Enterprise:** $250-400/month (99.9% SLA, high-traffic production)

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
