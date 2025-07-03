# HopeStream DAO Deployment Guide

This guide walks you through deploying the HopeStream DAO system to the Sepolia testnet.

## 📋 Prerequisites

1. **Node.js and npm** installed
2. **Hardhat** setup (already configured)
3. **Sepolia ETH** for deployment costs (~0.05 ETH recommended)
4. **API Keys**:
   - Alchemy or Infura for Sepolia RPC
   - Etherscan for contract verification

## 🚀 Quick Start

### 1. Install Dependencies
```bash
npm install
```

### 2. Set Up Environment
```bash
npm run setup
```
This creates a `.env` file with templates for required variables.

### 3. Configure Environment Variables
Edit the `.env` file with your actual values:

```env
SEPOLIA_URL=https://eth-sepolia.g.alchemy.com/v2/YOUR_ACTUAL_API_KEY
PRIVATE_KEY=your_actual_private_key_without_0x_prefix
ETHERSCAN_API_KEY=your_actual_etherscan_api_key
```

### 4. Check Deployment Readiness
```bash
npm run check
```
This verifies your setup before deployment.

### 5. Deploy to Sepolia
```bash
npm run deploy:sepolia
```

## 📝 Getting API Keys

### Alchemy API Key
1. Go to [Alchemy Dashboard](https://dashboard.alchemy.com/)
2. Create account and new app
3. Select "Ethereum" → "Sepolia"
4. Copy the HTTP URL

### Etherscan API Key
1. Go to [Etherscan](https://etherscan.io/apis)
2. Create account and generate API key
3. Copy the API key

### Private Key
⚠️ **Security Warning**: Never use mainnet private keys for testing!

1. Create a new wallet for testing
2. Export private key (without 0x prefix)
3. Fund it with Sepolia ETH from [Sepolia Faucet](https://sepoliafaucet.com/)

## 📁 Deployment Outputs

### Contract Addresses
All deployed addresses are saved to:
- `deployments/sepolia-latest.json` - Latest deployment
- `deployments/sepolia-{timestamp}.json` - Timestamped backup

### Contract Verification
Contracts are automatically verified on Etherscan if `ETHERSCAN_API_KEY` is provided.

## 🎯 Deployment Process

The deployment script will:

1. **Deploy HopeStreamNFT** - Voting token contract
2. **Deploy DonationVault** - Main donation handling
3. **Deploy TimelockController** - Governance timelock (5 min for testnet)
4. **Deploy HopeStreamGovernor** - DAO governance
5. **Setup Connections** - Link all contracts
6. **Configure Roles** - Set governance permissions
7. **Save Addresses** - Store deployment info
8. **Verify Contracts** - Publish source code

## 📊 Expected Costs

Typical deployment costs on Sepolia:
- HopeStreamNFT: ~0.005 ETH
- DonationVault: ~0.008 ETH
- TimelockController: ~0.004 ETH
- HopeStreamGovernor: ~0.012 ETH
- Setup transactions: ~0.003 ETH
- **Total: ~0.032 ETH**

## 🔍 Manual Verification

If automatic verification fails, use these commands:

```bash
# Verify HopeStreamNFT
npx hardhat verify --network sepolia <NFT_ADDRESS> "<DEPLOYER_ADDRESS>"

# Verify DonationVault
npx hardhat verify --network sepolia <VAULT_ADDRESS> "<BENEFICIARY>" "<OWNER>"

# Verify TimelockController
npx hardhat verify --network sepolia <TIMELOCK_ADDRESS> 300 "[]" "[]" "<ADMIN>"

# Verify HopeStreamGovernor
npx hardhat verify --network sepolia <GOVERNOR_ADDRESS> "<NFT_ADDRESS>" "<TIMELOCK_ADDRESS>" "<VAULT_ADDRESS>"
```

## 🔧 Troubleshooting

### Common Issues

**"Insufficient funds for intrinsic transaction cost"**
- Solution: Fund your deployer account with more Sepolia ETH

**"Invalid JSON RPC response"**
- Solution: Check your SEPOLIA_URL is correct

**"private key length is invalid"**
- Solution: Ensure private key is 64 characters without 0x prefix

**"Contract verification failed"**
- Solution: Run manual verification commands or check Etherscan API key

### Getting Help

1. Run `npm run check` to diagnose issues
2. Check the deployment logs for specific errors
3. Verify your environment variables are correct
4. Ensure you have sufficient Sepolia ETH

## 📱 Frontend Integration

After deployment, use the generated contract addresses:

```javascript
export const CONTRACTS = {
  DONOR_NFT: "0x...",
  DONATION_VAULT: "0x...",
  TIMELOCK: "0x...",
  GOVERNOR: "0x...",
  NETWORK: "sepolia",
  CHAIN_ID: 11155111,
};
```

## 🔒 Security Notes

- ✅ `.env` is gitignored - won't be committed
- ✅ Use testnet-only private keys
- ✅ Never share your private keys
- ✅ Timelock provides governance security
- ✅ All functions have proper access controls

## 🎉 Next Steps

After successful deployment:

1. **Test Donations**: Send ETH to the vault to mint NFTs
2. **Create Proposals**: Use governance functions
3. **Vote on Proposals**: Test the voting mechanism
4. **Execute Proposals**: Test timelock execution

Your DAO is now ready for testing on Sepolia! 🚀 