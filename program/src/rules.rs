//! Deterministic simultaneous resolution.
//!
//! Movement is applied first. If both fighters claim the same square, or they
//! would swap through each other, both stay. Strikes then land on the squares
//! adjacent to the *post-movement* position. A guard cancels every hit taken
//! that turn. There is no randomness.

use crate::error::FogError;

pub const MAP_W: u8 = 5;
pub const MAP_H: u8 = 5;
pub const DIR_N: u8 = 0;
pub const DIR_E: u8 = 1;
pub const DIR_S: u8 = 2;
pub const DIR_W: u8 = 3;
pub const DIR_NONE: u8 = 4;

pub const ACTION_MOVE: u8 = 0;
pub const ACTION_ATTACK: u8 = 1;
pub const ACTION_GUARD: u8 = 2;
pub const ACTION_UNSET: u8 = 255;

pub const WIN_NONE: u8 = 0;
pub const WIN_A: u8 = 1;
pub const WIN_B: u8 = 2;
pub const WIN_DRAW: u8 = 3;

pub const START_HP: u8 = 3;
pub const START_A: u8 = 10;
pub const START_B: u8 = 14;
pub const MAX_TURNS: u32 = 8;
pub const MIN_WINDOW: i64 = 15;
pub const MAX_WINDOW: i64 = 180;

pub const F_COLLISION: u16 = 1 << 0;
pub const F_CROSSING: u16 = 1 << 1;
pub const F_HIT_A: u16 = 1 << 4;
pub const F_HIT_B: u16 = 1 << 5;
pub const F_GUARD_A: u16 = 1 << 6;
pub const F_GUARD_B: u16 = 1 << 7;
pub const F_WHIFF_A: u16 = 1 << 8;
pub const F_WHIFF_B: u16 = 1 << 9;
pub const F_BLOCK_ON_A: u16 = 1 << 10;
pub const F_BLOCK_ON_B: u16 = 1 << 11;
pub const F_TIMEOUT: u16 = 1 << 12;
pub const F_SUDDEN: u16 = 1 << 13;

/// Pillars at (1,1), (3,1), (1,3), (3,3) on a 5×5 board. Index = y * 5 + x.
pub fn is_pillar(pos: u8) -> bool {
    matches!(pos, 6 | 8 | 16 | 18)
}

