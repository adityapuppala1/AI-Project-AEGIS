# Prints a new base64 32-byte AEGIS_CONNECTOR_KEY (AES-256-GCM master key for connector secrets).
# Store it outside the repository; losing it makes saved connector secrets unreadable.
$ErrorActionPreference = "Stop"
$bytes = New-Object byte[] 32
$rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
try { $rng.GetBytes($bytes) } finally { $rng.Dispose() }
[Convert]::ToBase64String($bytes)
