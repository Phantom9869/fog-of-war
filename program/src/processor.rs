use solana_program::account_info::AccountInfo;
use solana_program::entrypoint::ProgramResult;
use solana_program::msg;
use solana_program::program::invoke_signed;
use solana_program::program_error::ProgramError;
use solana_program::pubkey::Pubkey;
use solana_program::sysvar::clock::{self, Clock};
use solana_program::sysvar::rent::{self, Rent};
use solana_program::sysvar::SysvarSerialize;
use solana_system_interface::instruction as system_instruction;

use crate::error::FogError;
use crate::hashutil::commitment;
use crate::rules::{self, Action, Fighter, F_TIMEOUT};
use crate::state::{
    MatchState, IX_COMMIT, IX_INIT, IX_REVEAL, IX_TIMEOUT, PHASE_COMMIT, PHASE_FINISHED,
    PHASE_REVEAL, SIZE,
};

pub fn process(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
    data: &[u8],
) -> ProgramResult {
    if data.is_empty() {
        return Err(ProgramError::InvalidInstructionData);
    }
    match data[0] {
        IX_INIT => {
            if data.len() != 49 {
                return Err(ProgramError::InvalidInstructionData);
            }
            let mut raw = [0u8; 32];
            raw.copy_from_slice(&data[1..33]);
            let player_b = Pubkey::new_from_array(raw);
            let window = i64::from_le_bytes(data[33..41].try_into().unwrap());
            let nonce = u64::from_le_bytes(data[41..49].try_into().unwrap());
            init(program_id, accounts, player_b, window, nonce)
        }
        IX_COMMIT => {
            if data.len() != 33 {
                return Err(ProgramError::InvalidInstructionData);
            }
            let mut hash = [0u8; 32];
            hash.copy_from_slice(&data[1..33]);
            commit(program_id, accounts, hash)
        }
        IX_REVEAL => {
            if data.len() != 35 {
                return Err(ProgramError::InvalidInstructionData);
            }
            let action = data[1];
            let dir = data[2];
            let mut salt = [0u8; 32];
            salt.copy_from_slice(&data[3..35]);
            reveal(program_id, accounts, action, dir, salt)
        }
        IX_TIMEOUT => {
            if data.len() != 1 {
                return Err(ProgramError::InvalidInstructionData);
            }
            timeout(program_id, accounts)
        }
        _ => Err(ProgramError::InvalidInstructionData),
    }
}

fn init(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
    player_b: Pubkey,
    window: i64,
    nonce: u64,
) -> ProgramResult {
    if accounts.len() < 5 {
        return Err(ProgramError::NotEnoughAccountKeys);
    }
    let player_a = &accounts[0];
    let match_ai = &accounts[1];
    let system = &accounts[2];
    let rent_ai = &accounts[3];
    let clock_ai = &accounts[4];
    if !player_a.is_signer {
        return Err(ProgramError::MissingRequiredSignature);
    }
    if !player_a.is_writable || !match_ai.is_writable {
        return Err(ProgramError::InvalidAccountData);
    }
    if !solana_system_interface::program::check_id(system.key) {
        return Err(ProgramError::IncorrectProgramId);
    }
    if player_a.key == &player_b || player_b == Pubkey::default() {
        return Err(FogError::SamePlayer.into());
    }
    if !(rules::MIN_WINDOW..=rules::MAX_WINDOW).contains(&window) {
        return Err(FogError::InvalidWindow.into());
    }

    let nonce_bytes = nonce.to_le_bytes();
    let (pda, bump) = Pubkey::find_program_address(
        &[b"match", player_a.key.as_ref(), &nonce_bytes],
        program_id,
    );
    if match_ai.key != &pda {
        return Err(ProgramError::InvalidSeeds);
    }

    let rent = load_rent(rent_ai)?;
    let lamports = rent.minimum_balance(SIZE);
    let bump_seed = [bump];
    invoke_signed(
        &system_instruction::create_account(
            player_a.key,
            match_ai.key,
            lamports,
            SIZE as u64,
            program_id,
        ),
        &[player_a.clone(), match_ai.clone()],
        &[&[b"match", player_a.key.as_ref(), &nonce_bytes, &bump_seed]],
    )?;

    let clock = load_clock(clock_ai)?;
    let deadline = clock.unix_timestamp.saturating_add(window);
    let state = MatchState::new(*player_a.key, player_b, bump, nonce, deadline, window);
    save(match_ai, &state)?;
    msg!("fog init");
    Ok(())
}

