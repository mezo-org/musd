# musd Contracts

Smart contracts powering MUSD

## Development

### Installation

This project uses [pnpm](https://pnpm.io/) as a package manager ([installation documentation](https://pnpm.io/installation)).

To install dependencies run:

```bash
pnpm install
```

Install slither locally

```bash
brew install slither
```

### Testing

```
$ pnpm test
```

```
slither .
```

### Environment Setup

This project uses [dotenv-safer](https://github.com/vincentvella/dotenv-safer),
which provides environment variable checking. If there is a field in
`.env.example` but not `.env`, execution will halt early with an error.

Both `pnpm run deploy` and `pnpm test` will automatically create a blank `.env`
from the `.env.example` template, if `.env` does not exist.

To do this manually:

```
$ pnpm run prepare:env
```

### Deploying

We deploy our contracts with
[hardhat-deploy](https://www.npmjs.com/package/hardhat-deploy) via

```
$ pnpm run deploy [--network <network>]
```

Check the `"networks"` entry of `hardhat.config.ts` for supported networks.

Deploying to real chains will require configuring the `.env` environment,
detailed in `.env.example`.

#### Examples:

**In-Memory Hardhat** (great for development)

```
pnpm run deploy
```

**Sepolia**

To deploy contracts on Sepolia run:

```
$ pnpm run deploy --network sepolia
```

Or, alternatively, manually trigger the [`Solidity`
workflow](https://github.com/thesis/mezo-portal/actions/workflows/solidity.yml)
(this will not only deploy the contracts, but also update the values of
`TBTC_CONTRACT_ADDRESS`, `WBTC_CONTRACT_ADDRESS` and `PORTAL_CONTRACT_ADDRESS`
environment variables in the settings of Netlify builds deploying dApp and its
previews).
