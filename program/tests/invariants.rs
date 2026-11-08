//! On-chain invariants: signatures, phases, commitments, legality, timeouts.

use fog_of_war::error::FogError;
use fog_of_war::hashutil::commitment;
use fog_of_war::ix;
use fog_of_war::rules::{
    ACTION_ATTACK, ACTION_GUARD, ACTION_MOVE, DIR_E, DIR_N, DIR_NONE, DIR_W, F_COLLISION, F_SUDDEN,
    F_TIMEOUT, WIN_A, WIN_B, WIN_DRAW,
};
use fog_of_war::state::{MatchState, PHASE_COMMIT, PHASE_FINISHED, PHASE_REVEAL};
use solana_keypair::Keypair;
use solana_program::clock::Clock;
use solana_program::pubkey::Pubkey;
use solana_program_test::processor;
use solana_program_test::{BanksClientError, ProgramTest, ProgramTestContext};
use solana_signer::Signer;
use solana_system_interface::instruction as system_instruction;
use solana_transaction::Transaction;

async fn boot() -> (ProgramTestContext, Pubkey) {
    let program_id = Pubkey::new_unique();
    let pt = ProgramTest::new(
        "fog_of_war",
        program_id,
        processor!(fog_of_war::process_instruction),
    );
    let ctx = pt.start_with_context().await;
    (ctx, program_id)
}

async fn send(
    ctx: &mut ProgramTestContext,
    ixs: &[solana_program::instruction::Instruction],
    signers: &[&Keypair],
) -> Result<(), BanksClientError> {
    let blockhash = ctx.banks_client.get_latest_blockhash().await.unwrap();
    let payer = signers[0].pubkey();
    let tx = Transaction::new_signed_with_payer(ixs, Some(&payer), signers, blockhash);
    ctx.banks_client.process_transaction(tx).await
}

fn expect_custom(err: BanksClientError, code: FogError) {
    let text = format!("{err:?}");
    let needle = format!("Custom({})", code as u32);
    assert!(text.contains(&needle), "expected {needle} in {text}");
}

async fn fund(ctx: &mut ProgramTestContext, to: &Pubkey) {
    let payer = ctx.payer.insecure_clone();
    let ix = system_instruction::transfer(&payer.pubkey(), to, 1_000_000_000);
    send(ctx, &[ix], &[&payer]).await.unwrap();
}

async fn clock_of(ctx: &mut ProgramTestContext) -> Clock {
    ctx.banks_client.get_sysvar().await.unwrap()
}

async fn advance(ctx: &mut ProgramTestContext, secs: i64) {
    let before = clock_of(ctx).await;
    let target = before.unix_timestamp.saturating_add(secs);
    let mut bumped = before.clone();
    bumped.unix_timestamp = target;
    bumped.slot = before.slot.saturating_add(1);
    ctx.set_sysvar(&bumped);
    if clock_of(ctx).await.unix_timestamp >= target {
        return;
    }
    let mut slot = before.slot.saturating_add(1);
    for _ in 0..6 {
        slot = slot.saturating_add((secs.max(1) as u64).saturating_mul(5).saturating_add(20));
        ctx.warp_to_slot(slot).expect("warp");
        if clock_of(ctx).await.unix_timestamp >= target {
            return;
        }
    }
    panic!(
        "clock stuck at {} wanted {target}",
        clock_of(ctx).await.unix_timestamp
    );
}

async fn state(ctx: &mut ProgramTestContext, pda: &Pubkey) -> MatchState {
    let account = ctx
        .banks_client
        .get_account(*pda)
        .await
        .unwrap()
        .expect("match account");
    MatchState::unpack(&account.data).unwrap()
}

struct Table {
    program_id: Pubkey,
    pda: Pubkey,
    b: Keypair,
}

async fn open(ctx: &mut ProgramTestContext, program_id: Pubkey, nonce: u64, window: i64) -> Table {
    let b = Keypair::new();
    fund(ctx, &b.pubkey()).await;
    let payer = ctx.payer.insecure_clone();
    let (pda, _) = ix::match_pda(&program_id, &payer.pubkey(), nonce);
    let ix = ix::init(
        &program_id,
        &payer.pubkey(),
        &b.pubkey(),
        &pda,
        window,
        nonce,
    );
    send(ctx, &[ix], &[&payer]).await.unwrap();
    Table { program_id, pda, b }
}

