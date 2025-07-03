const { ethers } = require("hardhat");
const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
    console.log("🏛️  Deploying HopeStream DAO System...\n");

    const [deployer] = await ethers.getSigners();
    const network = await ethers.provider.getNetwork();
    const isMainnet = network.chainId === 1n || network.chainId === 11155111n; // Ethereum mainnet or Sepolia
    
    console.log("Deploying contracts with account:", deployer.address);
    console.log("Network:", network.name, "Chain ID:", network.chainId.toString());
    console.log("Account balance:", ethers.formatEther(await deployer.provider.getBalance(deployer.address)), "ETH");
    console.log();

    // Contract addresses storage
    const deployedAddresses = {
        network: network.name,
        chainId: network.chainId.toString(),
        deployer: deployer.address,
        timestamp: new Date().toISOString(),
        contracts: {}
    };

    // Verification parameters storage
    const verificationParams = [];

    try {
        // ===== 1. Deploy HopeStreamNFT (Voting Token) =====
        console.log("📝 Deploying HopeStreamNFT...");
        const HopeStreamNFT = await ethers.getContractFactory("HopeStreamNFT");
        const donorNFT = await HopeStreamNFT.deploy(deployer.address);
        await donorNFT.waitForDeployment();
        const nftAddress = await donorNFT.getAddress();
        deployedAddresses.contracts.HopeStreamNFT = nftAddress;
        verificationParams.push({
            name: "HopeStreamNFT",
            address: nftAddress,
            constructorArguments: [deployer.address]
        });
        console.log("✅ HopeStreamNFT deployed to:", nftAddress);
        console.log();

        // ===== 2. Deploy DonationVault =====
        console.log("💰 Deploying DonationVault...");
        const DonationVault = await ethers.getContractFactory("DonationVault");
        const beneficiary = deployer.address; // Change this to actual beneficiary
        const donationVault = await DonationVault.deploy(beneficiary, deployer.address);
        await donationVault.waitForDeployment();
        const vaultAddress = await donationVault.getAddress();
        deployedAddresses.contracts.DonationVault = vaultAddress;
        verificationParams.push({
            name: "DonationVault",
            address: vaultAddress,
            constructorArguments: [beneficiary, deployer.address]
        });
        console.log("✅ DonationVault deployed to:", vaultAddress);
        console.log();

        // ===== 3. Deploy TimelockController =====
        console.log("⏰ Deploying TimelockController...");
        const TimelockController = await ethers.getContractFactory("TimelockController");
        
        const minDelay = isMainnet ? 2 * 24 * 60 * 60 : 300; // 2 days for mainnet, 5 minutes for testnet
        const proposers = []; // Will be set to Governor after deployment
        const executors = []; // Will be set to Governor after deployment
        const admin = deployer.address; // Admin can manage timelock (should be transferred to DAO later)
        
        const timelock = await TimelockController.deploy(minDelay, proposers, executors, admin);
        await timelock.waitForDeployment();
        const timelockAddress = await timelock.getAddress();
        deployedAddresses.contracts.TimelockController = timelockAddress;
        verificationParams.push({
            name: "TimelockController",
            address: timelockAddress,
            constructorArguments: [minDelay, proposers, executors, admin]
        });
        console.log("✅ TimelockController deployed to:", timelockAddress);
        console.log(`   - Timelock delay: ${minDelay} seconds (${isMainnet ? '2 days' : '5 minutes'})`);
        console.log();

        // ===== 4. Deploy HopeStreamGovernor =====
        console.log("🏛️  Deploying HopeStreamGovernor...");
        const HopeStreamGovernor = await ethers.getContractFactory("HopeStreamGovernor");
        const governor = await HopeStreamGovernor.deploy(
            nftAddress,
            timelockAddress,
            vaultAddress
        );
        await governor.waitForDeployment();
        const governorAddress = await governor.getAddress();
        deployedAddresses.contracts.HopeStreamGovernor = governorAddress;
        verificationParams.push({
            name: "HopeStreamGovernor",
            address: governorAddress,
            constructorArguments: [nftAddress, timelockAddress, vaultAddress]
        });
        console.log("✅ HopeStreamGovernor deployed to:", governorAddress);
        console.log();

        // ===== 5. Setup Connections =====
        console.log("🔗 Setting up contract connections...");
        
        // Connect NFT to Vault
        console.log("  - Connecting NFT to Vault...");
        await donorNFT.setDonationVault(vaultAddress);
        await donationVault.setDonorNFT(nftAddress);
        
        // Set Timelock as governance contract in Vault (timelock executes proposals)
        console.log("  - Setting Timelock as governance in Vault...");
        await donationVault.setGovernanceContract(timelockAddress);
        
        // Setup Timelock roles
        console.log("  - Setting up Timelock roles...");
        const PROPOSER_ROLE = await timelock.PROPOSER_ROLE();
        const EXECUTOR_ROLE = await timelock.EXECUTOR_ROLE();
        const TIMELOCK_ADMIN_ROLE = await timelock.TIMELOCK_ADMIN_ROLE();
        
        // Grant proposer role to Governor
        await timelock.grantRole(PROPOSER_ROLE, governorAddress);
        
        // Grant executor role to Governor (and optionally to everyone)
        await timelock.grantRole(EXECUTOR_ROLE, governorAddress);
        await timelock.grantRole(EXECUTOR_ROLE, ethers.ZeroAddress); // Anyone can execute after timelock
        
        console.log("✅ Contract connections established!");
        console.log();

        // ===== 6. Test Setup (Optional for testnet) =====
        if (!isMainnet) {
            console.log("🧪 Testing setup with a small donation...");
            
            // Make a test donation to mint an NFT and get voting power
            const testDonation = ethers.parseEther("0.01");
            await deployer.sendTransaction({ to: vaultAddress, value: testDonation });
            
            const votingPower = await donorNFT.getVotes(deployer.address);
            console.log("  - Test donation successful!");
            console.log("  - Deployer voting power:", votingPower.toString());
            console.log();
        }

        // ===== 7. Save deployment addresses =====
        console.log("💾 Saving deployment addresses...");
        const deploymentsDir = path.join(__dirname, "../deployments");
        if (!fs.existsSync(deploymentsDir)) {
            fs.mkdirSync(deploymentsDir, { recursive: true });
        }
        
        const deploymentFile = path.join(deploymentsDir, `${network.name}-${Date.now()}.json`);
        const latestFile = path.join(deploymentsDir, `${network.name}-latest.json`);
        
        fs.writeFileSync(deploymentFile, JSON.stringify(deployedAddresses, null, 2));
        fs.writeFileSync(latestFile, JSON.stringify(deployedAddresses, null, 2));
        
        console.log("✅ Addresses saved to:", deploymentFile);
        console.log("✅ Latest addresses saved to:", latestFile);
        console.log();

        // ===== 8. Contract Verification =====
        if (isMainnet && process.env.ETHERSCAN_API_KEY) {
            console.log("🔍 Verifying contracts on Etherscan...");
            
            for (const contract of verificationParams) {
                try {
                    console.log(`  - Verifying ${contract.name}...`);
                    await hre.run("verify:verify", {
                        address: contract.address,
                        constructorArguments: contract.constructorArguments,
                    });
                    console.log(`  ✅ ${contract.name} verified successfully`);
                } catch (error) {
                    console.log(`  ⚠️ ${contract.name} verification failed:`, error.message);
                }
            }
        } else if (isMainnet) {
            console.log("⚠️ Skipping contract verification - ETHERSCAN_API_KEY not set");
        }
        console.log();

        // ===== 9. Summary =====
        console.log("🎉 DAO Deployment Complete!");
        console.log("===============================");
        console.log("📝 HopeStreamNFT:", nftAddress);
        console.log("💰 DonationVault:", vaultAddress);
        console.log("⏰ TimelockController:", timelockAddress);
        console.log("🏛️  HopeStreamGovernor:", governorAddress);
        console.log();
        
        // ===== 10. Manual Verification Commands =====
        console.log("🔍 Manual Contract Verification Commands:");
        for (const contract of verificationParams) {
            const args = contract.constructorArguments.length > 0 
                ? ` "${contract.constructorArguments.join('" "')}"` 
                : "";
            console.log(`npx hardhat verify --network ${network.name} ${contract.address}${args}`);
        }
        console.log();

        // ===== 11. Frontend Integration Constants =====
        console.log("⚡ Frontend Integration:");
        console.log("Copy these addresses to your frontend:");
        console.log("export const CONTRACTS = {");
        console.log(`  DONOR_NFT: "${nftAddress}",`);
        console.log(`  DONATION_VAULT: "${vaultAddress}",`);
        console.log(`  TIMELOCK: "${timelockAddress}",`);
        console.log(`  GOVERNOR: "${governorAddress}",`);
        console.log(`  NETWORK: "${network.name}",`);
        console.log(`  CHAIN_ID: ${network.chainId.toString()},`);
        console.log("};");
        console.log();

        // ===== 12. Next Steps =====
        console.log("📋 Next Steps:");
        console.log("1. Set up your .env file with SEPOLIA_URL, PRIVATE_KEY, and ETHERSCAN_API_KEY");
        console.log("2. Fund your deployer account with Sepolia ETH");
        console.log("3. Run: npx hardhat run scripts/deploy-dao.js --network sepolia");
        console.log("4. Donors can receive voting NFTs when they donate");
        console.log("5. Use the Governor contract to create and vote on proposals");
        console.log("6. Consider transferring admin roles to the DAO for full decentralization");

    } catch (error) {
        console.error("❌ Deployment failed:", error);
        
        // Save partial deployment info if available
        if (Object.keys(deployedAddresses.contracts).length > 0) {
            console.log("💾 Saving partial deployment info...");
            const deploymentsDir = path.join(__dirname, "../deployments");
            if (!fs.existsSync(deploymentsDir)) {
                fs.mkdirSync(deploymentsDir, { recursive: true });
            }
            
            const errorFile = path.join(deploymentsDir, `${network.name}-error-${Date.now()}.json`);
            deployedAddresses.error = error.message;
            fs.writeFileSync(errorFile, JSON.stringify(deployedAddresses, null, 2));
            console.log("✅ Partial deployment info saved to:", errorFile);
        }
        
        process.exit(1);
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error("❌ Deployment script failed:", error);
        process.exit(1);
    }); 