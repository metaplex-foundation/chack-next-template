import * as anchor from '@coral-xyz/anchor';
import { Program } from '@coral-xyz/anchor';

import {
  MPL_BUBBLEGUM_PROGRAM_ID,
  getLeafSchemaSerializer,
} from '@metaplex-foundation/mpl-bubblegum';

import {
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
} from '@solana/web3.js';

import {
  getConcurrentMerkleTreeAccountSize,
  SPL_ACCOUNT_COMPRESSION_PROGRAM_ID,
  SPL_NOOP_PROGRAM_ID,
  ValidDepthSizePair,
} from '@solana/spl-account-compression';

import { ChackStaking } from '../target/types/chack_staking';

import bs58 from 'bs58';

function delay(ms: number) {
  return new Promise( resolve => setTimeout(resolve, ms) );
}

describe('chack_staking', () => {
  // Configure the client to use the local cluster.
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const payer = provider.wallet as anchor.Wallet;
  const program = anchor.workspace.ChackStaking as Program<ChackStaking>;

  // Create a keypair that will hold the Merkle tree underlying data structure.
  const merkleTreeKeypair = Keypair.generate();
  const merkleTree = merkleTreeKeypair.publicKey;

  // This will be our cNFT owner.  Using a known keypair derivation so that
  // devnet SOL can be airdropped separately.
  const slice = program.programId.toString().slice(0, 14);
  const seed = Uint8Array.from(Buffer.from('chack-test-keypair' + slice));
  const cNftOwnerKeypair = Keypair.fromSeed(seed);
  const cNftOwner = cNftOwnerKeypair.publicKey;
  console.log('cNFT owner wallet: ', cNftOwner.toString());

  // This type enforces a valid `maxDepth` and `maxBufferSize` pair.
  const depthSizePair: ValidDepthSizePair = {
    maxDepth: 3,
    maxBufferSize: 8,
  };

  // Find the Bubblegum `treeConfig` PDA.
  const [treeConfig, _treeConfigBump] = PublicKey.findProgramAddressSync(
    [merkleTree.toBuffer()],
    new PublicKey(MPL_BUBBLEGUM_PROGRAM_ID),
  );

  // Find the cHACK Staking program `treeOwner` PDA.
  const [treeOwner, _treeOwnerBump] = PublicKey.findProgramAddressSync(
    [
      anchor.utils.bytes.utf8.encode('tree_owner'),
      merkleTree.toBuffer(),
    ],
    program.programId
  )

  // Find the cHACK Staking program `stakingDetails` PDA (for the specific cNFT owner).
  const [stakingDetails, _stakingDetailsBump] = PublicKey.findProgramAddressSync(
    [
      anchor.utils.bytes.utf8.encode('staking_details'),
      merkleTree.toBuffer(),
      cNftOwner.toBuffer(),
    ],
    program.programId
  )

  // Data that will be retrieved later.
  let assetId: string = "";

  let dataHash: undefined | string;
  let creatorHash: undefined | string;
  let leafId: undefined | string;
  let root: undefined | string;
  let proof: undefined | string[];

  it('Create a tree', async () => {
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
  }, 60000);

  it('Mint a cNFT', async () => {
    // Mint a cNFT owned by `cNftOwnerKeypair`.
    const signature = await program.methods
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
        commitment: 'finalized',  // Use 'finalized' so that `getTransaction` below succeeds.
        skipPreflight: true
      });
      console.log('Mint tx: ', signature);

      // Get the mint transaction.
      let response = await provider.connection.getTransaction(
        signature,
        {
          commitment: 'confirmed',
          maxSupportedTransactionVersion: 0
        }
      );

      // Find the inner instruction that represents the Bubblegum call to the Noop program.
      let innerInstructions = response?.meta?.innerInstructions;
      if (!innerInstructions) {
        throw new Error('Could not parse leaf from transaction');
      }

      console.log(response?.transaction);
      innerInstructions.forEach(instruction => {
        console.log(instruction);
      })

      // Deserialize the data from the call to the Noop program into a `LeafSchema` event struct.
      let buffer = bs58.decode(innerInstructions[0].instructions[1].data);
      const leaf = getLeafSchemaSerializer().deserialize(
          // Discard the first 8 bytes, which are the Anchor discriminator.
          buffer.slice(8)
      );

      // The `assetId` is the `id` field of the `LeafSchema` event struct.
      assetId = leaf[0].id.toString();
      console.log("Asset ID: ", assetId);
  }, 60000);

  it('Stake a cNFT', async () => {
    console.log("Delay 10 seconds for indexers to catch up!!!");
    await delay(10000);

    // Call `getAsset` from an RPC DAS provider.
    let asset = await getAsset(assetId);
    if (!asset) {
      throw new Error('Could not get asset from RPC');
    }

    // Get the `dataHash`, `creatorHash`, and `leafId` from the RPC response.
    dataHash = asset.result?.compression?.data_hash;
    creatorHash = asset.result?.compression?.creator_hash;
    leafId = asset.result?.compression?.leaf_id;
    if (!dataHash || !creatorHash || leafId == undefined) {
      throw new Error('Could not find required asset data in RPC response');
    }

    // Call `getAssetProof` from an RPC DAS provider.
    let assetProof = await getAssetProof(assetId);
    if (!assetProof) {
      throw new Error('Could not get asset proof from RPC');
    }

    // Get the Merkle tree root and proof from the RPC response.
    root = assetProof?.result?.root;
    proof = assetProof?.result?.proof;
    if (!root || !proof) {
      throw new Error('Could not find required asset proof data in RPC response');
    }

    // The Merkle proof will be sent to the instruction as remaining accounts.
    let remainingAccounts: anchor.web3.AccountMeta[] = [];
    proof.forEach(proof => {
      remainingAccounts.push(
        {
          pubkey: new PublicKey(proof),
          isSigner: false,
          isWritable: false,
        }
      );
    })

    // Stake `cNftOwnerKeypair`'s cNFT, sending in the cNFT parameters from the RPC DAS provider.
    const signature = await program.methods
    .stakeCnft(
      Array.from(bs58.decode(root)),
      Array.from(bs58.decode(dataHash)),
      Array.from(bs58.decode(creatorHash)),
      new anchor.BN(leafId),
      new anchor.BN(leafId),
    ).accounts({
      treeConfig,
      merkleTree,
      owner: cNftOwner,
      stakingDetails,
      mplBubblegumProgram: MPL_BUBBLEGUM_PROGRAM_ID,
      logWrapper: SPL_NOOP_PROGRAM_ID,
      compressionProgram: SPL_ACCOUNT_COMPRESSION_PROGRAM_ID,
      })
      .remainingAccounts(remainingAccounts)
      .signers([cNftOwnerKeypair])
      .rpc({
      skipPreflight:true
    });
    console.log('Stake cNFT tx: ', signature);

    // Verify `cNftOwnerKeypair`'s `PublicKey` is stored in the `stakingDetails` account.
    const currentStakingDetails = await program.account.stakingDetails.fetch(
      stakingDetails
    );
    expect(currentStakingDetails.owner).toEqual(cNftOwner);
  }, 60000);

  it('Unstake a cNFT', async () => {
    // The `dataHash`, `creatorHash`, and `leafId` can be reused since they were not changed by
    // the `stakeCnft` instruction.
    if (!dataHash || !creatorHash || leafId == undefined) {
      throw new Error('Could not find required asset data in RPC response');
    }

    // The Merkle tree root changed when the cNFT was transferred to a new owner by the `stakeCnft`
    // instruction, so that needs to be read again from the RPC DAS provider.  The Merkle proof can
    // change if another node in the tree is changed, so it is a good idea to get a new Merkle
    // proof as well.
    let assetProof = await getAssetProof(assetId);
    if (!assetProof) {
      throw new Error('Could not get Asset from RPC');
    }

    // Get the updated Merkle tree root and proof from the RPC response.
    root = assetProof?.result?.root;
    proof = assetProof?.result?.proof;
    if (!root || !proof) {
      throw new Error('Could not find required asset proof data in RPC response');
    }

    // The Merkle proof will be sent to the instruction as remaining accounts.
    let remainingAccounts: anchor.web3.AccountMeta[] = [];
    proof.forEach(proof => {
      remainingAccounts.push(
        {
          pubkey: new PublicKey(proof),
          isSigner: false,
          isWritable: false,
        }
      );
    })

    // Stake `cNftOwnerKeypair`'s cNFT, sending in the cNFT parameters from the RPC DAS provider.
    const signature = await program.methods
      .unstakeCnft(
        Array.from(bs58.decode(root)),
        Array.from(bs58.decode(dataHash)),
        Array.from(bs58.decode(creatorHash)),
        new anchor.BN(leafId),
        new anchor.BN(leafId),
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
      .remainingAccounts(remainingAccounts)
      .signers([cNftOwnerKeypair])
      .rpc({
        skipPreflight:true
      });
      console.log('Unstake cNFT tx: ', signature);

    // The `stakingDetails` account should no longer exist, returning null.
    const currentStakingDetails = await program.account.stakingDetails.fetchNullable(
      stakingDetails
    );
    expect(currentStakingDetails).toBeNull();
  }, 60000);
});