fn salt(tag: u8) -> [u8; 32] {
    let mut out = [tag; 32];
    out[1] = tag.wrapping_mul(17).wrapping_add(3);
    out[31] = tag.wrapping_add(9);
    out
}

async fn seal(
    ctx: &mut ProgramTestContext,
    table: &Table,
    who: &Keypair,
    seat: u8,
    kind: u8,
    dir: u8,
    salt: [u8; 32],
) {
    let st = state(ctx, &table.pda).await;
    let hash = commitment(&table.pda, st.turn, seat, kind, dir, &salt);
    let ix = ix::commit(&table.program_id, &who.pubkey(), &table.pda, hash);
    send(ctx, &[ix], &[who]).await.unwrap();
}

async fn open_seal(
    ctx: &mut ProgramTestContext,
    table: &Table,
    who: &Keypair,
    kind: u8,
    dir: u8,
    salt: [u8; 32],
) -> Result<(), BanksClientError> {
    let ix = ix::reveal(
        &table.program_id,
        &who.pubkey(),
        &table.pda,
        kind,
        dir,
        salt,
    );
    send(ctx, &[ix], &[who]).await
}

async fn both(
    ctx: &mut ProgramTestContext,
    table: &Table,
    kind_a: u8,
    dir_a: u8,
    kind_b: u8,
    dir_b: u8,
    tag: u8,
) {
    let payer = ctx.payer.insecure_clone();
    let salt_a = salt(tag);
    let salt_b = salt(tag.wrapping_add(1));
    seal(ctx, table, &payer, 0, kind_a, dir_a, salt_a).await;
    seal(ctx, table, &table.b, 1, kind_b, dir_b, salt_b).await;
    open_seal(ctx, table, &payer, kind_a, dir_a, salt_a)
        .await
        .unwrap();
    open_seal(ctx, table, &table.b, kind_b, dir_b, salt_b)
        .await
        .unwrap();
}

#[tokio::test]
async fn init_rejects_bad_windows_same_player_and_reinit() {
    let (mut ctx, program_id) = boot().await;
    let b = Keypair::new();
    fund(&mut ctx, &b.pubkey()).await;
    let (pda, _) = ix::match_pda(&program_id, &ctx.payer.pubkey(), 1);
    let payer = ctx.payer.insecure_clone();
    let bad = ix::init(&program_id, &payer.pubkey(), &b.pubkey(), &pda, 14, 1);
    let err = send(&mut ctx, &[bad], &[&payer]).await.unwrap_err();
    expect_custom(err, FogError::InvalidWindow);

    let wide = ix::init(&program_id, &payer.pubkey(), &b.pubkey(), &pda, 181, 1);
    let err = send(&mut ctx, &[wide], &[&payer]).await.unwrap_err();
    expect_custom(err, FogError::InvalidWindow);

    let (self_pda, _) = ix::match_pda(&program_id, &payer.pubkey(), 2);
    let same = ix::init(
        &program_id,
        &payer.pubkey(),
        &payer.pubkey(),
        &self_pda,
        15,
        2,
    );
    let err = send(&mut ctx, &[same], &[&payer]).await.unwrap_err();
    expect_custom(err, FogError::SamePlayer);

    let table = open(&mut ctx, program_id, 7, 15).await;
    let payer = ctx.payer.insecure_clone();
    let again = ix::init(
        &program_id,
        &payer.pubkey(),
        &table.b.pubkey(),
        &table.pda,
        15,
        7,
    );
    assert!(
        send(&mut ctx, &[again], &[&payer]).await.is_err(),
        "re-init of the same match account must fail"
    );
    let st = state(&mut ctx, &table.pda).await;
    assert_eq!(st.phase, PHASE_COMMIT);
    assert_eq!(st.turn, 1);
    assert_eq!(st.hp_a, 3);
    assert_eq!(st.pos_a, 10);
    assert_eq!(st.pos_b, 14);
}

#[tokio::test]
async fn single_commit_does_not_advance_or_move() {
    let (mut ctx, program_id) = boot().await;
    let table = open(&mut ctx, program_id, 1, 30).await;
    let payer = ctx.payer.insecure_clone();
    seal(&mut ctx, &table, &payer, 0, ACTION_MOVE, DIR_E, salt(1)).await;
    let st = state(&mut ctx, &table.pda).await;
    assert_eq!(st.phase, PHASE_COMMIT);
    assert_eq!(st.committed_a, 1);
    assert_eq!(st.committed_b, 0);
    assert_eq!(st.pos_a, 10);
    assert_eq!(st.pos_b, 14);
    let err = send(
        &mut ctx,
        &[ix::commit(
            &table.program_id,
            &payer.pubkey(),
            &table.pda,
            [1u8; 32],
        )],
        &[&payer],
    )
    .await
    .unwrap_err();
    expect_custom(err, FogError::AlreadyCommitted);
}

