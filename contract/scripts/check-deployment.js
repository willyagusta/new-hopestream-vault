const { ethers } = require("hardhat");
const fs = require('fs');
const path = require('path');
require('dotenv').config();

async function checkDeploymentReadiness() {
    console.log('🔍 Checking deployment readiness for Sepolia...\n');
    
    const issues = [];
    const warnings = [];
    
    // Check 1: Environment variables
    console.log('📋 Checking environment variables...');
    if (!process.env.SEPOLIA_URL) {
        issues.push('❌ SEPOLIA_URL not set in .env file');
    } else if (process.env.SEPOLIA_URL.includes('YOUR_ALCHEMY_API_KEY')) {
        issues.push('❌ SEPOLIA_URL contains placeholder - update with real API key');
    } else {
        console.log('  ✅ SEPOLIA_URL configured');
    }
    
    if (!process.env.PRIVATE_KEY) {
        issues.push('❌ PRIVATE_KEY not set in .env file');
    } else if (process.env.PRIVATE_KEY.includes('your_private_key')) {
        issues.push('❌ PRIVATE_KEY contains placeholder - update with real private key');
    } else if (process.env.PRIVATE_KEY.startsWith('0x')) {
        warnings.push('⚠️  PRIVATE_KEY should not include 0x prefix');
    } else {
        console.log('  ✅ PRIVATE_KEY configured');
    }
    
    if (!process.env.ETHERSCAN_API_KEY) {
        warnings.push('⚠️  ETHERSCAN_API_KEY not set - contract verification will be skipped');
    } else if (process.env.ETHERSCAN_API_KEY.includes('your_etherscan_api_key')) {
        warnings.push('⚠️  ETHERSCAN_API_KEY contains placeholder - contract verification will be skipped');
    } else {
        console.log('  ✅ ETHERSCAN_API_KEY configured');
    }
    
    // Check 2: Network connection
    console.log('\n🌐 Checking network connection...');
    try {
        const network = hre.network.name;
        if (network !== 'sepolia') {
            warnings.push(`⚠️  Current network is '${network}' - use --network sepolia for deployment`);
        }
        
        if (process.env.SEPOLIA_URL && !process.env.SEPOLIA_URL.includes('YOUR_ALCHEMY_API_KEY')) {
            // Try to connect to the network
            const provider = new ethers.JsonRpcProvider(process.env.SEPOLIA_URL);
            const blockNumber = await provider.getBlockNumber();
            console.log(`  ✅ Connected to Sepolia - latest block: ${blockNumber}`);
        }
    } catch (error) {
        issues.push(`❌ Failed to connect to Sepolia: ${error.message}`);
    }
    
    // Check 3: Account balance
    console.log('\n💰 Checking deployer account...');
    try {
        if (process.env.PRIVATE_KEY && !process.env.PRIVATE_KEY.includes('your_private_key')) {
            const provider = new ethers.JsonRpcProvider(process.env.SEPOLIA_URL);
            const wallet = new ethers.Wallet(
                process.env.PRIVATE_KEY.startsWith('0x') 
                    ? process.env.PRIVATE_KEY 
                    : `0x${process.env.PRIVATE_KEY}`,
                provider
            );
            
            const balance = await provider.getBalance(wallet.address);
            const balanceEth = ethers.formatEther(balance);
            
            console.log(`  📍 Deployer address: ${wallet.address}`);
            console.log(`  💵 Balance: ${balanceEth} ETH`);
            
            if (parseFloat(balanceEth) < 0.01) {
                issues.push('❌ Insufficient balance - need at least 0.01 ETH for deployment');
            } else if (parseFloat(balanceEth) < 0.05) {
                warnings.push('⚠️  Low balance - consider having at least 0.05 ETH for deployment');
            } else {
                console.log('  ✅ Sufficient balance for deployment');
            }
        }
    } catch (error) {
        issues.push(`❌ Failed to check account balance: ${error.message}`);
    }
    
    // Check 4: Contract compilation
    console.log('\n🔨 Checking contract compilation...');
    try {
        await hre.run('compile');
        console.log('  ✅ Contracts compiled successfully');
    } catch (error) {
        issues.push(`❌ Contract compilation failed: ${error.message}`);
    }
    
    // Check 5: Required contracts exist
    console.log('\n📄 Checking contract factories...');
    try {
        await ethers.getContractFactory("HopeStreamNFT");
        console.log('  ✅ HopeStreamNFT contract found');
        
        await ethers.getContractFactory("DonationVault");
        console.log('  ✅ DonationVault contract found');
        
        await ethers.getContractFactory("HopeStreamGovernor");
        console.log('  ✅ HopeStreamGovernor contract found');
        
        await ethers.getContractFactory("TimelockController");
        console.log('  ✅ TimelockController contract found');
    } catch (error) {
        issues.push(`❌ Contract factory error: ${error.message}`);
    }
    
    // Summary
    console.log('\n' + '='.repeat(50));
    console.log('📊 DEPLOYMENT READINESS SUMMARY');
    console.log('='.repeat(50));
    
    if (issues.length === 0) {
        console.log('🎉 All checks passed! Ready for deployment.');
        console.log('\n🚀 To deploy, run:');
        console.log('npx hardhat run scripts/deploy-dao.js --network sepolia');
    } else {
        console.log('❌ Issues found that must be fixed:');
        issues.forEach(issue => console.log(`  ${issue}`));
    }
    
    if (warnings.length > 0) {
        console.log('\n⚠️  Warnings:');
        warnings.forEach(warning => console.log(`  ${warning}`));
    }
    
    console.log('\n📚 Resources:');
    console.log('  • Get Sepolia ETH: https://sepoliafaucet.com/');
    console.log('  • Alchemy API: https://dashboard.alchemy.com/');
    console.log('  • Etherscan API: https://etherscan.io/apis');
    
    return issues.length === 0;
}

const hre = require("hardhat");

checkDeploymentReadiness()
    .then((ready) => {
        process.exit(ready ? 0 : 1);
    })
    .catch((error) => {
        console.error('❌ Check failed:', error);
        process.exit(1);
    }); 