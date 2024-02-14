#![allow(clippy::result_large_err)]

use anchor_lang::prelude::*;
use mpl_bubblegum::{
    instructions::{CreateTreeConfigCpiBuilder, MintV1CpiBuilder, TransferCpiBuilder},
    types::{Creator, MetadataArgs, TokenProgramVersion, TokenStandard},
};
use spl_account_compression::{program::SplAccountCompression, Noop};

declare_id!("x3W9hJnX2fGW2tLKKyCgorX9XbYdQAQZXQw1mJFUA8D");

#[program]
pub mod chack_staking {
    use super::*;

    pub fn create_tree(
        ctx: Context<CreateTree>,
        max_depth: u32,
        max_buffer_size: u32,
    ) -> Result<()> {
        // Create a new Merkle tree.  Bubblegum will initialize the passed in `tree_config`
        // account, but the `merkle_tree` account must be pre-allocated based on the `max_depth`
        // and `max_buffer_size`.  It can easily be over the 10 KB PDA allocation limit so it
        // should be done using a normal keypair prior to being passed into this instruction.
        CreateTreeConfigCpiBuilder::new(&ctx.accounts.mpl_bubblegum_program)
            .tree_config(&ctx.accounts.tree_config)
            .merkle_tree(&ctx.accounts.merkle_tree)
            .payer(&ctx.accounts.payer)
            .tree_creator(&ctx.accounts.tree_owner)
            .log_wrapper(&ctx.accounts.log_wrapper)
            .compression_program(&ctx.accounts.compression_program)
            .system_program(&ctx.accounts.system_program)
            .max_depth(max_depth)
            .max_buffer_size(max_buffer_size)
            .invoke_signed(&[&[
                b"tree_owner",
                ctx.accounts.merkle_tree.key().as_ref(),
                &[ctx.bumps["tree_owner"]],
            ]])?;

        Ok(())
    }

    pub fn mint_cnft(ctx: Context<Mint>) -> Result<()> {
        // Create a default `MetadataArgs` struct.
        let metadata = MetadataArgs {
            name: String::from("cNFT"),
            uri: String::from("https://c.nft"),
            symbol: String::from("cNFT"),
            creators: vec![Creator {
                address: ctx.accounts.tree_owner.key(),
                share: 100,
                verified: false,
            }],
            edition_nonce: None,
            is_mutable: true,
            primary_sale_happened: true,
            seller_fee_basis_points: 500,
            token_program_version: TokenProgramVersion::Original,
            token_standard: Some(TokenStandard::NonFungible),
            collection: None,
            uses: None,
        };

        // Mint the cNFT.  The `owner` account will be the owner of the cNFT.  The
        // `tree_owner` account must sign to mint.
        MintV1CpiBuilder::new(&ctx.accounts.mpl_bubblegum_program)
            .tree_config(&ctx.accounts.tree_config)
            .leaf_owner(&ctx.accounts.owner)
            .leaf_delegate(&ctx.accounts.owner)
            .merkle_tree(&ctx.accounts.merkle_tree)
            .payer(&ctx.accounts.owner)
            .tree_creator_or_delegate(&ctx.accounts.tree_owner)
            .log_wrapper(&ctx.accounts.log_wrapper)
            .compression_program(&ctx.accounts.compression_program)
            .system_program(&ctx.accounts.system_program)
            .metadata(metadata)
            .invoke_signed(&[&[
                b"tree_owner",
                ctx.accounts.merkle_tree.key().as_ref(),
                &[ctx.bumps["tree_owner"]],
            ]])?;

        Ok(())
    }