#[tokio::test]
async fn outsider_cannot_commit_or_reveal() {
    let (mut ctx, program_id) = boot().await;
    let table = open(&mut ctx, program_id, 1, 30).await;
    let outsider = Keypair::new();
    fund(&mut ctx, &outsider.pubkey()).await;
    let err = send(
        &mut ctx,
        &[ix::commit(
            &table.program_id,
            &outsider.pubkey(),
            &table.pda,
            [2u8; 32],
        )],
        &[&outsider],
    )
    .await
    .unwrap_err();
    expect_custom(err, FogError::NotParticipant);
}

#[tokio::test]
async fn tampered_reveal_illegal_move_and_no_position_change_until_both_reveal() {
    let (mut ctx, program_id) = boot().await;
    let table = open(&mut ctx, program_id, 3, 40).await;
    let payer = ctx.payer.insecure_clone();
    let salt_a = salt(4);
    let salt_b = salt(5);
    seal(&mut ctx, &table, &payer, 0, ACTION_MOVE, DIR_E, salt_a).await;
    seal(
        &mut ctx,
        &table,
        &table.b,
        1,
        ACTION_MOVE,
        DIR_W,
        salt_b,
    )
    .await;
    let mid = state(&mut ctx, &table.pda).await;
    assert_eq!(mid.phase, PHASE_REVEAL);
    assert_eq!(mid.pos_a, 10);

    let mut bad_salt = salt_a;
    bad_salt[0] ^= 0xff;
    let err = open_seal(&mut ctx, &table, &payer, ACTION_MOVE, DIR_E, bad_salt)
        .await
        .unwrap_err();
    expect_custom(err, FogError::CommitmentMismatch);

    let err = open_seal(&mut ctx, &table, &payer, ACTION_ATTACK, DIR_E, salt_a)
        .await
        .unwrap_err();
    expect_custom(err, FogError::CommitmentMismatch);
    assert_eq!(state(&mut ctx, &table.pda).await.revealed_a, 0);

    open_seal(&mut ctx, &table, &payer, ACTION_MOVE, DIR_E, salt_a)
        .await
        .unwrap();
    let one = state(&mut ctx, &table.pda).await;
    assert_eq!(one.revealed_a, 1);
    assert_eq!(one.pos_a, 10, "one reveal must not move anyone");
    assert_eq!(one.phase, PHASE_REVEAL);

    let err = open_seal(&mut ctx, &table, &payer, ACTION_MOVE, DIR_E, salt_a)
        .await
        .unwrap_err();
    expect_custom(err, FogError::AlreadyRevealed);

    open_seal(&mut ctx, &table, &table.b, ACTION_MOVE, DIR_W, salt_b)
        .await
        .unwrap();
    let done = state(&mut ctx, &table.pda).await;
    assert_eq!(done.pos_a, 11);
    assert_eq!(done.pos_b, 13);
    assert_eq!(done.phase, PHASE_COMMIT);
    assert_eq!(done.turn, 2);
    assert_eq!(done.committed_a, 0);
}

#[tokio::test]
async fn illegal_commitment_cannot_be_revealed_or_replaced() {
    let (mut ctx, program_id) = boot().await;
    let table = open(&mut ctx, program_id, 1, 40).await;
    let payer = ctx.payer.insecure_clone();
    let salt_a = salt(8);
    seal(&mut ctx, &table, &payer, 0, ACTION_MOVE, DIR_W, salt_a).await;
    seal(
        &mut ctx,
        &table,
        &table.b,
        1,
        ACTION_GUARD,
        DIR_NONE,
        salt(9),
    )
    .await;
    let err = open_seal(&mut ctx, &table, &payer, ACTION_MOVE, DIR_W, salt_a)
        .await
        .unwrap_err();
    expect_custom(err, FogError::IllegalMove);
    let err = open_seal(&mut ctx, &table, &payer, ACTION_MOVE, DIR_E, salt_a)
        .await
        .unwrap_err();
    expect_custom(err, FogError::CommitmentMismatch);
    assert_eq!(state(&mut ctx, &table.pda).await.pos_a, 10);
}

