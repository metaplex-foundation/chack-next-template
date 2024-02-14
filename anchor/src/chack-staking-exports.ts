// Here we export some useful types and functions for interacting with the Anchor program.
import { Cluster, PublicKey } from '@solana/web3.js';
import { Program } from '@coral-xyz/anchor'
import type { ChackStaking } from '../target/types/chack_staking';
import { IDL as ChackStakingIDL } from '../target/types/chack_staking';

// Re-export the generated IDL and type
export { ChackStaking, ChackStakingIDL };
export type ChackStakingProgram = Program<ChackStaking>;

// After updating your program ID (e.g. after running `anchor keys sync`) update the value below.
export const CHACK_STAKING_PROGRAM_ID = new PublicKey(
  'x3W9hJnX2fGW2tLKKyCgorX9XbYdQAQZXQw1mJFUA8D'
);

// This is a helper function to get the program ID for the Counter program depending on the cluster.
export function getChackStakingProgramId(cluster: Cluster) {
  switch (cluster) {
    case 'devnet':
    case 'testnet':
    case 'mainnet-beta':
      // You only need to update this if you deploy your program on one of these clusters.
      return new PublicKey('x3W9hJnX2fGW2tLKKyCgorX9XbYdQAQZXQw1mJFUA8D');
    default:
      return CHACK_STAKING_PROGRAM_ID;
  }
}