    pub fn stake_cnft<'info>(
        ctx: Context<'_, '_, '_, 'info, Stake<'info>>,
        root: [u8; 32],
        data_hash: [u8; 32],
        creator_hash: [u8; 32],
        nonce: u64,
        index: u32,
    ) -> Result<()> {
        // Save the owner's `Pubkey` for later unstaking.
        ctx.accounts.staking_details.owner = ctx.accounts.owner.key();

        // Transfer the cNFT from the owner to the `staking_details` account.
        TransferCpiBuilder::new(&ctx.accounts.mpl_bubblegum_program)
            .tree_config(&ctx.accounts.tree_config)
            .leaf_owner(&ctx.accounts.owner, true)
            .leaf_delegate(&ctx.accounts.owner, false)
            .new_leaf_owner(&ctx.accounts.staking_details.to_account_info())
            .merkle_tree(&ctx.accounts.merkle_tree)
            .log_wrapper(&ctx.accounts.log_wrapper)
            .compression_program(&ctx.accounts.compression_program)
            .system_program(&ctx.accounts.system_program)
            .root(root)
            .data_hash(data_hash)
            .creator_hash(creator_hash)
            .nonce(nonce)
            .index(index)
            .add_remaining_accounts(
                &ctx.remaining_accounts
                    .iter()
                    .map(|account| (account, false, false))
                    .collect::<Vec<(&AccountInfo, bool, bool)>>(),
            )
            .invoke()?;

        Ok(())
    }

    pub fn unstake_cnft<'info>(
        ctx: Context<'_, '_, '_, 'info, Unstake<'info>>,
        root: [u8; 32],
        data_hash: [u8; 32],
        creator_hash: [u8; 32],
        nonce: u64,
        index: u32,
    ) -> Result<()> {
        // Only the owner can unstake.
        require_keys_eq!(ctx.accounts.staking_details.owner, ctx.accounts.owner.key());

        // Transfer the cNFT from the `staking_details` account back to the owner.
        TransferCpiBuilder::new(&ctx.accounts.mpl_bubblegum_program)
            .tree_config(&ctx.accounts.tree_config)
            .leaf_owner(&ctx.accounts.staking_details.to_account_info(), true)
            .leaf_delegate(&ctx.accounts.staking_details.to_account_info(), false)
            .new_leaf_owner(&ctx.accounts.owner)
            .merkle_tree(&ctx.accounts.merkle_tree)
            .log_wrapper(&ctx.accounts.log_wrapper)
            .compression_program(&ctx.accounts.compression_program)
            .system_program(&ctx.accounts.system_program)
            .root(root)
            .data_hash(data_hash)
            .creator_hash(creator_hash)
            .nonce(nonce)
            .index(index)
            .add_remaining_accounts(
                &ctx.remaining_accounts
                    .iter()
                    .map(|account| (account, false, false))
                    .collect::<Vec<(&AccountInfo, bool, bool)>>(),
            )
            .invoke_signed(&[&[
                b"staking_details",
                ctx.accounts.merkle_tree.key().as_ref(),
                ctx.accounts.owner.key().as_ref(),
                &[ctx.bumps["staking_details"]],
            ]])?;

        Ok(())
    }
}

#[derive(Clone)]
pub struct MplBubblegum;

impl anchor_lang::Id for MplBubblegum {
    fn id() -> Pubkey {
        mpl_bubblegum::ID
    }
}

#[derive(Accounts)]
pub struct CreateTree<'info> {
    #[account(mut)]
    /// CHECK: This account is modified in the downstream program.
    pub tree_config: UncheckedAccount<'info>,
    #[account(zero)]
    /// CHECK: This account must be all zeros.
    pub merkle_tree: UncheckedAccount<'info>,
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(
        seeds = [b"tree_owner", merkle_tree.key().as_ref()],
        bump
    )]
    /// CHECK: This account used as a signing PDA only.
    pub tree_owner: UncheckedAccount<'info>,
    pub mpl_bubblegum_program: Program<'info, MplBubblegum>,
    pub log_wrapper: Program<'info, Noop>,
    pub compression_program: Program<'info, SplAccountCompression>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Mint<'info> {
    #[account(mut)]
    /// CHECK: This account is modified in the downstream program.
    pub tree_config: UncheckedAccount<'info>,
    #[account(mut)]
    /// CHECK: This account is modified in the downstream program.
    pub merkle_tree: UncheckedAccount<'info>,
    #[account(mut)]
    pub owner: Signer<'info>,
    #[account(
        seeds = [b"tree_owner", merkle_tree.key().as_ref()],
        bump
    )]
    /// CHECK: This account used as a signing PDA only.
    pub tree_owner: UncheckedAccount<'info>,
    pub mpl_bubblegum_program: Program<'info, MplBubblegum>,
    pub log_wrapper: Program<'info, Noop>,
    pub compression_program: Program<'info, SplAccountCompression>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Stake<'info> {
    #[account(mut)]
    /// CHECK: This account is modified in the downstream program.
    pub tree_config: UncheckedAccount<'info>,
    #[account(mut)]
    /// CHECK: This account is modified in the downstream program.
    pub merkle_tree: UncheckedAccount<'info>,
    #[account(mut)]
    pub owner: Signer<'info>,
    #[account(
        init,
        seeds = [b"staking_details", merkle_tree.key().as_ref(), owner.key().as_ref()],
        space = 32 + StakingDetails::INIT_SPACE, // `Pubkey`` + discriminator.
        payer = owner,
        bump
    )]
    pub staking_details: Account<'info, StakingDetails>,
    pub mpl_bubblegum_program: Program<'info, MplBubblegum>,
    pub log_wrapper: Program<'info, Noop>,
    pub compression_program: Program<'info, SplAccountCompression>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Unstake<'info> {
    #[account(mut)]
    /// CHECK: This account is modified in the downstream program.
    pub tree_config: UncheckedAccount<'info>,
    #[account(mut)]
    /// CHECK: This account is modified in the downstream program.
    pub merkle_tree: UncheckedAccount<'info>,
    #[account(mut)]
    pub owner: Signer<'info>,
    #[account(
        mut,
        close = owner,
        seeds = [b"staking_details", merkle_tree.key().as_ref(), owner.key().as_ref()],
        bump
    )]
    pub staking_details: Account<'info, StakingDetails>,
    pub mpl_bubblegum_program: Program<'info, MplBubblegum>,
    pub log_wrapper: Program<'info, Noop>,
    pub compression_program: Program<'info, SplAccountCompression>,
    pub system_program: Program<'info, System>,
}

#[account]
#[derive(InitSpace)]
pub struct StakingDetails {
    owner: Pubkey,
}