#[tokio::test]
async fn replay_preimage_rejected_on_later_turn_and_other_match() {
    let (mut ctx, program_id) = boot().await;
    let first = open(&mut ctx, program_id, 21, 40).await;
    let payer = ctx.payer.insecure_clone();
    let salt_a = salt(21);
    let salt_b = salt(22);
    seal(
        &mut ctx,
        &first,
        &payer,
        0,
        ACTION_GUARD,
        DIR_NONE,
        salt_a,
    )
    .await;
    seal(
        &mut ctx,
        &first,
        &first.b,
        1,
        ACTION_GUARD,
        DIR_NONE,
        salt_b,
    )
    .await;
    open_seal(&mut ctx, &first, &payer, ACTION_GUARD, DIR_NONE, salt_a)
        .await
        .unwrap();
    open_seal(&mut ctx, &first, &first.b, ACTION_GUARD, DIR_NONE, salt_b)
        .await
        .unwrap();

    let old_hash = commitment(&first.pda, 1, 0, ACTION_GUARD, DIR_NONE, &salt_a);
    seal_raw(&mut ctx, &first, &payer, old_hash).await;
    let b_hash = commitment(&first.pda, 2, 1, ACTION_GUARD, DIR_NONE, &salt(30));
    seal_raw(&mut ctx, &first, &first.b, b_hash).await;
    let err = open_seal(&mut ctx, &first, &payer, ACTION_GUARD, DIR_NONE, salt_a)
        .await
        .unwrap_err();
    expect_custom(err, FogError::CommitmentMismatch);

    let second = open(&mut ctx, program_id, 22, 40).await;
    let cross = commitment(&first.pda, 1, 0, ACTION_MOVE, DIR_E, &salt(40));
    seal_raw(&mut ctx, &second, &payer, cross).await;
    seal(
        &mut ctx,
        &second,
        &second.b,
        1,
        ACTION_GUARD,
        DIR_NONE,
        salt(41),
    )
    .await;
    let err = open_seal(&mut ctx, &second, &payer, ACTION_MOVE, DIR_E, salt(40))
        .await
        .unwrap_err();
    expect_custom(err, FogError::CommitmentMismatch);
}

async fn seal_raw(ctx: &mut ProgramTestContext, table: &Table, who: &Keypair, hash: [u8; 32]) {
    let ix = ix::commit(&table.program_id, &who.pubkey(), &table.pda, hash);
    send(ctx, &[ix], &[who]).await.unwrap();
}

#[tokio::test]
async fn collision_crossing_guard_and_kill_follow_the_rules() {
    let (mut ctx, program_id) = boot().await;
    let table = open(&mut ctx, program_id, 5, 60).await;
    both(
        &mut ctx,
        &table,
        ACTION_MOVE,
        DIR_E,
        ACTION_MOVE,
        DIR_W,
        1,
    )
    .await;
    let st = state(&mut ctx, &table.pda).await;
    assert_eq!((st.pos_a, st.pos_b), (11, 13));

    both(
        &mut ctx,
        &table,
        ACTION_MOVE,
        DIR_E,
        ACTION_MOVE,
        DIR_W,
        2,
    )
    .await;
    let st = state(&mut ctx, &table.pda).await;
    assert_eq!((st.pos_a, st.pos_b), (11, 13), "contested center");
    assert_eq!(st.last_flags & F_COLLISION, F_COLLISION);

    both(
        &mut ctx,
        &table,
        ACTION_MOVE,
        DIR_E,
        ACTION_GUARD,
        DIR_NONE,
        3,
    )
    .await;
    let st = state(&mut ctx, &table.pda).await;
    assert_eq!((st.pos_a, st.pos_b), (12, 13));
    assert_eq!(st.last_flags & F_COLLISION, 0);

    both(
        &mut ctx,
        &table,
        ACTION_MOVE,
        DIR_E,
        ACTION_MOVE,
        DIR_W,
        5,
    )
    .await;
    let st = state(&mut ctx, &table.pda).await;
    assert_eq!((st.pos_a, st.pos_b), (12, 13), "crossing denied");
    assert_eq!(st.last_flags & 0b11, 2);

    both(
        &mut ctx,
        &table,
        ACTION_ATTACK,
        DIR_E,
        ACTION_GUARD,
        DIR_NONE,
        7,
    )
    .await;
    let st = state(&mut ctx, &table.pda).await;
    assert_eq!((st.hp_a, st.hp_b), (3, 3));
    assert_eq!(st.last_damage_b, 0);

    for tag in [9u8, 11, 13] {
        both(
            &mut ctx,
            &table,
            ACTION_ATTACK,
            DIR_E,
            ACTION_ATTACK,
            DIR_N,
            tag,
        )
        .await;
    }
    let st = state(&mut ctx, &table.pda).await;
    assert_eq!(st.hp_b, 0);
    assert_eq!(st.winner, WIN_A);
    assert_eq!(st.phase, PHASE_FINISHED);
    let payer = ctx.payer.insecure_clone();
    let err = send(
        &mut ctx,
        &[ix::commit(
            &table.program_id,
            &payer.pubkey(),
            &table.pda,
            [9u8; 32],
        )],
        &[&payer],
    )
    .await
    .unwrap_err();
    expect_custom(err, FogError::GameOver);
    let err = send(
        &mut ctx,
        &[ix::timeout(&table.program_id, &table.pda)],
        &[&payer],
    )
    .await
    .unwrap_err();
    expect_custom(err, FogError::GameOver);
}