// Create a Merkle tree account of the correct size using the valid `maxDepth` and `maxBufferSize`
// pair passed in via `depthSizePair`.
async function createMerkleTreeAccount(
  provider: anchor.AnchorProvider,
  merkleTreeKeypair: Keypair,
  depthSizePair: ValidDepthSizePair
) {
  const merkleTree = merkleTreeKeypair.publicKey;

  // Use the helper method to calculate the required space.
  const space = getConcurrentMerkleTreeAccountSize(
    depthSizePair.maxDepth,
    depthSizePair.maxBufferSize,
  );

  // Create the account for the Merkle tree.
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

// Call `getAsset` from an RPC DAS provider.
async function getAsset(assetId: string): Promise<any> {
  const result = await rpc('getAsset', assetId);
  return result;
}

// Call `getAssetProof` from an RPC DAS provider.
async function getAssetProof(assetId: string): Promise<any> {
  const result = await rpc('getAssetProof', assetId);
  return result;
}

// Low-level helper function to call the RPC DAS methods used by these tests.  Note it would not
// work for other DAS methods such as `getAssetsByCreator`, which have different parameters.
async function rpc(
  method: string,
  assetId: string
): Promise<any> {
  const url = process.env.READ_API_RPC_DEVNET;

  if (!url) {
    throw new Error('READ_API_RPC_DEVNET environment variable is not set.');
  }

  // Avoid rate limiting for RPC endpoint!
  await delay(5000);

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: '0',
      method: method,
      params: {
        id: assetId
      },
    }),
  });
  const result = await response.json();
  console.log(method, ": ", result);
  return result;
}