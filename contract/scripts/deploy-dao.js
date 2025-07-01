const { ethers } = require("hardhat");

async function main() {
    console.log("🏛️  Deploying HopeStream DAO System...\n");

    const [deployer] = await ethers.getSigners();
    console.log("Deploying contracts with account:", deployer.address);
    console.log("Account balance:", (await deployer.provider.getBalance(deployer.address)).toString());
    console.log();

    // ===== 1. Deploy HopeStreamNFT (Voting Token) =====
    console.log("📝 Deploying HopeStreamNFT...");
    const HopeStreamNFT = await ethers.getContractFactory("HopeStreamNFT");
    const donorNFT = await HopeStreamNFT.deploy(deployer.address);
    await donorNFT.waitForDeployment();
    console.log("✅ HopeStreamNFT deployed to:", await donorNFT.getAddress());
    console.log();

    // ===== 2. Deploy DonationVault =====
    console.log("💰 Deploying DonationVault...");
    const DonationVault = await ethers.getContractFactory("DonationVault");
    const beneficiary = deployer.address; // Change this to actual beneficiary
    const donationVault = await DonationVault.deploy(beneficiary, deployer.address);
    await donationVault.waitForDeployment();
    console.log("✅ DonationVault deployed to:", await donationVault.getAddress());
    console.log();

    // ===== 3. Deploy TimelockController =====
    console.log("⏰ Deploying TimelockController...");
    const TimelockController = await ethers.getContractFactory("TimelockController");
    
    const minDelay = 2 * 24 * 60 * 60; // 2 days delay for execution
    const proposers = []; // Will be set to Governor after deployment
    const executors = []; // Will be set to Governor after deployment
    const admin = deployer.address; // Admin can manage timelock (should be transferred to DAO later)
    
    const timelock = await TimelockController.deploy(minDelay, proposers, executors, admin);
    await timelock.waitForDeployment();
    console.log("✅ TimelockController deployed to:", await timelock.getAddress());
    console.log();

    // ===== 4. Deploy HopeStreamGovernor =====
    console.log("🏛️  Deploying HopeStreamGovernor...");
    const HopeStreamGovernor = await ethers.getContractFactory("HopeStreamGovernor");
    const governor = await HopeStreamGovernor.deploy(
        await donorNFT.getAddress(),
        await timelock.getAddress(),
        await donationVault.getAddress()
    );
    await governor.waitForDeployment();
    console.log("✅ HopeStreamGovernor deployed to:", await governor.getAddress());
    console.log();

    // ===== 5. Setup Connections =====
    console.log("🔗 Setting up contract connections...");
    
    // Connect NFT to Vault
    console.log("  - Connecting NFT to Vault...");
    await donorNFT.setDonationVault(await donationVault.getAddress());
    await donationVault.setDonorNFT(await donorNFT.getAddress());
    
    // Set Governor as governance contract in Vault
    console.log("  - Setting Governor as governance in Vault...");
    await donationVault.setGovernanceContract(await timelock.getAddress()); // Timelock executes proposals
    
    // Setup Timelock roles
    console.log("  - Setting up Timelock roles...");
    const PROPOSER_ROLE = await timelock.PROPOSER_ROLE();
    const EXECUTOR_ROLE = await timelock.EXECUTOR_ROLE();
    const TIMELOCK_ADMIN_ROLE = await timelock.TIMELOCK_ADMIN_ROLE();
    
    // Grant proposer role to Governor
    await timelock.grantRole(PROPOSER_ROLE, await governor.getAddress());
    
    // Grant executor role to Governor (and optionally to everyone)
    await timelock.grantRole(EXECUTOR_ROLE, await governor.getAddress());
    await timelock.grantRole(EXECUTOR_ROLE, ethers.ZeroAddress); // Anyone can execute after timelock
    
    console.log("✅ Contract connections established!");
    console.log();

    // ===== 6. Test Setup (Optional) =====
    console.log("🧪 Testing setup with a small donation...");
    
    // Make a test donation to mint an NFT and get voting power
    const testDonation = ethers.parseEther("0.01");
    await donationVault.connect(deployer).receive({ value: testDonation });
    
    const votingPower = await donorNFT.getVotes(deployer.address);
    console.log("  - Test donation successful!");
    console.log("  - Deployer voting power:", votingPower.toString());
    console.log();

    // ===== 7. Summary =====
    console.log("🎉 DAO Deployment Complete!");
    console.log("===============================");
    console.log("📝 HopeStreamNFT:", await donorNFT.getAddress());
    console.log("💰 DonationVault:", await donationVault.getAddress());
    console.log("⏰ TimelockController:", await timelock.getAddress());
    console.log("🏛️  HopeStreamGovernor:", await governor.getAddress());
    console.log();
    
    // ===== 8. Next Steps =====
    console.log("📋 Next Steps:");
    console.log("1. Donors can now receive voting NFTs when they donate");
    console.log("2. Anyone can create proposals using the Governor contract");
    console.log("3. NFT holders can vote on proposals");
    console.log("4. Approved proposals execute after timelock delay");
    console.log("5. Consider transferring admin roles to the DAO itself for full decentralization");
    console.log();
    
    // ===== 9. Contract Verification Info =====
    console.log("🔍 Contract Verification Commands:");
    console.log(`npx hardhat verify --network <network> ${await donorNFT.getAddress()} "${deployer.address}"`);
    console.log(`npx hardhat verify --network <network> ${await donationVault.getAddress()} "${beneficiary}" "${deployer.address}"`);
    console.log(`npx hardhat verify --network <network> ${await timelock.getAddress()} ${minDelay} "[]" "[]" "${admin}"`);
    console.log(`npx hardhat verify --network <network> ${await governor.getAddress()} "${await donorNFT.getAddress()}" "${await timelock.getAddress()}" "${await donationVault.getAddress()}"`);
    console.log();

    // ===== 10. Frontend Integration Constants =====
    console.log("⚡ Frontend Integration:");
    console.log("Copy these addresses to your frontend:");
    console.log("export const CONTRACTS = {");
    console.log(`  DONOR_NFT: "${await donorNFT.getAddress()}",`);
    console.log(`  DONATION_VAULT: "${await donationVault.getAddress()}",`);
    console.log(`  TIMELOCK: "${await timelock.getAddress()}",`);
    console.log(`  GOVERNOR: "${await governor.getAddress()}",`);
    console.log("};");
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error("❌ Deployment failed:", error);
        process.exit(1);
    }); 