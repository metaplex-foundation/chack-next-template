import * as anchor from '@coral-xyz/anchor';
import { Program } from '@coral-xyz/anchor';
import { MPL_BUBBLEGUM_PROGRAM_ID } from '@metaplex-foundation/mpl-bubblegum'

import {
  Connection,
  Keypair,
  PublicKey,
  sendAndConfirmTransaction,
  SystemProgram,
  Transaction,
} from '@solana/web3.js';

import {
  getConcurrentMerkleTreeAccountSize,
  SPL_ACCOUNT_COMPRESSION_PROGRAM_ID,
  ValidDepthSizePair,
} from '@solana/spl-account-compression';

import { ChackStaking } from '../target/types/chack_staking';

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

  // Create the Merkle tree account with maxDepth and maxBufferSize.
  const depthSizePair: ValidDepthSizePair = {
    maxDepth: 3,
    maxBufferSize: 8,
  };

  // Find the treeConfig PDA.
  const [treeConfig, _treeConfigBump] = PublicKey.findProgramAddressSync(
    [merkleTree.toBuffer()],
    new PublicKey(MPL_BUBBLEGUM_PROGRAM_ID),
  );

  // Find the treeOwner PDA.
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

  it('Create a Tree with ChackStaking', async () => {
    // Create Merkle Tree account.
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
      })
      .rpc();
  });

  it('Mint a cNFT', async () => {
    await program.methods
      .mintCnft()
      .accounts({
        treeConfig,
        merkleTree,
        owner: cNftOwner,
        treeOwner,
        mplBubblegumProgram: MPL_BUBBLEGUM_PROGRAM_ID,
       })
       .signers([cNftOwnerKeypair])
      .rpc();
  });

  it('Stake a cNFT', async () => {
    // TODO Get all this stuff for real.
    const root = new Array(32).fill(0);
    const dataHash = new Array(32).fill(0);
    const creatorHash = new Array(32).fill(0);
    const nonce = 0;
    const index = 0;

    // TODO: Add proofs.

    await program.methods
      .stakeCnft(root, dataHash, creatorHash, nonce, index)
      .accounts({
        treeConfig,
        merkleTree,
        owner: cNftOwner,
        stakingDetails,
        mplBubblegumProgram: MPL_BUBBLEGUM_PROGRAM_ID,
       })
       .signers([cNftOwnerKeypair])
      .rpc();

    const currentStakingDetails = await program.account.stakingDetails.fetch(
      stakingDetails
    );

    expect(currentStakingDetails.owner).toEqual(cNftOwner);
  });

  it('Unstake a cNFT', async () => {
    // TODO Get all this stuff for real.
    const root = new Array(32).fill(0);
    const dataHash = new Array(32).fill(0);
    const creatorHash = new Array(32).fill(0);
    const nonce = 0;
    const index = 0;

    // TODO: Add proofs.

    await program.methods
      .unstakeCnft(root, dataHash, creatorHash, nonce, index)
      .accounts({
        treeConfig,
        merkleTree,
        owner: cNftOwner,
        stakingDetails,
        mplBubblegumProgram: MPL_BUBBLEGUM_PROGRAM_ID,
       })
       .signers([cNftOwnerKeypair])
      .rpc();

    // The account should no longer exist, returning null.
    const currentStakingDetails = await program.account.stakingDetails.fetchNullable(
      stakingDetails
    );
    expect(currentStakingDetails).toBeNull();
  });
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
