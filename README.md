# chack-next-template

This project is generated with the [create-solana-dapp](https://github.com/solana-developers/create-solana-dapp) generator.

## cNFT

- Example cNFT code for creating trees, minting and transferring cNFTs can be found in [this file](https://github.com/metaplex-foundation/chack-next-template/blob/main/web/components/cnft/cnft-ui.tsx)
- Example site is deployed [here](https://chack-next-template.vercel.app/)

## Getting Started

### Prerequisites

- Node v18.18.0 or higher

- Rust v1.70.0 or higher
- Anchor CLI 0.29.0 or higher
- Solana CLI 1.17.0 or higher

### Installation

#### Clone the repo

```shell
git clone <repo-url>
cd <repo-name>
```

#### Install Dependencies

```shell
npm install
```

#### Start the web app

```
npm run dev
```

## Apps

### anchor

This is a Solana program written in Rust using the Anchor framework.

#### Commands

You can use any normal anchor commands. Either move to the `anchor` directory and run the `anchor` command or prefix the command with `npm run`, eg: `npm run anchor`.

#### Install Dependencies needed for Anchor

```shell
npm install
```

#### Sync the program id:

Running this command will create a new keypair in the `anchor/target/deploy` directory and save the address to the Anchor config file and update the `declare_id!` macro in the `./src/lib.rs` file of the program.

You will manually need to update the constant in `anchor/lib/counter-exports.ts` to match the new program id.

```shell
npm run anchor keys sync
```

## Set up local environment variables

Some of the tests are using a devnet ReadAPI RPC to ensure the Read API client is working as expected. To run these tests locally, you'll need to set up the `READ_API_RPC_DEVNET` environment variable. Simply add a `.env` file in the `anchor` directory and add the variable to it.

```shell
cp anchor/.env.example anchor/.env

# Edit the .env file and add the following line.
READ_API_RPC_DEVNET="INSERT_RPC_ENDPOINT_HERE"
```


#### Build the program:

```shell
npm run anchor-build
```

#### Run the tests
Note that the Anchor.toml configuration is setup to deploy and run the tests on devnet.
```shell
npm run anchor-test
```

#### Deploy to Devnet
This step is not needed with the default Anchor.toml configuration as the tests will automatically deploy to devnet.
```shell
npm run anchor deploy --provider.cluster devnet
```

#### Dump Programs:

If running on localnet, this script will dump the required programs.
```shell
./dump-programs.sh
```

### web

This is a React app that uses the Anchor generated client to interact with the Solana program.

#### Commands

Start the web app

```shell
npm run dev
```

Build the web app

```shell
npm run build
```
