use solana_program::program_error::ProgramError;

/// Stable custom error codes. The web client maps these numbers.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
#[repr(u32)]
pub enum FogError {
    NotParticipant = 0,
    WrongPhase = 1,
    AlreadyCommitted = 2,
    AlreadyRevealed = 3,
    CommitmentMismatch = 4,
    IllegalMove = 5,
    DeadlineNotReached = 6,
    GameOver = 7,
    BadAction = 8,
    SamePlayer = 9,
    InvalidWindow = 10,
    BadAccount = 11,
    DeadlinePassed = 12,
}

impl From<FogError> for ProgramError {
    fn from(value: FogError) -> Self {
        ProgramError::Custom(value as u32)
    }
}
