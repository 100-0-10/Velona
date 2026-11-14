param(
    [string]$PgHost = '127.0.0.1',
    [int]$Port = 7738,
    [string]$Database = 'velona_dev',
    [string]$ApplicationUser = 'velona_admin',
    [string]$Administrator = 'postgres',
    [string]$Psql = 'D:\Program Files\PostgreSQL\18\bin\psql.exe'
)
$ErrorActionPreference = 'Stop'
if ($Database -notmatch '^[a-z][a-z0-9_]{0,62}$' -or $ApplicationUser -notmatch '^[a-z][a-z0-9_]{0,62}$') { throw 'Use simple lowercase database and role names.' }
if (-not (Test-Path -LiteralPath $Psql)) { throw 'Set -Psql to the installed PostgreSQL psql.exe path.' }
$adminPassword = Read-Host 'Existing PostgreSQL administrator password' -AsSecureString
$applicationPassword = Read-Host 'New application account password (or existing password)' -AsSecureString
$adminCredential = [pscredential]::new($Administrator, $adminPassword)
$appCredential = [pscredential]::new($ApplicationUser, $applicationPassword)
try {
    $env:PGPASSWORD = $adminCredential.GetNetworkCredential().Password
    $env:VELONA_DB_NAME = $Database
    $env:VELONA_DB_USER = $ApplicationUser
    $env:VELONA_DB_PASSWORD = $appCredential.GetNetworkCredential().Password
    @'
\set ON_ERROR_STOP on
\getenv app_db VELONA_DB_NAME
\getenv app_user VELONA_DB_USER
\getenv app_password VELONA_DB_PASSWORD
SELECT format('CREATE ROLE %I LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION PASSWORD %L', :'app_user', :'app_password') WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = :'app_user') \gexec
SELECT format('CREATE DATABASE %I OWNER %I ENCODING %L TEMPLATE template0', :'app_db', :'app_user', 'UTF8') WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = :'app_db') \gexec
'@ | & $Psql --no-password --host=$PgHost --port=$Port --username=$Administrator --dbname=postgres --file=-
    if ($LASTEXITCODE -ne 0) { throw 'Could not provision the project database. Existing accounts/passwords were not changed.' }
    $env:PGPASSWORD = $env:VELONA_DB_PASSWORD
    & $Psql --no-password --host=$PgHost --port=$Port --username=$ApplicationUser --dbname=$Database --tuples-only --command='SELECT current_database(), current_user;'
    if ($LASTEXITCODE -ne 0) { throw 'Application login failed. Check the existing role password and database access.' }
    # Connection string quoting preserves semicolons/quotes in a password.
    $quotedPassword = '"' + $env:VELONA_DB_PASSWORD.Replace('"', '""') + '"'
    $connection = "Host=$PgHost;Port=$Port;Database=$Database;Username=$ApplicationUser;Password=$quotedPassword;Timeout=5;Command Timeout=5"
    @{ 'ConnectionStrings:Velona' = $connection } | ConvertTo-Json -Compress | dotnet user-secrets set --id 'Velona.Server.LocalDevelopment'
    if ($LASTEXITCODE -ne 0) { throw 'Database is ready but local .NET configuration could not be saved.' }
    Write-Output 'Velona database and local development connection are ready. No password was written to the repository.'
} finally {
    foreach ($name in @('PGPASSWORD','VELONA_DB_NAME','VELONA_DB_USER','VELONA_DB_PASSWORD')) { Remove-Item -LiteralPath ('Env:' + $name) -ErrorAction SilentlyContinue }
}
