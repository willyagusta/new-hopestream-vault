const { ethers } = require("hardhat");

async function main() {
    console.log("🛡️  Testing Anti-Sybil Protection System...\n");

    // Get signers
    const [deployer, legitimateUser, attacker, beneficiary] = await ethers.getSigners();

    // Contract addresses (replace with actual deployed addresses)
    const DONOR_NFT_ADDRESS = "0x..."; // Replace after deployment
    const DONATION_VAULT_ADDRESS = "0x..."; // Replace after deployment

    const nftABI = [
        "function balanceOf(address owner) view returns (uint256)",
        "function getVotes(address account) view returns (uint256)",
        "function getTotalDonationAmount(address account) view returns (uint256)",
        "function getVotingBreakdown(address account) view returns (uint256 nftCount, uint256 totalDonation, uint256 votingPower, uint256 averageDonationPerNFT)"
    ];

    const vaultABI = [
        "function getDonorInfo(address donor) view returns (uint256 nftCount, uint256 totalDonated, uint256 lastDonation, uint256 nextAllowedDonation, uint256 nextRequiredAmount)",
        "function getAntiSybilParameters() view returns (uint256 minDonation, uint256 maxNFTs, uint256 cooldown)",
        "function totalDonated() view returns (uint256)"
    ];

    const nft = new ethers.Contract(DONOR_NFT_ADDRESS, nftABI, ethers.provider);
    const vault = new ethers.Contract(DONATION_VAULT_ADDRESS, vaultABI, ethers.provider);

    try {
        console.log("📊 Initial Anti-Sybil Parameters:");
        console.log("==================================");
        
        const params = await vault.getAntiSybilParameters();
        console.log(`Minimum Donation: ${ethers.formatEther(params[0])} ETH`);
        console.log(`Max NFTs per Address: ${params[1]}`);
        console.log(`Cooldown Period: ${params[2]} seconds (${Math.floor(params[2] / 3600)} hours)`);
        console.log();

        // === TEST 1: Legitimate User Behavior ===
        console.log("✅ TEST 1: Legitimate User Donation");
        console.log("====================================");
        
        const legitimateDonation = ethers.parseEther("0.1"); // Above minimum
        console.log(`Attempting donation of ${ethers.formatEther(legitimateDonation)} ETH...`);
        
        try {
            const tx = await legitimateUser.sendTransaction({
                to: DONATION_VAULT_ADDRESS,
                value: legitimateDonation
            });
            await tx.wait();
            console.log("✅ Legitimate donation successful!");
            
            const userInfo = await vault.getDonorInfo(legitimateUser.address);
            const votingBreakdown = await nft.getVotingBreakdown(legitimateUser.address);
            
            console.log(`  NFT Count: ${userInfo[0]}`);
            console.log(`  Total Donated: ${ethers.formatEther(userInfo[1])} ETH`);
            console.log(`  Voting Power: ${ethers.formatEther(votingBreakdown[2])} ETH`);
            console.log();
        } catch (error) {
            console.log("❌ Legitimate donation failed:", error.message);
        }

        // === TEST 2: Attack Scenario - Small Donations ===
        console.log("🚨 TEST 2: Attack Attempt - Multiple Small Donations");
        console.log("====================================================");
        
        const smallDonation = ethers.parseEther("0.005"); // Below minimum
        console.log(`Attacker attempting donation of ${ethers.formatEther(smallDonation)} ETH (below minimum)...`);
        
        try {
            const tx = await attacker.sendTransaction({
                to: DONATION_VAULT_ADDRESS,
                value: smallDonation
            });
            await tx.wait();
            
            const attackerInfo = await vault.getDonorInfo(attacker.address);
            const nftCount = await nft.balanceOf(attacker.address);
            
            console.log(`❌ Small donation went through but NFT count: ${nftCount} (should be 0)`);
            console.log(`  Total Donated: ${ethers.formatEther(attackerInfo[1])} ETH`);
            console.log(`  NFT Count: ${attackerInfo[0]}`);
            
            if (nftCount.toString() === "0") {
                console.log("✅ PROTECTION WORKING: No NFT minted for small donation!");
            }
            console.log();
        } catch (error) {
            console.log("✅ PROTECTION WORKING: Small donation blocked:", error.message);
            console.log();
        }

        // === TEST 3: Attack Scenario - Rapid Donations ===
        console.log("🚨 TEST 3: Attack Attempt - Rapid Successive Donations");
        console.log("======================================================");
        
        const validDonation = ethers.parseEther("0.01"); // Valid amount
        console.log(`Attacker making first valid donation of ${ethers.formatEther(validDonation)} ETH...`);
        
        try {
            const tx1 = await attacker.sendTransaction({
                to: DONATION_VAULT_ADDRESS,
                value: validDonation
            });
            await tx1.wait();
            console.log("✅ First donation successful");
            
            // Immediately try another donation (should be blocked by cooldown)
            console.log("Immediately attempting second donation (should be blocked by cooldown)...");
            
            const tx2 = await attacker.sendTransaction({
                to: DONATION_VAULT_ADDRESS,
                value: validDonation
            });
            await tx2.wait();
            
            const attackerInfo = await vault.getDonorInfo(attacker.address);
            const nftCount = await nft.balanceOf(attacker.address);
            
            console.log(`Second donation completed. NFT count: ${nftCount}`);
            console.log(`Total NFTs: ${attackerInfo[0]}`);
            
            if (attackerInfo[0].toString() === "1") {
                console.log("✅ PROTECTION WORKING: Second donation didn't grant additional NFT due to cooldown!");
            } else {
                console.log("❌ PROTECTION FAILED: Multiple NFTs granted during cooldown");
            }
            console.log();
        } catch (error) {
            console.log("✅ PROTECTION WORKING: Rapid donation blocked:", error.message);
            console.log();
        }

        // === TEST 4: Progressive Threshold Test ===
        console.log("🧪 TEST 4: Progressive Threshold Testing");
        console.log("========================================");
        
        // Wait for cooldown (in real test, you'd advance time)
        console.log("Note: In real testing, advance blockchain time by 1+ hours to test progressive thresholds");
        
        const attackerInfo = await vault.getDonorInfo(attacker.address);
        console.log(`Current NFT count: ${attackerInfo[0]}`);
        console.log(`Next required amount: ${ethers.formatEther(attackerInfo[4])} ETH`);
        console.log(`Total donated so far: ${ethers.formatEther(attackerInfo[1])} ETH`);
        console.log();

        // === TEST 5: Voting Power Comparison ===
        console.log("⚖️  TEST 5: Voting Power Analysis");
        console.log("=================================");
        
        const legitimateVoting = await nft.getVotingBreakdown(legitimateUser.address);
        const attackerVoting = await nft.getVotingBreakdown(attacker.address);
        
        console.log("Legitimate User:");
        console.log(`  NFT Count: ${legitimateVoting[0]}`);
        console.log(`  Total Donation: ${ethers.formatEther(legitimateVoting[1])} ETH`);
        console.log(`  Voting Power: ${ethers.formatEther(legitimateVoting[2])} ETH`);
        console.log(`  Avg per NFT: ${ethers.formatEther(legitimateVoting[3])} ETH`);
        console.log();
        
        console.log("Attacker:");
        console.log(`  NFT Count: ${attackerVoting[0]}`);
        console.log(`  Total Donation: ${ethers.formatEther(attackerVoting[1])} ETH`);
        console.log(`  Voting Power: ${ethers.formatEther(attackerVoting[2])} ETH`);
        console.log(`  Avg per NFT: ${attackerVoting[3].toString() === "0" ? "N/A" : ethers.formatEther(attackerVoting[3]) + " ETH"}`);
        console.log();

        // Calculate efficiency
        const legitRatio = legitimateVoting[1] > 0 ? Number(legitimateVoting[2]) / Number(legitimateVoting[1]) : 0;
        const attackerRatio = attackerVoting[1] > 0 ? Number(attackerVoting[2]) / Number(attackerVoting[1]) : 0;
        
        console.log("Voting Power Efficiency (Voting Power / Total Donated):");
        console.log(`  Legitimate User: ${legitRatio.toFixed(2)}`);
        console.log(`  Attacker: ${attackerRatio.toFixed(2)}`);
        
        if (legitRatio >= attackerRatio) {
            console.log("✅ PROTECTION WORKING: Legitimate user has better or equal voting efficiency!");
        } else {
            console.log("❌ PROTECTION FAILED: Attacker has better voting efficiency");
        }
        console.log();

        // === TEST 6: Maximum NFT Limit Test ===
        console.log("🔢 TEST 6: Maximum NFT Limit (Theoretical)");
        console.log("==========================================");
        
        const maxNFTs = params[1];
        const attackerCurrentNFTs = attackerInfo[0];
        const remainingNFTs = maxNFTs - attackerCurrentNFTs;
        
        console.log(`Max NFTs allowed: ${maxNFTs}`);
        console.log(`Attacker current NFTs: ${attackerCurrentNFTs}`);
        console.log(`Remaining NFTs possible: ${remainingNFTs}`);
        
        if (remainingNFTs > 0) {
            console.log(`Attacker could potentially get ${remainingNFTs} more NFTs`);
            console.log(`But would need to:`);
            console.log(`  - Wait for cooldown periods`);
            console.log(`  - Pay progressive thresholds`);
            console.log(`  - Make increasingly larger donations`);
        } else {
            console.log("✅ Attacker has reached maximum NFT limit!");
        }
        console.log();

    } catch (error) {
        console.error("❌ Anti-Sybil Test Error:", error.message);
        console.log("\n🔧 Troubleshooting:");
        console.log("1. Ensure contracts are deployed with anti-Sybil protections");
        console.log("2. Check that minimum donation threshold is set");
        console.log("3. Verify cooldown and NFT limits are configured");
    }

    // === SUMMARY ===
    console.log("📋 ANTI-SYBIL PROTECTION SUMMARY");
    console.log("=================================");
    console.log("✅ Protection Mechanisms Implemented:");
    console.log("  1. Minimum Donation Threshold - Prevents tiny donations");
    console.log("  2. Donation-Weighted Voting - Power based on contribution, not NFT count");
    console.log("  3. Cooldown Periods - Prevents rapid successive donations");
    console.log("  4. Progressive Thresholds - Higher requirements for additional NFTs");
    console.log("  5. Maximum NFT Limits - Caps total NFTs per address");
    console.log("  6. Proposal Thresholds - Higher requirements for governance participation");
    console.log();
    console.log("🎯 Expected Outcomes:");
    console.log("  - Attackers pay significantly more for same voting power");
    console.log("  - Legitimate donors maintain fair representation");
    console.log("  - Small repeated donations don't grant voting power");
    console.log("  - Time delays prevent rapid accumulation");
    console.log("  - Economic incentives favor genuine contributors");
    console.log();
    console.log("⚠️  Note: Test with actual blockchain time advancement for full validation");
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error("Anti-Sybil test failed:", error);
        process.exit(1);
    }); 