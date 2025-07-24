# --- User Input ---
Write-Host "🚀 Sentinel Language Setup" -ForegroundColor Green
Write-Host "This script will help you add a new language to Sentinel."
Write-Host ""

$langName = Read-Host -Prompt "Language Name (lowercase, no spaces, e.g., 'ruby')"
$displayName = Read-Host -Prompt "Display Name (e.g., 'Ruby')"
$extension = Read-Host -Prompt "File Extension (e.g., '.rb')"
$command = Read-Host -Prompt "Execution Command (e.g., 'ruby')"
$argsStr = Read-Host -Prompt "Execution Arguments, comma-separated (e.g., '{file}')"
$dockerImage = Read-Host -Prompt "Docker Base Image (e.g., 'ruby:3.2-alpine')"
$compileCommand = Read-Host -Prompt "Compilation Command (optional, press Enter to skip)"

$compileArgsStr = ""
if ($compileCommand) {
    $compileArgsStr = Read-Host -Prompt "Compilation Arguments, comma-separated (e.g., '{file},-o,{dir}/program')"
}

# --- File Paths ---
$configDir = "sentinel/config/languages"
$dockerDir = "sentinel/dockerfiles"
$configFile = Join-Path $configDir "$($langName).json"
$dockerFile = Join-Path $dockerDir "Dockerfile.$($langName)"

# Create directories if they don't exist
if (-not (Test-Path $configDir)) { New-Item -ItemType Directory -Force -Path $configDir }
if (-not (Test-Path $dockerDir)) { New-Item -ItemType Directory -Force -Path $dockerDir }

# --- Create Language JSON Config ---
Write-Host "`n🔧 Creating language configuration..." -ForegroundColor Cyan

$argsArray = $argsStr -split ',' | ForEach-Object { $_.Trim() }

$langConfig = [PSCustomObject]@{
    name = $langName
    displayName = $displayName
    extension = $extension
    command = $command
    args = $argsArray
    timeout = 30000
}

if ($compileCommand) {
    $compileArgsArray = $compileArgsStr -split ',' | ForEach-Object { $_.Trim() }
    $compileSection = [PSCustomObject]@{
        command = $compileCommand
        args = $compileArgsArray
        timeout = 10000
    }
    Add-Member -InputObject $langConfig -MemberType NoteProperty -Name "compile" -Value $compileSection
}

$langConfig | ConvertTo-Json -Depth 3 | Set-Content -Path $configFile

# --- Create Dockerfile ---
Write-Host "🐳 Creating Dockerfile..." -ForegroundColor Cyan

$dockerfileContent = @"
# Executor for $($displayName)

# --- Builder Stage ---
FROM node:22-alpine AS builder

WORKDIR /usr/src/app

COPY package*.json ./
COPY tsconfig.json ./

RUN npm ci

COPY src/ ./src/
COPY config/ ./config/

RUN npm run build

# --- Production Stage ---
FROM $($dockerImage)

# Install Node.js for the executor runtime
# You may need to change this command based on the base image's package manager (e.g., apt-get, dnf)
RUN apk add --no-cache nodejs npm

WORKDIR /usr/src/app

COPY package*.json ./

RUN npm ci --only=production

# Copy built application from the builder stage
COPY --from=builder /usr/src/app/dist ./dist/
# We copy the entire config directory so the new language is available
COPY --from=builder /usr/src/app/config ./config/

RUN mkdir -p /tmp/code-execution

# Create a non-root user for security
RUN addgroup -g 1001 -S executor && adduser -S executor -u 1001

# Change ownership of the temp directory
RUN chown -R executor:executor /tmp/code-execution

USER executor

# Start the executor worker
CMD ["npm", "run", "start:executor"]
"@

$dockerfileContent | Set-Content -Path $dockerFile

# --- Final Message ---
Write-Host ""
Write-Host "✅ Success! New language '$($displayName)' has been added." -ForegroundColor Green
Write-Host ""
Write-Host "📄 Please review the generated language config file and edit if necessary:" -ForegroundColor Yellow
Write-Host "   $($configFile)"
Write-Host ""
Write-Host "🐳 The Dockerfile has been created at:" -ForegroundColor Yellow
Write-Host "   $($dockerFile)"
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Magenta
Write-Host "1. Update 'docker-compose.yml' or your Kubernetes manifests to add a service for the new language."
Write-Host "2. Rebuild your Docker images."