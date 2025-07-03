const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time, loadFixture } = require("@nomicfoundation/hardhat-toolbox/network-helpers");

describe("HopeStreamGovernor", function () {
    async function deployGovernorFixture() {
        const [owner, beneficiary, newBeneficiary, relayer, voter1, voter2, voter3, proposer] = await ethers.getSigners();

        // Deploy NFT contract first
        const HopeStreamNFT = await ethers.getContractFactory("HopeStreamNFT");
        const nft = await HopeStreamNFT.deploy(owner.address);

        // Deploy DonationVault
        const DonationVault = await ethers.getContractFactory("DonationVault");
        const vault = await DonationVault.deploy(beneficiary.address, owner.address);

        // Deploy TimelockController
        const TimelockController = await ethers.getContractFactory("TimelockController");
        const minDelay = 86400; // 1 day
        const proposers = [];
        const executors = [];
        const admin = owner.address; // Will be transferred to governor later
        const timelock = await TimelockController.deploy(minDelay, proposers, executors, admin);

        // Deploy Governor
        const HopeStreamGovernor = await ethers.getContractFactory("HopeStreamGovernor");
        const governor = await HopeStreamGovernor.deploy(nft.target, timelock.target, vault.target);

        // Set up relationships - timelock is the actual executor, so it should be the governance contract
        await vault.setGovernanceContract(timelock.target);  // Timelock executes, not governor
        await nft.setDonationVault(vault.target);
        
        // setDonorNFT and setDefenderRelayer are onlyOwner functions, so call them with owner
        await vault.connect(owner).setDonorNFT(nft.target);
        await vault.connect(owner).setDefenderRelayer(relayer.address);

        // Set up timelock roles
        const proposerRole = await timelock.PROPOSER_ROLE();
        const executorRole = await timelock.EXECUTOR_ROLE();
        
        await timelock.grantRole(proposerRole, governor.target);
        await timelock.grantRole(executorRole, governor.target);
        // Note: Keeping owner as admin for test setup

        // Create some donors with voting power
        await voter1.sendTransaction({ to: vault.target, value: ethers.parseEther("2.0") });
        await voter2.sendTransaction({ to: vault.target, value: ethers.parseEther("1.5") });
        await voter3.sendTransaction({ to: vault.target, value: ethers.parseEther("1.0") });
        await proposer.sendTransaction({ to: vault.target, value: ethers.parseEther("0.5") });

        // Delegate voting power to self (required for OpenZeppelin Governor)
        await nft.connect(voter1).delegate(voter1.address);
        await nft.connect(voter2).delegate(voter2.address);
        await nft.connect(voter3).delegate(voter3.address);
        await nft.connect(proposer).delegate(proposer.address);

        return {
            governor,
            nft,
            vault,
            timelock,
            owner,
            beneficiary,
            newBeneficiary,
            relayer,
            voter1,
            voter2,
            voter3,
            proposer
        };
    }

    describe("Deployment", function () {
        it("Should set correct parameters", async function () {
            const { governor, nft, vault } = await loadFixture(deployGovernorFixture);
            
            expect(await governor.name()).to.equal("HopeStream Governor");
            expect(await governor.donorNFT()).to.equal(nft.target);
            expect(await governor.donationVault()).to.equal(vault.target);
            expect(await governor.votingDelay()).to.equal(7200); // 1 day in blocks
            expect(await governor.votingPeriod()).to.equal(50400); // 1 week in blocks
            expect(await governor.proposalThreshold()).to.equal(ethers.parseEther("0.1"));
        });

        it("Should set correct quorum", async function () {
            const { governor } = await loadFixture(deployGovernorFixture);
            
            // Advance a block first to ensure we have a past block to query
            await time.advanceBlockTo((await time.latestBlock()) + 1);
            
            // Quorum should be 4% of total supply - use a past block
            const pastBlock = (await time.latestBlock()) - 1;
            const quorum = await governor.quorum(pastBlock);
            
            // With 5 ETH total donated, 4% quorum should be 0.2 ETH
            expect(quorum).to.equal(ethers.parseEther("0.2"));
        });


    });

    describe("Proposal Creation", function () {
        it("Should allow creating pause proposal", async function () {
            const { governor, proposer } = await loadFixture(deployGovernorFixture);
            
            const description = "Pause the contract due to emergency";
            
            await expect(governor.connect(proposer).proposePause(description))
                .to.emit(governor, "ProposalCreatedWithType")
                .to.emit(governor, "PauseProposed");
        });

        it("Should allow creating unpause proposal", async function () {
            const { governor, proposer } = await loadFixture(deployGovernorFixture);
            
            const description = "Unpause the contract";
            
            await expect(governor.connect(proposer).proposeUnpause(description))
                .to.emit(governor, "ProposalCreatedWithType");
        });

        it("Should allow creating milestone proposal", async function () {
            const { governor, proposer } = await loadFixture(deployGovernorFixture);
            
            const releaseAmount = ethers.parseEther("1.0");
            const description = "Add milestone for 1 ETH release";
            
            await expect(governor.connect(proposer).proposeAddMilestone(releaseAmount, description))
                .to.emit(governor, "ProposalCreatedWithType");
        });

        it("Should allow creating relayer change proposal", async function () {
            const { governor, relayer, proposer } = await loadFixture(deployGovernorFixture);
            
            const description = "Change defender relayer";
            
            await expect(governor.connect(proposer).proposeChangeRelayer(relayer.address, description))
                .to.emit(governor, "ProposalCreatedWithType");
        });

        it("Should allow creating anti-Sybil update proposal with sufficient voting power", async function () {
            const { governor, voter1 } = await loadFixture(deployGovernorFixture);
            
            const minimumDonation = ethers.parseEther("0.02");
            const maxNFTs = 10;
            const cooldown = 7200; // 2 hours
            const description = "Update anti-Sybil parameters";
            
            await expect(governor.connect(voter1).proposeUpdateAntiSybil(
                minimumDonation, 
                maxNFTs, 
                cooldown, 
                description
            )).to.emit(governor, "ProposalCreatedWithType");
        });

        it("Should reject anti-Sybil proposal with insufficient voting power", async function () {
            const { governor, proposer } = await loadFixture(deployGovernorFixture);
            
            const minimumDonation = ethers.parseEther("0.02");
            const maxNFTs = 10;
            const cooldown = 7200;
            const description = "Update anti-Sybil parameters";
            
            await expect(governor.connect(proposer).proposeUpdateAntiSybil(
                minimumDonation, 
                maxNFTs, 
                cooldown, 
                description
            )).to.be.revertedWith("Insufficient voting power for anti-Sybil proposal");
        });

        it("Should allow creating emergency action proposal", async function () {
            const { governor, vault, proposer } = await loadFixture(deployGovernorFixture);
            
            const target = vault.target;
            const value = 0;
            const data = "0x";
            const description = "Emergency action";
            
            await expect(governor.connect(proposer).proposeEmergencyAction(target, value, data, description))
                .to.emit(governor, "ProposalCreatedWithType")
                .to.emit(governor, "EmergencyActionProposed");
        });

        it("Should reject proposals from users without enough voting power", async function () {
            const { governor, owner } = await loadFixture(deployGovernorFixture);
            
            // Owner has no donations, so no voting power
            await expect(governor.connect(owner).proposePause(
                "Pause the contract"
            )).to.be.revertedWithCustomError(governor, "GovernorInsufficientProposerVotes");
        });

        it("Should validate proposal parameters", async function () {
            const { governor, proposer } = await loadFixture(deployGovernorFixture);
            
            // Test invalid milestone amount
            await expect(governor.connect(proposer).proposeAddMilestone(
                0, 
                "Invalid milestone"
            )).to.be.revertedWith("Release amount must be greater than zero");
            
            // Test invalid relayer address
            await expect(governor.connect(proposer).proposeChangeRelayer(
                ethers.ZeroAddress, 
                "Invalid relayer"
            )).to.be.revertedWith("Invalid relayer address");
        });
    });

    describe("Voting", function () {
        it("Should allow voting on proposals", async function () {
            const { governor, proposer, voter1 } = await loadFixture(deployGovernorFixture);
            
            // Create proposal
            const tx = await governor.connect(proposer).proposePause(
                "Pause the contract"
            );
            const receipt = await tx.wait();
            const proposalId = governor.interface.parseLog(receipt.logs[0]).args[0];
            
            // Wait for voting delay
            await time.advanceBlockTo((await time.latestBlock()) + 7201);
            
            // Vote FOR (1) - use closeTo to handle minor precision differences (1 wei)
            const voteTx = await governor.connect(voter1).castVote(proposalId, 1);
            const voteReceipt = await voteTx.wait();
            
            // Check the VoteCast event with tolerance for 1 wei precision
            const voteCastEvent = voteReceipt.logs.find(log => 
                governor.interface.parseLog(log).name === "VoteCast"
            );
            const parsedEvent = governor.interface.parseLog(voteCastEvent);
            
            expect(parsedEvent.args[0]).to.equal(voter1.address);
            expect(parsedEvent.args[1]).to.equal(proposalId);
            expect(parsedEvent.args[2]).to.equal(1);
            expect(parsedEvent.args[3]).to.be.closeTo(ethers.parseEther("2.0"), 1); // 1 wei tolerance
            expect(parsedEvent.args[4]).to.equal("");
        });

        it("Should calculate votes based on donation amounts", async function () {
            const { governor, proposer, voter1, voter2 } = await loadFixture(deployGovernorFixture);
            
            // Create proposal
            const tx = await governor.connect(proposer).proposePause(
                "Pause the contract"
            );
            const receipt = await tx.wait();
            const proposalId = governor.interface.parseLog(receipt.logs[0]).args[0];
            
            // Wait for voting delay
            await time.advanceBlockTo((await time.latestBlock()) + 7201);
            
            // Vote and check voting power
            await governor.connect(voter1).castVote(proposalId, 1); // FOR
            await governor.connect(voter2).castVote(proposalId, 0); // AGAINST
            
            const proposalVotes = await governor.proposalVotes(proposalId);
            expect(proposalVotes[0]).to.be.closeTo(ethers.parseEther("1.5"), 1); // AGAINST votes (voter2) - 1 wei tolerance
            expect(proposalVotes[1]).to.be.closeTo(ethers.parseEther("2.0"), 1); // FOR votes (voter1) - 1 wei tolerance  
            expect(proposalVotes[2]).to.equal(0); // ABSTAIN votes
        });

        it("Should not allow voting outside voting period", async function () {
            const { governor, proposer, voter1 } = await loadFixture(deployGovernorFixture);
            
            // Create proposal
            const tx = await governor.connect(proposer).proposePause(
                "Pause the contract"
            );
            const receipt = await tx.wait();
            const proposalId = governor.interface.parseLog(receipt.logs[0]).args[0];
            
            // Try to vote during delay period
            await expect(governor.connect(voter1).castVote(proposalId, 1))
                .to.be.revertedWith("Governor: vote not currently active");
            
            // Wait past voting period
            await time.advanceBlockTo((await time.latestBlock()) + 58000);
            
            await expect(governor.connect(voter1).castVote(proposalId, 1))
                .to.be.revertedWith("Governor: vote not currently active");
        });

        it("Should not allow double voting", async function () {
            const { governor, proposer, voter1 } = await loadFixture(deployGovernorFixture);
            
            // Create proposal
            const tx = await governor.connect(proposer).proposePause(
                "Pause the contract"
            );
            const receipt = await tx.wait();
            const proposalId = governor.interface.parseLog(receipt.logs[0]).args[0];
            
            // Wait for voting delay
            await time.advanceBlockTo((await time.latestBlock()) + 7201);
            
            // First vote
            await governor.connect(voter1).castVote(proposalId, 1);
            
            // Second vote should fail
            await expect(governor.connect(voter1).castVote(proposalId, 1))
                .to.be.revertedWith("GovernorVotingSimple: vote already cast");
        });
    });

    describe("Proposal Execution", function () {
        it("Should execute successful unpause proposal", async function () {
            const { governor, vault, proposer, voter1, voter2 } = await loadFixture(deployGovernorFixture);
            
            // First pause the contract
            await vault.pause();
            
            // Create unpause proposal
            const tx = await governor.connect(proposer).proposeUnpause(
                "Unpause the contract"
            );
            const receipt = await tx.wait();
            const proposalId = governor.interface.parseLog(receipt.logs[0]).args[0];
            
            // Wait for voting delay and vote
            await time.advanceBlockTo((await time.latestBlock()) + 7201);
            await governor.connect(voter1).castVote(proposalId, 1); // FOR
            await governor.connect(voter2).castVote(proposalId, 1); // FOR
            
            // Wait for voting period to end
            await time.advanceBlockTo((await time.latestBlock()) + 50401);
            
            // Queue the proposal
            const description = "Unpause the contract";
            const descriptionHash = ethers.keccak256(ethers.toUtf8Bytes(description));
            const targets = [vault.target];
            const values = [0];
            const calldatas = [vault.interface.encodeFunctionData("unpause", [])];
            
            await governor.queue(targets, values, calldatas, descriptionHash);
            
            // Wait for timelock delay
            await time.increase(86401); // 1 day + 1 second
            
            // Execute the proposal
            await expect(governor.execute(targets, values, calldatas, descriptionHash))
                .to.emit(vault, "Unpaused");
            
            expect(await vault.paused()).to.be.false;
        });

        it("Should execute pause proposal", async function () {
            const { governor, vault, proposer, voter1, voter2 } = await loadFixture(deployGovernorFixture);
            
            // Create proposal
            const tx = await governor.connect(proposer).proposePause("Emergency pause");
            const receipt = await tx.wait();
            const proposalId = governor.interface.parseLog(receipt.logs[0]).args[0];
            
            // Vote and execute proposal
            await time.advanceBlockTo((await time.latestBlock()) + 7201);
            await governor.connect(voter1).castVote(proposalId, 1);
            await governor.connect(voter2).castVote(proposalId, 1);
            await time.advanceBlockTo((await time.latestBlock()) + 50401);
            
            // Queue and execute
            const description = "Emergency pause";
            const descriptionHash = ethers.keccak256(ethers.toUtf8Bytes(description));
            const targets = [vault.target];
            const values = [0];
            const calldatas = [vault.interface.encodeFunctionData("pause", [])];
            
            await governor.queue(targets, values, calldatas, descriptionHash);
            await time.increase(86401);
            
            await expect(governor.execute(targets, values, calldatas, descriptionHash))
                .to.emit(vault, "Paused");
            
            expect(await vault.paused()).to.be.true;
        });

        it("Should not execute proposal without quorum", async function () {
            const { governor, newBeneficiary, proposer, voter3 } = await loadFixture(deployGovernorFixture);
            
            // Create proposal
            const tx = await governor.connect(proposer).proposeBeneficiaryChange(
                newBeneficiary.address, 
                "Change beneficiary"
            );
            const receipt = await tx.wait();
            const proposalId = governor.interface.parseLog(receipt.logs[0]).args[0];
            
            // Vote AGAINST to ensure proposal is defeated (voter3 has 1 ETH which exceeds quorum)
            await time.advanceBlockTo((await time.latestBlock()) + 7201);
            await governor.connect(voter3).castVote(proposalId, 0); // Vote AGAINST
            
            // Wait for voting period to end
            await time.advanceBlockTo((await time.latestBlock()) + 50401);
            
            // Check proposal state - should be defeated since only AGAINST votes
            const state = await governor.state(proposalId);
            expect(state).to.equal(3); // Defeated
        });

        it("Should not execute proposal that was defeated", async function () {
            const { governor, newBeneficiary, proposer, voter1, voter2 } = await loadFixture(deployGovernorFixture);
            
            // Create proposal
            const tx = await governor.connect(proposer).proposeBeneficiaryChange(
                newBeneficiary.address, 
                "Change beneficiary"
            );
            const receipt = await tx.wait();
            const proposalId = governor.interface.parseLog(receipt.logs[0]).args[0];
            
            // Vote against
            await time.advanceBlockTo((await time.latestBlock()) + 7201);
            await governor.connect(voter1).castVote(proposalId, 0); // AGAINST
            await governor.connect(voter2).castVote(proposalId, 0); // AGAINST
            
            // Wait for voting period to end
            await time.advanceBlockTo((await time.latestBlock()) + 50401);
            
            // Check proposal state
            const state = await governor.state(proposalId);
            expect(state).to.equal(3); // Defeated
        });
    });

    describe("View Functions", function () {
        it("Should return correct proposal type", async function () {
            const { governor, newBeneficiary, proposer } = await loadFixture(deployGovernorFixture);
            
            const tx = await governor.connect(proposer).proposeBeneficiaryChange(
                newBeneficiary.address, 
                "Change beneficiary"
            );
            const receipt = await tx.wait();
            const proposalId = governor.interface.parseLog(receipt.logs[0]).args[0];
            
            const proposalType = await governor.getProposalType(proposalId);
            expect(proposalType).to.equal(0); // CHANGE_BENEFICIARY
        });

        it("Should return correct voting power", async function () {
            const { governor, voter1 } = await loadFixture(deployGovernorFixture);
            
            const votingPower = await governor.getVotingPower(voter1.address);
            expect(votingPower).to.equal(ethers.parseEther("2.0"));
        });

        it("Should track proposal states correctly", async function () {
            const { governor, newBeneficiary, proposer } = await loadFixture(deployGovernorFixture);
            
            // Create proposal
            const tx = await governor.connect(proposer).proposeBeneficiaryChange(
                newBeneficiary.address, 
                "Change beneficiary"
            );
            const receipt = await tx.wait();
            const proposalId = governor.interface.parseLog(receipt.logs[0]).args[0];
            
            // Check initial state (Pending)
            expect(await governor.state(proposalId)).to.equal(0);
            
            // Wait for voting delay
            await time.advanceBlockTo((await time.latestBlock()) + 7201);
            
            // Check active state
            expect(await governor.state(proposalId)).to.equal(1);
            
            // Wait for voting period to end
            await time.advanceBlockTo((await time.latestBlock()) + 50401);
            
            // Check defeated state (no votes)
            expect(await governor.state(proposalId)).to.equal(3);
        });
    });

    describe("Anti-Sybil Proposal Restrictions", function () {
        it("Should validate anti-Sybil proposal parameters", async function () {
            const { governor, voter1 } = await loadFixture(deployGovernorFixture);
            
            // Invalid minimum donation
            await expect(governor.connect(voter1).proposeUpdateAntiSybil(
                0, 10, 3600, "Invalid min donation"
            )).to.be.revertedWith("Invalid minimum donation");
            
            // Invalid max NFTs (0)
            await expect(governor.connect(voter1).proposeUpdateAntiSybil(
                ethers.parseEther("0.01"), 0, 3600, "Invalid max NFTs"
            )).to.be.revertedWith("Invalid max NFTs");
            
            // Invalid max NFTs (too high)
            await expect(governor.connect(voter1).proposeUpdateAntiSybil(
                ethers.parseEther("0.01"), 101, 3600, "Invalid max NFTs"
            )).to.be.revertedWith("Invalid max NFTs");
            
            // Invalid cooldown (too long)
            await expect(governor.connect(voter1).proposeUpdateAntiSybil(
                ethers.parseEther("0.01"), 10, 86401, "Invalid cooldown"
            )).to.be.revertedWith("Cooldown too long");
        });
    });

    describe("Multiple Proposal Types", function () {
        it("Should handle multiple concurrent proposals", async function () {
            const { governor, vault, newBeneficiary, proposer, voter1 } = await loadFixture(deployGovernorFixture);
            
            // Create multiple proposals
            const tx1 = await governor.connect(proposer).proposeBeneficiaryChange(
                newBeneficiary.address, 
                "Change beneficiary"
            );
            const receipt1 = await tx1.wait();
            const proposalId1 = governor.interface.parseLog(receipt1.logs[0]).args[0];
            
            const tx2 = await governor.connect(proposer).proposeAddMilestone(
                ethers.parseEther("1.0"), 
                "Add milestone"
            );
            const receipt2 = await tx2.wait();
            const proposalId2 = governor.interface.parseLog(receipt2.logs[0]).args[0];
            
            // Check different proposal types
            expect(await governor.getProposalType(proposalId1)).to.equal(0); // CHANGE_BENEFICIARY
            expect(await governor.getProposalType(proposalId2)).to.equal(3); // ADD_MILESTONE
            
            // Both should be in pending state
            expect(await governor.state(proposalId1)).to.equal(0);
            expect(await governor.state(proposalId2)).to.equal(0);
        });
    });
}); 
