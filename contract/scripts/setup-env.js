const fs = require('fs');
const path = require('path');

console.log('🔧 Setting up environment for Sepolia deployment...\n');

// Check if .env already exists
const envPath = path.join(__dirname, '../.env');
if (fs.existsSync(envPath)) {
    console.log('⚠️  .env file already exists. Please edit it manually or delete it first.');
    process.exit(0);
}

// Copy from env.example
const examplePath = path.join(__dirname, '../env.example');
if (fs.existsSync(examplePath)) {
    fs.copyFileSync(examplePath, envPath);
    console.log('✅ Created .env file from env.example');
} else {
    // Create .env with template
    const envTemplate = `# Sepolia Network Configuration
SEPOLIA_URL=https://eth-sepolia.g.alchemy.com/v2/YOUR_ALCHEMY_API_KEY

# Private key of the deployer account (without 0x prefix)
# Make sure this account has Sepolia ETH for deployment
PRIVATE_KEY=your_private_key_here_without_0x_prefix

# Etherscan API key for contract verification
# Get from: https://etherscan.io/apis
ETHERSCAN_API_KEY=your_etherscan_api_key_here

# Optional: Beneficiary address (if different from deployer)
# BENEFICIARY_ADDRESS=0x1234567890123456789012345678901234567890
`;
    fs.writeFileSync(envPath, envTemplate);
    console.log('✅ Created .env file with template');
}

console.log('\n📋 Next steps:');
console.log('1. Edit the .env file with your actual values:');
console.log('   - Get Sepolia URL from Alchemy or Infura');
console.log('   - Add your wallet private key (without 0x)');
console.log('   - Get Etherscan API key from etherscan.io');
console.log('2. Fund your deployer account with Sepolia ETH');
console.log('3. Run: npx hardhat run scripts/deploy-dao.js --network sepolia');
console.log('\n🔒 Important: Never commit your .env file to git!'); 