fn commit(program_id: &Pubkey, accounts: &[AccountInfo], hash: [u8; 32]) -> ProgramResult {
    if accounts.len() < 3 {
        return Err(ProgramError::NotEnoughAccountKeys);
    }
    let player = &accounts[0];
    let match_ai = &accounts[1];
    let clock = load_clock(&accounts[2])?;
    if !player.is_signer {
        return Err(ProgramError::MissingRequiredSignature);
    }
    let mut st = load(program_id, match_ai)?;
    ensure_open(&st, &clock, PHASE_COMMIT)?;
    let seat = seat_of(&st, player.key)?;
    if committed(&st, seat) {
        return Err(FogError::AlreadyCommitted.into());
    }
    if seat == 0 {
        st.commit_a = hash;
        st.committed_a = 1;
    } else {
        st.commit_b = hash;
        st.committed_b = 1;
    }
    if st.committed_a == 1 && st.committed_b == 1 {
        st.phase = PHASE_REVEAL;
        st.deadline = clock.unix_timestamp.saturating_add(st.window);
        msg!("fog both sealed");
    } else {
        msg!("fog sealed");
    }
    save(match_ai, &st)
}

fn reveal(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
    action: u8,
    dir: u8,
    salt: [u8; 32],
) -> ProgramResult {
    if accounts.len() < 3 {
        return Err(ProgramError::NotEnoughAccountKeys);
    }
    let player = &accounts[0];
    let match_ai = &accounts[1];
    let clock = load_clock(&accounts[2])?;
    if !player.is_signer {
        return Err(ProgramError::MissingRequiredSignature);
    }
    let mut st = load(program_id, match_ai)?;
    ensure_open(&st, &clock, PHASE_REVEAL)?;
    let seat = seat_of(&st, player.key)?;
    if !committed(&st, seat) {
        return Err(FogError::WrongPhase.into());
    }
    if revealed(&st, seat) {
        return Err(FogError::AlreadyRevealed.into());
    }
    let stored = if seat == 0 { st.commit_a } else { st.commit_b };
    let expected = commitment(match_ai.key, st.turn, seat, action, dir, &salt);
    if expected != stored {
        return Err(FogError::CommitmentMismatch.into());
    }
    let pos = if seat == 0 { st.pos_a } else { st.pos_b };
    rules::validate_action(pos, Action { kind: action, dir })?;

    if seat == 0 {
        st.action_a = action;
        st.dir_a = dir;
        st.revealed_a = 1;
    } else {
        st.action_b = action;
        st.dir_b = dir;
        st.revealed_b = 1;
    }

    if st.revealed_a == 1 && st.revealed_b == 1 {
        let out = rules::resolve(
            Fighter {
                pos: st.pos_a,
                hp: st.hp_a,
            },
            Fighter {
                pos: st.pos_b,
                hp: st.hp_b,
            },
            Action {
                kind: st.action_a,
                dir: st.dir_a,
            },
            Action {
                kind: st.action_b,
                dir: st.dir_b,
            },
            st.turn,
            st.max_turns,
        )?;
        apply_resolution(&mut st, out, clock.unix_timestamp);
        msg!("fog resolved");
    } else {
        msg!("fog revealed");
    }
    save(match_ai, &st)
}

fn timeout(program_id: &Pubkey, accounts: &[AccountInfo]) -> ProgramResult {
    if accounts.len() < 2 {
        return Err(ProgramError::NotEnoughAccountKeys);
    }
    let match_ai = &accounts[0];
    let clock = load_clock(&accounts[1])?;
    if !match_ai.is_writable {
        return Err(ProgramError::InvalidAccountData);
    }
    let mut st = load(program_id, match_ai)?;
    if st.phase == PHASE_FINISHED {
        return Err(FogError::GameOver.into());
    }
    if clock.unix_timestamp < st.deadline {
        return Err(FogError::DeadlineNotReached.into());
    }
    let winner = match st.phase {
        PHASE_COMMIT => match (st.committed_a == 1, st.committed_b == 1) {
            (true, false) => rules::WIN_A,
            (false, true) => rules::WIN_B,
            (false, false) => rules::WIN_DRAW,
            (true, true) => return Err(FogError::WrongPhase.into()),
        },
        PHASE_REVEAL => match (st.revealed_a == 1, st.revealed_b == 1) {
            (true, false) => rules::WIN_A,
            (false, true) => rules::WIN_B,
            (false, false) => rules::WIN_DRAW,
            (true, true) => return Err(FogError::WrongPhase.into()),
        },
        _ => return Err(FogError::WrongPhase.into()),
    };
    st.last_prev_pos_a = st.pos_a;
    st.last_prev_pos_b = st.pos_b;
    st.last_hp_a_before = st.hp_a;
    st.last_hp_b_before = st.hp_b;
    st.last_damage_a = 0;
    st.last_damage_b = 0;
    st.last_flags = F_TIMEOUT;
    st.last_action_a = st.action_a;
    st.last_dir_a = st.dir_a;
    st.last_action_b = st.action_b;
    st.last_dir_b = st.dir_b;
    st.last_turn = st.turn;
    st.winner = winner;
    st.phase = PHASE_FINISHED;
    st.deadline = 0;
    msg!("fog timeout");
    save(match_ai, &st)
}