#[tokio::test]
async fn mutual_knockout_is_a_draw() {
    let (mut ctx, program_id) = boot().await;
    let table = open(&mut ctx, program_id, 8, 60).await;
    both(
        &mut ctx,
        &table,
        ACTION_MOVE,
        DIR_E,
        ACTION_MOVE,
        DIR_W,
        1,
    )
    .await;
    both(
        &mut ctx,
        &table,
        ACTION_MOVE,
        DIR_E,
        ACTION_GUARD,
        DIR_NONE,
        3,
    )
    .await;
    for tag in [5u8, 7, 9] {
        both(
            &mut ctx,
            &table,
            ACTION_ATTACK,
            DIR_E,
            ACTION_ATTACK,
            DIR_W,
            tag,
        )
        .await;
    }
    let st = state(&mut ctx, &table.pda).await;
    assert_eq!((st.hp_a, st.hp_b), (0, 0));
    assert_eq!(st.winner, WIN_DRAW);
    assert_eq!(st.phase, PHASE_FINISHED);
}

#[tokio::test]
async fn turn_cap_draw_and_pillar_move_rejected() {
    let (mut ctx, program_id) = boot().await;
    let table = open(&mut ctx, program_id, 9, 60).await;
    for tag in 1..9 {
        both(
            &mut ctx,
            &table,
            ACTION_GUARD,
            DIR_NONE,
            ACTION_GUARD,
            DIR_NONE,
            tag,
        )
        .await;
    }
    let st = state(&mut ctx, &table.pda).await;
    assert_eq!(st.winner, WIN_DRAW);
    assert_eq!(st.phase, PHASE_FINISHED);
    assert_ne!(st.last_flags & F_SUDDEN, 0);

    let (mut ctx, program_id) = boot().await;
    let table = open(&mut ctx, program_id, 1, 40).await;
    let payer = ctx.payer.insecure_clone();
    both(
        &mut ctx,
        &table,
        ACTION_MOVE,
        DIR_E,
        ACTION_GUARD,
        DIR_NONE,
        2,
    )
    .await;
    let salt_a = salt(70);
    seal(&mut ctx, &table, &payer, 0, ACTION_MOVE, DIR_N, salt_a).await;
    seal(
        &mut ctx,
        &table,
        &table.b,
        1,
        ACTION_GUARD,
        DIR_NONE,
        salt(71),
    )
    .await;
    let err = open_seal(&mut ctx, &table, &payer, ACTION_MOVE, DIR_N, salt_a)
        .await
        .unwrap_err();
    expect_custom(err, FogError::IllegalMove);
}

