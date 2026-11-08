//! Fog of War — simultaneous-turn arena.
//!
//! The board is public. Only the current turn's action is hidden, and only
//! until reveal: each player submits `sha256(domain || match || turn || seat ||
//! action || direction || salt)`. The program checks the preimage, rejects
//! anything that does not match or is not a legal action, then resolves both
//! actions deterministically.

#![allow(unexpected_cfgs)]
#![deny(unused_must_use)]

pub mod error;
pub mod hashutil;
pub mod processor;
pub mod rules;
pub mod state;

#[cfg(not(target_os = "solana"))]
pub mod ix;

use solana_program::account_info::AccountInfo;
use solana_program::entrypoint::ProgramResult;
use solana_program::pubkey::Pubkey;

#[cfg(not(feature = "no-entrypoint"))]
solana_program::entrypoint!(process_instruction);

pub fn process_instruction(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
    instruction_data: &[u8],
) -> ProgramResult {
    processor::process(program_id, accounts, instruction_data)
}
