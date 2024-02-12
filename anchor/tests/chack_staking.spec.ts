import * as anchor from '@coral-xyz/anchor';
import { Program } from '@coral-xyz/anchor';
import {
  hashMetadataCreators,
  hashMetadataData,
  MetadataArgsArgs,
  MPL_BUBBLEGUM_PROGRAM_ID,
  TokenProgramVersion,
  TokenStandard,
} from '@metaplex-foundation/mpl-bubblegum'

import { fromWeb3JsPublicKey } from '@metaplex-foundation/umi-web3js-adapters'

import {
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  Transaction,
} from '@solana/web3.js';

import {
  getConcurrentMerkleTreeAccountSize,
  ConcurrentMerkleTreeAccount,
  SPL_ACCOUNT_COMPRESSION_PROGRAM_ID,
  SPL_NOOP_PROGRAM_ID,
  ValidDepthSizePair,
} from '@solana/spl-account-compression';

import { ChackStaking } from '../target/types/chack_staking';


function delay(ms: number) {
  return new Promise( resolve => setTimeout(resolve, ms) );
}

describe('chack_staking', () => {
  // Configure the client to use the local cluster.
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const payer = provider.wallet as anchor.Wallet;
  const program = anchor.workspace.ChackStaking as Program<ChackStaking>;

  const merkleTreeKeypair = Keypair.generate();
  const merkleTree = merkleTreeKeypair.publicKey;

  const cNftOwnerKeypair = Keypair.generate();
  const cNftOwner = cNftOwnerKeypair.publicKey;

  // This type enforces a valid `maxDepth` and `maxBufferSize` pair.
  const depthSizePair: ValidDepthSizePair = {
    maxDepth: 3,
    maxBufferSize: 8,
  };

  // Find the `treeConfig` PDA.
  const [treeConfig, _treeConfigBump] = PublicKey.findProgramAddressSync(
    [merkleTree.toBuffer()],
    new PublicKey(MPL_BUBBLEGUM_PROGRAM_ID),
  );

  // Find the `treeOwner` PDA.
  const [treeOwner, _treeOwnerBump] = PublicKey.findProgramAddressSync(
    [
      anchor.utils.bytes.utf8.encode('tree_owner'),
      merkleTree.toBuffer(),
    ],
    program.programId
  )

  // Find the stakingDetails PDA for the specific cNFT owner.
  const [stakingDetails, _stakingDetailsBump] = PublicKey.findProgramAddressSync(
    [
      anchor.utils.bytes.utf8.encode('staking_details'),
      merkleTree.toBuffer(),
      cNftOwner.toBuffer(),
    ],
    program.programId
  )

  // This is the same Metadata that the program uses.
  const metadata: MetadataArgsArgs  = {
    name: 'cNFT',
    symbol: 'cNFT',
    uri: 'https://c.nft',
    creators: [{
      address: fromWeb3JsPublicKey(treeOwner),
      verified: false,
      share: 100,
    }],
    editionNonce: null,
    tokenProgramVersion: TokenProgramVersion.Original,
    tokenStandard: TokenStandard.NonFungible,
    uses: null,
    collection: null,
    primarySaleHappened: true,
    sellerFeeBasisPoints: 500,
    isMutable: true,
  };

  // These are the hashes needed for transferring.
  const dataHash = Array.from(hashMetadataData(metadata));
  const creatorHash = Array.from(hashMetadataCreators(metadata.creators));

  it('Create a Tree with ChackStaking', async () => {
    // Create Merkle tree account.
    await createMerkleTreeAccount(
      provider,
      merkleTreeKeypair,
      depthSizePair
    );

    // Create the tree.
    await program.methods
      .createTree(depthSizePair.maxDepth, depthSizePair.maxBufferSize)
      .accounts({
        treeConfig,
        merkleTree,
        payer: payer.publicKey,
        treeOwner,
        mplBubblegumProgram: MPL_BUBBLEGUM_PROGRAM_ID,
        logWrapper: SPL_NOOP_PROGRAM_ID,
        compressionProgram: SPL_ACCOUNT_COMPRESSION_PROGRAM_ID,
      })
      .rpc({
        skipPreflight:true
      });
  });

  it('Mint a cNFT', async () => {
    // Mint a cNFT owned by `cNftOwnerKeypair`.
    await program.methods
      .mintCnft()
      .accounts({
        treeConfig,
        merkleTree,
        owner: cNftOwner,
        treeOwner,
        mplBubblegumProgram: MPL_BUBBLEGUM_PROGRAM_ID,
        logWrapper: SPL_NOOP_PROGRAM_ID,
        compressionProgram: SPL_ACCOUNT_COMPRESSION_PROGRAM_ID,
       })
       .signers([cNftOwnerKeypair])
       .rpc({
        skipPreflight:true
      });
  });

  it('Stake a cNFT', async () => {
    // The `cNftOwnerKeypair` will need some lamports since the stake instruction
    // initializes the `stakingDetails` PDA.
    await provider.connection.requestAirdrop(cNftOwner, LAMPORTS_PER_SOL);

    // Get the current Merkle tree root from the account.
    const accountInfo = await provider.connection.getAccountInfo(merkleTree, { commitment: 'confirmed' });
    const account = ConcurrentMerkleTreeAccount.fromBuffer(accountInfo!.data!);
    const root = Array.from(account.getCurrentRoot())

    // Stake `cNftOwnerKeypair`'s cNFT.
    try {
      await program.methods
      .stakeCnft(
        root,
        dataHash,
        creatorHash,
        new anchor.BN(0),
        new anchor.BN(0),
      ).accounts({
        treeConfig,
        merkleTree,
        owner: cNftOwner,
        stakingDetails,
        mplBubblegumProgram: MPL_BUBBLEGUM_PROGRAM_ID,
        logWrapper: SPL_NOOP_PROGRAM_ID,
        compressionProgram: SPL_ACCOUNT_COMPRESSION_PROGRAM_ID,
       })
       .signers([cNftOwnerKeypair])
       .rpc({
        skipPreflight:true
      });
    } catch(err) {
      console.log(err.message);
      await delay(1000);
    }

    // Verify `cNftOwnerKeypair`'s `PublicKey` is stored in the `stakingDetails` account.
    const currentStakingDetails = await program.account.stakingDetails.fetch(
      stakingDetails
    );

    expect(currentStakingDetails.owner).toEqual(cNftOwner);
  }, 30000);

  it('Unstake a cNFT', async () => {
    // Get the current Merkle tree root from the account.
    const accountInfo = await provider.connection.getAccountInfo(merkleTree, { commitment: 'confirmed' });
    const account = ConcurrentMerkleTreeAccount.fromBuffer(accountInfo!.data!);
    const root = Array.from(account.getCurrentRoot())

    try {
      await program.methods
        .unstakeCnft(
          root,
          dataHash,
          creatorHash,
          new anchor.BN(0),
          new anchor.BN(0),
        )
        .accounts({
          treeConfig,
          merkleTree,
          owner: cNftOwner,
          stakingDetails,
          mplBubblegumProgram: MPL_BUBBLEGUM_PROGRAM_ID,
          logWrapper: SPL_NOOP_PROGRAM_ID,
          compressionProgram: SPL_ACCOUNT_COMPRESSION_PROGRAM_ID,
        })
        .signers([cNftOwnerKeypair])
        .rpc({
          skipPreflight:true
        });
      } catch(err) {
        console.log(err.message);
        await delay(1000);
      }

    // The account should no longer exist, returning null.
    const currentStakingDetails = await program.account.stakingDetails.fetchNullable(
      stakingDetails
    );
    expect(currentStakingDetails).toBeNull();
  }, 30000);
});

async function createMerkleTreeAccount(
  provider: anchor.AnchorProvider,
  merkleTreeKeypair: Keypair,
  depthSizePair: ValidDepthSizePair
) {
  const merkleTree = merkleTreeKeypair.publicKey;

  const space = getConcurrentMerkleTreeAccountSize(
    depthSizePair.maxDepth,
    depthSizePair.maxBufferSize,
  );

  const allocTreeIx = SystemProgram.createAccount({
    fromPubkey: provider.wallet.publicKey,
    newAccountPubkey: merkleTree,
    lamports: await provider.connection.getMinimumBalanceForRentExemption(space),
    space: space,
    programId: SPL_ACCOUNT_COMPRESSION_PROGRAM_ID,
  });

  const tx = new Transaction().add(allocTreeIx);
  await provider.sendAndConfirm(
    tx,
    [merkleTreeKeypair],
    {
      commitment: 'confirmed',
      skipPreflight: true,
    }
  );
}