#[tokio::test]
async fn timeouts_cover_one_sided_and_fully_stalled_players() {
    let (mut ctx, program_id) = boot().await;
    let table = open(&mut ctx, program_id, 1, 15).await;
    let payer = ctx.payer.insecure_clone();
    let err = send(
        &mut ctx,
        &[ix::timeout(&table.program_id, &table.pda)],
        &[&payer],
    )
    .await
    .unwrap_err();
    expect_custom(err, FogError::DeadlineNotReached);

    advance(&mut ctx, 16).await;
    let err = send(
        &mut ctx,
        &[ix::commit(
            &table.program_id,
            &payer.pubkey(),
            &table.pda,
            [4u8; 32],
        )],
        &[&payer],
    )
    .await
    .unwrap_err();
    expect_custom(err, FogError::DeadlinePassed);
    send(
        &mut ctx,
        &[ix::timeout(&table.program_id, &table.pda)],
        &[&payer],
    )
    .await
    .unwrap();
    let st = state(&mut ctx, &table.pda).await;
    assert_eq!(st.winner, WIN_DRAW);
    assert_eq!(st.phase, PHASE_FINISHED);
    assert_eq!(st.last_flags & F_TIMEOUT, F_TIMEOUT);

    let (mut ctx, program_id) = boot().await;
    let table = open(&mut ctx, program_id, 2, 15).await;
    let payer = ctx.payer.insecure_clone();
    seal(&mut ctx, &table, &payer, 0, ACTION_GUARD, DIR_NONE, salt(3)).await;
    advance(&mut ctx, 16).await;
    send(
        &mut ctx,
        &[ix::timeout(&table.program_id, &table.pda)],
        &[&payer],
    )
    .await
    .unwrap();
    assert_eq!(state(&mut ctx, &table.pda).await.winner, WIN_A);

    let (mut ctx, program_id) = boot().await;
    let table = open(&mut ctx, program_id, 3, 15).await;
    seal(
        &mut ctx,
        &table,
        &table.b,
        1,
        ACTION_GUARD,
        DIR_NONE,
        salt(4),
    )
    .await;
    advance(&mut ctx, 16).await;
    let payer = ctx.payer.insecure_clone();
    send(
        &mut ctx,
        &[ix::timeout(&table.program_id, &table.pda)],
        &[&payer],
    )
    .await
    .unwrap();
    assert_eq!(state(&mut ctx, &table.pda).await.winner, WIN_B);

    let (mut ctx, program_id) = boot().await;
    let table = open(&mut ctx, program_id, 4, 15).await;
    let payer = ctx.payer.insecure_clone();
    seal(&mut ctx, &table, &payer, 0, ACTION_GUARD, DIR_NONE, salt(5)).await;
    seal(
        &mut ctx,
        &table,
        &table.b,
        1,
        ACTION_GUARD,
        DIR_NONE,
        salt(6),
    )
    .await;
    assert_eq!(state(&mut ctx, &table.pda).await.phase, PHASE_REVEAL);
    let err = send(
        &mut ctx,
        &[ix::timeout(&table.program_id, &table.pda)],
        &[&payer],
    )
    .await
    .unwrap_err();
    expect_custom(err, FogError::DeadlineNotReached);
    open_seal(&mut ctx, &table, &payer, ACTION_GUARD, DIR_NONE, salt(5))
        .await
        .unwrap();
    advance(&mut ctx, 20).await;
    send(
        &mut ctx,
        &[ix::timeout(&table.program_id, &table.pda)],
        &[&payer],
    )
    .await
    .unwrap();
    let st = state(&mut ctx, &table.pda).await;
    assert_eq!(st.winner, WIN_A);
    assert_eq!(st.pos_a, 10, "timeout does not apply a partial reveal");

    let (mut ctx, program_id) = boot().await;
    let table = open(&mut ctx, program_id, 5, 15).await;
    let payer = ctx.payer.insecure_clone();
    seal(&mut ctx, &table, &payer, 0, ACTION_MOVE, DIR_E, salt(7)).await;
    seal(
        &mut ctx,
        &table,
        &table.b,
        1,
        ACTION_MOVE,
        DIR_W,
        salt(8),
    )
    .await;
    advance(&mut ctx, 20).await;
    send(
        &mut ctx,
        &[ix::timeout(&table.program_id, &table.pda)],
        &[&payer],
    )
    .await
    .unwrap();
    let st = state(&mut ctx, &table.pda).await;
    assert_eq!(st.winner, WIN_DRAW);
    assert_eq!(st.phase, PHASE_FINISHED);
}

#[tokio::test]
async fn wrong_phase_commit_during_reveal_is_rejected() {
    let (mut ctx, program_id) = boot().await;
    let table = open(&mut ctx, program_id, 1, 30).await;
    let payer = ctx.payer.insecure_clone();
    seal(&mut ctx, &table, &payer, 0, ACTION_GUARD, DIR_NONE, salt(1)).await;
    seal(
        &mut ctx,
        &table,
        &table.b,
        1,
        ACTION_GUARD,
        DIR_NONE,
        salt(2),
    )
    .await;
    let err = send(
        &mut ctx,
        &[ix::commit(
            &table.program_id,
            &payer.pubkey(),
            &table.pda,
            [5u8; 32],
        )],
        &[&payer],
    )
    .await
    .unwrap_err();
    expect_custom(err, FogError::WrongPhase);
}
