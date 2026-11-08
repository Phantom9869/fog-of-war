use solana_program::program_error::ProgramError;
use solana_program::pubkey::Pubkey;

use crate::rules::{
    ACTION_UNSET, DIR_NONE, MAX_TURNS, START_A, START_B, START_HP, WIN_NONE,
};

pub const SIZE: usize = 256;
pub const MAGIC: &[u8; 8] = b"FOGWAR01";

pub const PHASE_COMMIT: u8 = 0;
pub const PHASE_REVEAL: u8 = 1;
pub const PHASE_FINISHED: u8 = 2;

pub const IX_INIT: u8 = 0;
pub const IX_COMMIT: u8 = 1;
pub const IX_REVEAL: u8 = 2;
pub const IX_TIMEOUT: u8 = 3;

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct MatchState {
    pub player_a: Pubkey,
    pub player_b: Pubkey,
    pub bump: u8,
    pub phase: u8,
    pub hp_a: u8,
    pub hp_b: u8,
    pub pos_a: u8,
    pub pos_b: u8,
    pub committed_a: u8,
    pub committed_b: u8,
    pub revealed_a: u8,
    pub revealed_b: u8,
    pub action_a: u8,
    pub dir_a: u8,
    pub action_b: u8,
    pub dir_b: u8,
    pub winner: u8,
    pub turn: u32,
    pub max_turns: u32,
    pub commit_a: [u8; 32],
    pub commit_b: [u8; 32],
    pub deadline: i64,
    pub window: i64,
    pub nonce: u64,
    pub last_prev_pos_a: u8,
    pub last_prev_pos_b: u8,
    pub last_damage_a: u8,
    pub last_damage_b: u8,
    pub last_flags: u16,
    pub last_action_a: u8,
    pub last_dir_a: u8,
    pub last_action_b: u8,
    pub last_dir_b: u8,
    pub last_hp_a_before: u8,
    pub last_hp_b_before: u8,
    pub last_turn: u32,
}

impl MatchState {
    pub fn new(
        player_a: Pubkey,
        player_b: Pubkey,
        bump: u8,
        nonce: u64,
        deadline: i64,
        window: i64,
    ) -> Self {
        Self {
            player_a,
            player_b,
            bump,
            phase: PHASE_COMMIT,
            hp_a: START_HP,
            hp_b: START_HP,
            pos_a: START_A,
            pos_b: START_B,
            committed_a: 0,
            committed_b: 0,
            revealed_a: 0,
            revealed_b: 0,
            action_a: ACTION_UNSET,
            dir_a: 255,
            action_b: ACTION_UNSET,
            dir_b: 255,
            winner: WIN_NONE,
            turn: 1,
            max_turns: MAX_TURNS,
            commit_a: [0; 32],
            commit_b: [0; 32],
            deadline,
            window,
            nonce,
            last_prev_pos_a: START_A,
            last_prev_pos_b: START_B,
            last_damage_a: 0,
            last_damage_b: 0,
            last_flags: 0,
            last_action_a: ACTION_UNSET,
            last_dir_a: DIR_NONE,
            last_action_b: ACTION_UNSET,
            last_dir_b: DIR_NONE,
            last_hp_a_before: START_HP,
            last_hp_b_before: START_HP,
            last_turn: 0,
        }
    }

    pub fn pack(&self, dst: &mut [u8]) -> Result<(), ProgramError> {
        if dst.len() < SIZE {
            return Err(ProgramError::AccountDataTooSmall);
        }
        dst[..SIZE].fill(0);
        let mut w = W { buf: dst, i: 0 };
        w.bytes(MAGIC);
        w.bytes(&self.player_a.to_bytes());
        w.bytes(&self.player_b.to_bytes());
        w.u8(self.bump);
        w.u8(self.phase);
        w.u8(self.hp_a);
        w.u8(self.hp_b);
        w.u8(self.pos_a);
        w.u8(self.pos_b);
        w.u8(self.committed_a);
        w.u8(self.committed_b);
        w.u8(self.revealed_a);
        w.u8(self.revealed_b);
        w.u8(self.action_a);
        w.u8(self.dir_a);
        w.u8(self.action_b);
        w.u8(self.dir_b);
        w.u8(self.winner);
        w.u8(0);
        w.u32(self.turn);
        w.u32(self.max_turns);
        w.bytes(&self.commit_a);
        w.bytes(&self.commit_b);
        w.i64(self.deadline);
        w.i64(self.window);
        w.u64(self.nonce);
        w.u8(self.last_prev_pos_a);
        w.u8(self.last_prev_pos_b);
        w.u8(self.last_damage_a);
        w.u8(self.last_damage_b);
        w.u16(self.last_flags);
        w.u8(self.last_action_a);
        w.u8(self.last_dir_a);
        w.u8(self.last_action_b);
        w.u8(self.last_dir_b);
        w.u8(self.last_hp_a_before);
        w.u8(self.last_hp_b_before);
        w.u32(self.last_turn);
        debug_assert_eq!(w.i, 200);
        Ok(())
    }

