//! Client instruction builders. Not linked into the on-chain binary.

use solana_program::instruction::{AccountMeta, Instruction};
use solana_program::pubkey::Pubkey;
use solana_program::sysvar::clock;
use solana_program::sysvar::rent;

use crate::state::{IX_COMMIT, IX_INIT, IX_REVEAL, IX_TIMEOUT};

pub fn match_pda(program_id: &Pubkey, player_a: &Pubkey, nonce: u64) -> (Pubkey, u8) {
    let nonce_bytes = nonce.to_le_bytes();
    Pubkey::find_program_address(&[b"match", player_a.as_ref(), &nonce_bytes], program_id)
}

pub fn init(
    program_id: &Pubkey,
    player_a: &Pubkey,
    player_b: &Pubkey,
    match_pda: &Pubkey,
    window: i64,
    nonce: u64,
) -> Instruction {
    let mut data = Vec::with_capacity(49);
    data.push(IX_INIT);
    data.extend_from_slice(player_b.as_ref());
    data.extend_from_slice(&window.to_le_bytes());
    data.extend_from_slice(&nonce.to_le_bytes());
    Instruction {
        program_id: *program_id,
        accounts: vec![
            AccountMeta::new(*player_a, true),
            AccountMeta::new(*match_pda, false),
            AccountMeta::new_readonly(solana_system_interface::program::ID, false),
            AccountMeta::new_readonly(rent::ID, false),
            AccountMeta::new_readonly(clock::ID, false),
        ],
        data,
    }
}

pub fn commit(
    program_id: &Pubkey,
    player: &Pubkey,
    match_pda: &Pubkey,
    hash: [u8; 32],
) -> Instruction {
    let mut data = Vec::with_capacity(33);
    data.push(IX_COMMIT);
    data.extend_from_slice(&hash);
    Instruction {
        program_id: *program_id,
        accounts: vec![
            AccountMeta::new_readonly(*player, true),
            AccountMeta::new(*match_pda, false),
            AccountMeta::new_readonly(clock::ID, false),
        ],
        data,
    }
}

pub fn reveal(
    program_id: &Pubkey,
    player: &Pubkey,
    match_pda: &Pubkey,
    action: u8,
    dir: u8,
    salt: [u8; 32],
) -> Instruction {
    let mut data = Vec::with_capacity(35);
    data.push(IX_REVEAL);
    data.push(action);
    data.push(dir);
    data.extend_from_slice(&salt);
    Instruction {
        program_id: *program_id,
        accounts: vec![
            AccountMeta::new_readonly(*player, true),
            AccountMeta::new(*match_pda, false),
            AccountMeta::new_readonly(clock::ID, false),
        ],
        data,
    }
}

pub fn timeout(program_id: &Pubkey, match_pda: &Pubkey) -> Instruction {
    Instruction {
        program_id: *program_id,
        accounts: vec![
            AccountMeta::new(*match_pda, false),
            AccountMeta::new_readonly(clock::ID, false),
        ],
        data: vec![IX_TIMEOUT],
    }
}
