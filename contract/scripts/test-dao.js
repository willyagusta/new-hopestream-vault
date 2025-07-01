const { ethers } = require("hardhat");

async function main() {
    console.log("🧪 Testing HopeStream DAO Functionality...\n");

    // Get signers
    const [deployer, donor1, donor2, newBeneficiary] = await ethers.getSigners();

    // Contract addresses (replace with actual deployed addresses)
    const DONOR_NFT_ADDRESS = "0x..."; // Replace after deployment
    const DONATION_VAULT_ADDRESS = "0x..."; // Replace after deployment  
    const GOVERNOR_ADDRESS = "0x..."; // Replace after deployment
    const TIMELOCK_ADDRESS = "0x..."; // Replace after deployment

    // Contract ABIs (simplified for testing)
    const nftABI = [
        "function balanceOf(address owner) view returns (uint256)",
        "function getVotes(address account) view returns (uint256)",
        "function delegate(address delegatee)",
        "function delegates(address account) view returns (address)"
    ];

    const governorABI = [
        "function proposeBeneficiaryChange(address newBeneficiary, string memory description) returns (uint256)",
        "function castVote(uint256 proposalId, uint8 support) returns (uint256)",
        "function state(uint256 proposalId) view returns (uint8)",
        "function proposalVotes(uint256 proposalId) view returns (uint256 againstVotes, uint256 forVotes, uint256 abstainVotes)",
        "function execute(address[] memory targets, uint256[] memory values, bytes[] memory calldatas, bytes32 descriptionHash) returns (uint256)",
        "event ProposalCreated(uint256 indexed proposalId, address indexed proposer)"
    ];

    const vaultABI = [
        "function getDAOStats() view returns (address, address, address, uint256, uint256, uint256, bool)"
    ];

    // Get contract instances
    const nft = new ethers.Contract(DONOR_NFT_ADDRESS, nftABI, ethers.provider);
    const governor = new ethers.Contract(GOVERNOR_ADDRESS, governorABI, ethers.provider);
    const vault = new ethers.Contract(DONATION_VAULT_ADDRESS, vaultABI, ethers.provider);

    try {
        // === STEP 1: Check initial state ===
        console.log("📊 Initial State Check:");
        console.log("======================");
        
        const donor1Balance = await nft.balanceOf(donor1.address);
        const donor2Balance = await nft.balanceOf(donor2.address);
        
        console.log(`Donor 1 NFT Balance: ${donor1Balance}`);
        console.log(`Donor 2 NFT Balance: ${donor2Balance}`);
        
        if (donor1Balance > 0) {
            const donor1Votes = await nft.getVotes(donor1.address);
            const donor1Delegate = await nft.delegates(donor1.address);
            console.log(`Donor 1 Voting Power: ${donor1Votes}`);
            console.log(`Donor 1 Delegate: ${donor1Delegate}`);
        }
        
        console.log();

        // === STEP 2: Delegate votes (if needed) ===
        if (donor1Balance > 0) {
            const donor1Delegate = await nft.delegates(donor1.address);
            if (donor1Delegate === ethers.ZeroAddress) {
                console.log("🗳️  Delegating votes for Donor 1...");
                const nftConnected = nft.connect(donor1);
                const tx = await nftConnected.delegate(donor1.address);
                await tx.wait();
                console.log("✅ Votes delegated for Donor 1");
                console.log();
            }
        }

        // === STEP 3: Create a proposal ===
        if (donor1Balance > 0) {
            console.log("📝 Creating Beneficiary Change Proposal...");
            console.log("==========================================");
            
            const governorConnected = governor.connect(donor1);
            const description = "Change beneficiary to new address for better fund management";
            
            // Listen for ProposalCreated event
            const proposalTx = await governorConnected.proposeBeneficiaryChange(
                newBeneficiary.address,
                description
            );
            const receipt = await proposalTx.wait();
            
            // Find the ProposalCreated event
            const proposalEvent = receipt.logs.find(log => {
                try {
                    const parsed = governor.interface.parseLog(log);
                    return parsed.name === "ProposalCreated";
                } catch {
                    return false;
                }
            });
            
            if (proposalEvent) {
                const parsedEvent = governor.interface.parseLog(proposalEvent);
                const proposalId = parsedEvent.args[0];
                
                console.log(`✅ Proposal created with ID: ${proposalId}`);
                console.log(`📋 Description: ${description}`);
                console.log(`🎯 New Beneficiary: ${newBeneficiary.address}`);
                console.log();

                // === STEP 4: Check proposal state ===
                console.log("📊 Proposal State Check:");
                console.log("========================");
                
                const state = await governor.state(proposalId);
                const stateNames = ["Pending", "Active", "Canceled", "Defeated", "Succeeded", "Queued", "Expired", "Executed"];
                console.log(`Proposal State: ${stateNames[state]} (${state})`);
                console.log();

                // === STEP 5: Vote on proposal (simulate waiting for voting period) ===
                if (state === 1) { // Active
                    console.log("🗳️  Casting Votes...");
                    console.log("===================");
                    
                    // Vote FOR (1) from donor1
                    if (donor1Balance > 0) {
                        const voteResult = await governorConnected.castVote(proposalId, 1);
                        await voteResult.wait();
                        console.log("✅ Donor 1 voted FOR the proposal");
                    }
                    
                    // Vote AGAINST (0) from donor2 (if they have voting power)
                    if (donor2Balance > 0) {
                        const donor2Delegate = await nft.delegates(donor2.address);
                        if (donor2Delegate === ethers.ZeroAddress) {
                            const nftConnected2 = nft.connect(donor2);
                            await nftConnected2.delegate(donor2.address);
                        }
                        
                        const governorConnected2 = governor.connect(donor2);
                        const voteResult2 = await governorConnected2.castVote(proposalId, 0);
                        await voteResult2.wait();
                        console.log("✅ Donor 2 voted AGAINST the proposal");
                    }
                    
                    console.log();

                    // === STEP 6: Check vote results ===
                    console.log("📊 Vote Results:");
                    console.log("================");
                    
                    const votes = await governor.proposalVotes(proposalId);
                    console.log(`Against Votes: ${votes[0]}`);
                    console.log(`For Votes: ${votes[1]}`);
                    console.log(`Abstain Votes: ${votes[2]}`);
                    console.log();
                }

                return proposalId;
            }
        } else {
            console.log("❌ No NFT holders found. Please ensure donors have made donations first.");
            console.log("💡 Tip: Make donations through the vault to receive voting NFTs.");
        }

    } catch (error) {
        console.error("❌ DAO Test Error:", error.message);
        console.log("\n🔧 Troubleshooting:");
        console.log("1. Ensure all contracts are deployed and addresses are correct");
        console.log("2. Make sure donors have NFTs (donations made)");
        console.log("3. Check that votes are delegated");
        console.log("4. Verify proposal is in correct state for voting");
    }

    // === FINAL: Display instructions ===
    console.log("\n📚 How to Use the DAO:");
    console.log("======================");
    console.log("1. 💰 Donate to the vault to receive voting NFTs");
    console.log("2. 🗳️  Delegate your votes to yourself or another address");
    console.log("3. 📝 Create proposals for beneficiary changes, pausing, etc.");
    console.log("4. 🗳️  Vote on active proposals (For/Against/Abstain)");
    console.log("5. ⏰ Wait for timelock delay after proposal succeeds");
    console.log("6. ⚡ Execute successful proposals");
    console.log("\n🌐 Use the frontend DAO interface for easier interaction!");
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error("Test failed:", error);
        process.exit(1);
    }); 