    pub fn unpack(src: &[u8]) -> Result<Self, ProgramError> {
        if src.len() < SIZE {
            return Err(ProgramError::InvalidAccountData);
        }
        let mut r = R { buf: src, i: 0 };
        let magic = r.bytes(8)?;
        if magic != MAGIC {
            return Err(ProgramError::InvalidAccountData);
        }
        Ok(Self {
            player_a: r.pubkey()?,
            player_b: r.pubkey()?,
            bump: r.u8()?,
            phase: r.u8()?,
            hp_a: r.u8()?,
            hp_b: r.u8()?,
            pos_a: r.u8()?,
            pos_b: r.u8()?,
            committed_a: r.u8()?,
            committed_b: r.u8()?,
            revealed_a: r.u8()?,
            revealed_b: r.u8()?,
            action_a: r.u8()?,
            dir_a: r.u8()?,
            action_b: r.u8()?,
            dir_b: r.u8()?,
            winner: r.u8()?,
            turn: {
                let _pad = r.u8()?;
                r.u32()?
            },
            max_turns: r.u32()?,
            commit_a: r.arr32()?,
            commit_b: r.arr32()?,
            deadline: r.i64()?,
            window: r.i64()?,
            nonce: r.u64()?,
            last_prev_pos_a: r.u8()?,
            last_prev_pos_b: r.u8()?,
            last_damage_a: r.u8()?,
            last_damage_b: r.u8()?,
            last_flags: r.u16()?,
            last_action_a: r.u8()?,
            last_dir_a: r.u8()?,
            last_action_b: r.u8()?,
            last_dir_b: r.u8()?,
            last_hp_a_before: r.u8()?,
            last_hp_b_before: r.u8()?,
            last_turn: r.u32()?,
        })
    }
}

struct W<'a> {
    buf: &'a mut [u8],
    i: usize,
}

impl W<'_> {
    fn bytes(&mut self, src: &[u8]) {
        self.buf[self.i..self.i + src.len()].copy_from_slice(src);
        self.i += src.len();
    }
    fn u8(&mut self, v: u8) {
        self.buf[self.i] = v;
        self.i += 1;
    }
    fn u16(&mut self, v: u16) {
        self.bytes(&v.to_le_bytes());
    }
    fn u32(&mut self, v: u32) {
        self.bytes(&v.to_le_bytes());
    }
    fn u64(&mut self, v: u64) {
        self.bytes(&v.to_le_bytes());
    }
    fn i64(&mut self, v: i64) {
        self.bytes(&v.to_le_bytes());
    }
}

struct R<'a> {
    buf: &'a [u8],
    i: usize,
}

impl<'a> R<'a> {
    fn bytes(&mut self, n: usize) -> Result<&'a [u8], ProgramError> {
        let end = self
            .i
            .checked_add(n)
            .ok_or(ProgramError::InvalidAccountData)?;
        if end > self.buf.len() {
            return Err(ProgramError::InvalidAccountData);
        }
        let slice = &self.buf[self.i..end];
        self.i = end;
        Ok(slice)
    }
    fn u8(&mut self) -> Result<u8, ProgramError> {
        Ok(self.bytes(1)?[0])
    }
    fn u16(&mut self) -> Result<u16, ProgramError> {
        let mut b = [0u8; 2];
        b.copy_from_slice(self.bytes(2)?);
        Ok(u16::from_le_bytes(b))
    }
    fn u32(&mut self) -> Result<u32, ProgramError> {
        let mut b = [0u8; 4];
        b.copy_from_slice(self.bytes(4)?);
        Ok(u32::from_le_bytes(b))
    }
    fn u64(&mut self) -> Result<u64, ProgramError> {
        let mut b = [0u8; 8];
        b.copy_from_slice(self.bytes(8)?);
        Ok(u64::from_le_bytes(b))
    }
    fn i64(&mut self) -> Result<i64, ProgramError> {
        Ok(self.u64()? as i64)
    }
    fn arr32(&mut self) -> Result<[u8; 32], ProgramError> {
        let mut b = [0u8; 32];
        b.copy_from_slice(self.bytes(32)?);
        Ok(b)
    }
    fn pubkey(&mut self) -> Result<Pubkey, ProgramError> {
        Ok(Pubkey::new_from_array(self.arr32()?))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn pack_roundtrip_and_offsets() {
        let a = Pubkey::new_from_array([3u8; 32]);
        let b = Pubkey::new_from_array([9u8; 32]);
        let mut st = MatchState::new(a, b, 254, 99, 1_700_000_000, 45);
        st.hp_a = 2;
        st.pos_b = 13;
        st.commit_a = [7u8; 32];
        st.last_flags = 0b1010;
        st.turn = 4;
        let mut buf = [0u8; SIZE];
        st.pack(&mut buf).unwrap();
        assert_eq!(&buf[0..8], b"FOGWAR01");
        assert_eq!(&buf[8..40], &[3u8; 32]);
        assert_eq!(&buf[40..72], &[9u8; 32]);
        assert_eq!(buf[74], 2);
        assert_eq!(buf[77], 13);
        assert_eq!(u32::from_le_bytes(buf[88..92].try_into().unwrap()), 4);
        let back = MatchState::unpack(&buf).unwrap();
        assert_eq!(back, st);
        assert!(MatchState::unpack(&[0u8; 10]).is_err());
        buf[0] = b'X';
        assert!(MatchState::unpack(&buf).is_err());
    }
}
