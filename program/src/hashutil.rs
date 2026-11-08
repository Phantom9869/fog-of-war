use solana_program::hash::hashv;
use solana_program::pubkey::Pubkey;

/// Domain separator so a preimage cannot be replayed in another app or version.
pub const DOMAIN: &[u8] = b"fog-of-war-v1";

/// `sha256(domain || match || turn_le || seat || action || dir || salt)`.
pub fn commitment(
    match_id: &Pubkey,
    turn: u32,
    player_index: u8,
    action: u8,
    dir: u8,
    salt: &[u8; 32],
) -> [u8; 32] {
    let turn_bytes = turn.to_le_bytes();
    hashv(&[
        DOMAIN,
        match_id.as_ref(),
        &turn_bytes,
        &[player_index],
        &[action],
        &[dir],
        salt,
    ])
    .to_bytes()
}

#[cfg(test)]
mod tests {
    use super::*;
    use solana_program::pubkey::Pubkey;

    #[test]
    fn commitment_binds_every_field_and_writes_fixture() {
        let id = Pubkey::new_from_array([7u8; 32]);
        let salt = [9u8; 32];
        let base = commitment(&id, 3, 1, 0, 1, &salt);
        assert_ne!(
            base,
            commitment(&Pubkey::new_from_array([8u8; 32]), 3, 1, 0, 1, &salt)
        );
        assert_ne!(base, commitment(&id, 4, 1, 0, 1, &salt));
        assert_ne!(base, commitment(&id, 3, 0, 0, 1, &salt));
        assert_ne!(base, commitment(&id, 3, 1, 1, 1, &salt));
        assert_ne!(base, commitment(&id, 3, 1, 0, 2, &salt));
        let mut salt2 = salt;
        salt2[31] ^= 1;
        assert_ne!(base, commitment(&id, 3, 1, 0, 1, &salt2));

        let hex: String = base.iter().map(|b| format!("{b:02x}")).collect();
        let path = concat!(env!("CARGO_MANIFEST_DIR"), "/../fixtures/hash.json");
        let payload = format!(
            "{{\n  \"match\": \"{m}\",\n  \"turn\": 3,\n  \"player\": 1,\n  \"action\": 0,\n  \"dir\": 1,\n  \"salt\": \"{s}\",\n  \"hash\": \"{hex}\"\n}}\n",
            m = "07".repeat(32),
            s = "09".repeat(32),
        );
        if std::env::var("UPDATE_FIXTURES").is_ok() || !std::path::Path::new(path).exists() {
            std::fs::write(path, &payload).unwrap();
        }
        let parsed: serde_json::Value =
            serde_json::from_str(&std::fs::read_to_string(path).unwrap()).unwrap();
        assert_eq!(parsed["hash"].as_str().unwrap(), hex);
        assert_eq!(parsed["match"].as_str().unwrap(), "07".repeat(32));
    }
}