pub fn step(pos: u8, dir: u8) -> Option<u8> {
    if pos >= MAP_W * MAP_H {
        return None;
    }
    let x = pos % MAP_W;
    let y = pos / MAP_W;
    let (x, y) = match dir {
        DIR_N => (x, y.checked_sub(1)?),
        DIR_E => (x.checked_add(1)?, y),
        DIR_S => (x, y.checked_add(1)?),
        DIR_W => (x.checked_sub(1)?, y),
        _ => return None,
    };
    if x >= MAP_W || y >= MAP_H {
        return None;
    }
    Some(y * MAP_W + x)
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Action {
    pub kind: u8,
    pub dir: u8,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Fighter {
    pub pos: u8,
    pub hp: u8,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Resolution {
    pub pos_a: u8,
    pub pos_b: u8,
    pub hp_a: u8,
    pub hp_b: u8,
    pub damage_a: u8,
    pub damage_b: u8,
    pub flags: u16,
    pub winner: u8,
}

pub fn validate_action(pos: u8, action: Action) -> Result<(), FogError> {
    match action.kind {
        ACTION_MOVE => {
            if action.dir > DIR_W {
                return Err(FogError::BadAction);
            }
            let dest = step(pos, action.dir).ok_or(FogError::IllegalMove)?;
            if is_pillar(dest) {
                return Err(FogError::IllegalMove);
            }
            Ok(())
        }
        ACTION_ATTACK => {
            if action.dir > DIR_W {
                return Err(FogError::BadAction);
            }
            step(pos, action.dir).ok_or(FogError::IllegalMove)?;
            Ok(())
        }
        ACTION_GUARD => {
            if action.dir != DIR_NONE {
                return Err(FogError::BadAction);
            }
            Ok(())
        }
        _ => Err(FogError::BadAction),
    }
}

fn destination(pos: u8, action: Action) -> Result<u8, FogError> {
    validate_action(pos, action)?;
    if action.kind == ACTION_MOVE {
        step(pos, action.dir).ok_or(FogError::IllegalMove)
    } else {
        Ok(pos)
    }
}

pub fn resolve(
    a: Fighter,
    b: Fighter,
    action_a: Action,
    action_b: Action,
    turn: u32,
    max_turns: u32,
) -> Result<Resolution, FogError> {
    let dest_a = destination(a.pos, action_a)?;
    let dest_b = destination(b.pos, action_b)?;

    let mut flags = 0u16;
    let (pos_a, pos_b) = if dest_a == dest_b {
        flags |= F_COLLISION;
        (a.pos, b.pos)
    } else if dest_a == b.pos && dest_b == a.pos && dest_a != a.pos && dest_b != b.pos {
        flags |= F_CROSSING;
        (a.pos, b.pos)
    } else {
        (dest_a, dest_b)
    };

    if action_a.kind == ACTION_GUARD {
        flags |= F_GUARD_A;
    }
    if action_b.kind == ACTION_GUARD {
        flags |= F_GUARD_B;
    }

    let mut damage_a = 0u8;
    let mut damage_b = 0u8;
    apply_strike(
        pos_a,
        action_a,
        pos_b,
        action_b,
        &mut damage_b,
        &mut flags,
        F_WHIFF_A,
        F_HIT_B,
        F_BLOCK_ON_B,
        F_GUARD_B,
    );
    apply_strike(
        pos_b,
        action_b,
        pos_a,
        action_a,
        &mut damage_a,
        &mut flags,
        F_WHIFF_B,
        F_HIT_A,
        F_BLOCK_ON_A,
        F_GUARD_A,
    );

    let hp_a = a.hp.saturating_sub(damage_a);
    let hp_b = b.hp.saturating_sub(damage_b);
    let winner = if hp_a == 0 && hp_b == 0 {
        WIN_DRAW
    } else if hp_a == 0 {
        WIN_B
    } else if hp_b == 0 {
        WIN_A
    } else if turn >= max_turns {
        flags |= F_SUDDEN;
        if hp_a > hp_b {
            WIN_A
        } else if hp_b > hp_a {
            WIN_B
        } else {
            WIN_DRAW
        }
    } else {
        WIN_NONE
    };

    Ok(Resolution {
        pos_a,
        pos_b,
        hp_a,
        hp_b,
        damage_a,
        damage_b,
        flags,
        winner,
    })
}

fn apply_strike(
    from: u8,
    action: Action,
    defender_pos: u8,
    defender_action: Action,
    damage: &mut u8,
    flags: &mut u16,
    whiff: u16,
    hit: u16,
    blocked: u16,
    guard_flag: u16,
) {
    if action.kind != ACTION_ATTACK {
        return;
    }
    let Some(target) = step(from, action.dir) else {
        *flags |= whiff;
        return;
    };
    if target == defender_pos {
        if defender_action.kind == ACTION_GUARD {
            *flags |= blocked | guard_flag;
        } else {
            *damage = damage.saturating_add(1);
            *flags |= hit;
        }
    } else {
        *flags |= whiff;
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde::Deserialize;

    fn act(kind: u8, dir: u8) -> Action {
        Action { kind, dir }
    }

    fn go(
        pos_a: u8,
        hp_a: u8,
        pos_b: u8,
        hp_b: u8,
        aa: Action,
        ab: Action,
        turn: u32,
    ) -> Resolution {
        resolve(
            Fighter { pos: pos_a, hp: hp_a },
            Fighter { pos: pos_b, hp: hp_b },
            aa,
            ab,
            turn,
            MAX_TURNS,
        )
        .unwrap()
    }

    #[test]
    fn rejects_off_board_pillar_and_bad_guard() {
        assert_eq!(
            validate_action(START_A, act(ACTION_MOVE, DIR_W)),
            Err(FogError::IllegalMove)
        );
        assert_eq!(
            validate_action(11, act(ACTION_MOVE, DIR_N)),
            Err(FogError::IllegalMove)
        );
        assert_eq!(
            validate_action(START_A, act(ACTION_ATTACK, DIR_W)),
            Err(FogError::IllegalMove)
        );
        assert_eq!(
            validate_action(START_A, act(ACTION_GUARD, DIR_N)),
            Err(FogError::BadAction)
        );
        assert_eq!(
            validate_action(START_A, act(9, DIR_E)),
            Err(FogError::BadAction)
        );
        assert!(validate_action(11, act(ACTION_ATTACK, DIR_N)).is_ok());
    }

    #[test]
    fn shared_vectors_match() {
        #[derive(Deserialize)]
        struct VecCase {
            name: String,
            pos_a: u8,
            hp_a: u8,
            pos_b: u8,
            hp_b: u8,
            kind_a: u8,
            dir_a: u8,
            kind_b: u8,
            dir_b: u8,
            turn: u32,
            pos_a_out: u8,
            pos_b_out: u8,
            hp_a_out: u8,
            hp_b_out: u8,
            damage_a: u8,
            damage_b: u8,
            flags: u16,
            winner: u8,
        }
        let raw = include_str!("../../fixtures/vectors.json");
        let cases: Vec<VecCase> = serde_json::from_str(raw).unwrap();
        assert!(cases.len() >= 8, "expected a real vector suite");
        for case in cases {
            let got = go(
                case.pos_a,
                case.hp_a,
                case.pos_b,
                case.hp_b,
                act(case.kind_a, case.dir_a),
                act(case.kind_b, case.dir_b),
                case.turn,
            );
            assert_eq!(got.pos_a, case.pos_a_out, "{}", case.name);
            assert_eq!(got.pos_b, case.pos_b_out, "{}", case.name);
            assert_eq!(got.hp_a, case.hp_a_out, "{}", case.name);
            assert_eq!(got.hp_b, case.hp_b_out, "{}", case.name);
            assert_eq!(got.damage_a, case.damage_a, "{}", case.name);
            assert_eq!(got.damage_b, case.damage_b, "{}", case.name);
            assert_eq!(got.flags, case.flags, "{} flags {:016b}", case.name, got.flags);
            assert_eq!(got.winner, case.winner, "{}", case.name);
        }
    }
}
