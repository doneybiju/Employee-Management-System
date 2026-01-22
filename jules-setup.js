const { execSync } = require('child_process');
const path = require('path');

// Point to the backend folder where package.json and prisma live
const BACKEND_DIR = path.join(process.cwd(), 'backend');

function run(command) {
  console.log(`[Backend] Running: ${command}`);
  try {
    // Execute command inside the 'backend' directory
    execSync(command, { stdio: 'inherit', cwd: BACKEND_DIR });
  } catch (error) {
    console.error(`Failed: ${command}`);
    process.exit(1);
  }
}

console.log('🚀 Starting Jules Setup...');

// 1. Install Dependencies
run('npm install');

// 2. Setup Environment
try {
  // Copy .env.example to .env inside backend
  run('cp -n .env.example .env');
} catch (e) {
  console.log('.env already exists, skipping copy.');
}

// 3. Generate Prisma Client
console.log('Generating Prisma Client...');
run('npx prisma generate');

// 4. Run Migrations
console.log('Running Migrations...');
run('npx prisma migrate dev --name init');

console.log('✅ Environment Setup Complete!');