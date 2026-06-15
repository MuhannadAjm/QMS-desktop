use argon2::{
    password_hash::{rand_core::OsRng, PasswordHash, PasswordHasher, PasswordVerifier, SaltString},
    Argon2,
};

pub fn hash_password(password: &str) -> Result<String, String> {
    let salt = SaltString::generate(&mut OsRng);
    Argon2::default()
        .hash_password(password.as_bytes(), &salt)
        .map(|h| h.to_string())
        .map_err(|e| format!("Password hashing failed: {}", e))
}

pub fn verify_password(password: &str, hash: &str) -> Result<bool, String> {
    let parsed =
        PasswordHash::new(hash).map_err(|e| format!("Invalid password hash: {}", e))?;
    Ok(Argon2::default()
        .verify_password(password.as_bytes(), &parsed)
        .is_ok())
}

pub fn validate_password_strength(password: &str) -> Result<(), String> {
    if password.len() < 8 {
        return Err("Password must be at least 8 characters".to_string());
    }
    if !password.chars().any(|c| c.is_uppercase()) {
        return Err("Password must contain at least one uppercase letter".to_string());
    }
    if !password.chars().any(|c| c.is_ascii_digit()) {
        return Err("Password must contain at least one digit".to_string());
    }
    Ok(())
}