fn apply_resolution(st: &mut MatchState, out: rules::Resolution, now: i64) {
    st.last_prev_pos_a = st.pos_a;
    st.last_prev_pos_b = st.pos_b;
    st.last_hp_a_before = st.hp_a;
    st.last_hp_b_before = st.hp_b;
    st.last_action_a = st.action_a;
    st.last_dir_a = st.dir_a;
    st.last_action_b = st.action_b;
    st.last_dir_b = st.dir_b;
    st.last_damage_a = out.damage_a;
    st.last_damage_b = out.damage_b;
    st.last_flags = out.flags;
    st.last_turn = st.turn;
    st.pos_a = out.pos_a;
    st.pos_b = out.pos_b;
    st.hp_a = out.hp_a;
    st.hp_b = out.hp_b;
    if out.winner != rules::WIN_NONE {
        st.winner = out.winner;
        st.phase = PHASE_FINISHED;
        st.deadline = 0;
    } else {
        st.turn = st.turn.saturating_add(1);
        st.phase = PHASE_COMMIT;
        st.committed_a = 0;
        st.committed_b = 0;
        st.revealed_a = 0;
        st.revealed_b = 0;
        st.commit_a = [0; 32];
        st.commit_b = [0; 32];
        st.action_a = rules::ACTION_UNSET;
        st.dir_a = 255;
        st.action_b = rules::ACTION_UNSET;
        st.dir_b = 255;
        st.deadline = now.saturating_add(st.window);
        st.winner = rules::WIN_NONE;
    }
}

fn ensure_open(st: &MatchState, clock: &Clock, phase: u8) -> ProgramResult {
    if st.phase == PHASE_FINISHED {
        return Err(FogError::GameOver.into());
    }
    if st.phase != phase {
        return Err(FogError::WrongPhase.into());
    }
    if clock.unix_timestamp >= st.deadline {
        return Err(FogError::DeadlinePassed.into());
    }
    Ok(())
}

fn seat_of(st: &MatchState, key: &Pubkey) -> Result<u8, ProgramError> {
    if key == &st.player_a {
        Ok(0)
    } else if key == &st.player_b {
        Ok(1)
    } else {
        Err(FogError::NotParticipant.into())
    }
}

fn committed(st: &MatchState, seat: u8) -> bool {
    if seat == 0 {
        st.committed_a == 1
    } else {
        st.committed_b == 1
    }
}

fn revealed(st: &MatchState, seat: u8) -> bool {
    if seat == 0 {
        st.revealed_a == 1
    } else {
        st.revealed_b == 1
    }
}

fn load_clock(ai: &AccountInfo) -> Result<Clock, ProgramError> {
    if !clock::check_id(ai.key) {
        return Err(ProgramError::InvalidArgument);
    }
    Clock::from_account_info(ai)
}

fn load_rent(ai: &AccountInfo) -> Result<Rent, ProgramError> {
    if !rent::check_id(ai.key) {
        return Err(ProgramError::InvalidArgument);
    }
    Rent::from_account_info(ai)
}

fn load(program_id: &Pubkey, ai: &AccountInfo) -> Result<MatchState, ProgramError> {
    if ai.owner != program_id {
        return Err(FogError::BadAccount.into());
    }
    if !ai.is_writable {
        return Err(ProgramError::InvalidAccountData);
    }
    MatchState::unpack(&ai.data.borrow())
}

fn save(ai: &AccountInfo, st: &MatchState) -> ProgramResult {
    let mut data = ai.data.borrow_mut();
    st.pack(&mut data)
}

