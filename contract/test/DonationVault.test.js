const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time, loadFixture } = require("@nomicfoundation/hardhat-toolbox/network-helpers");

describe("DonationVault", function () {
    async function deployDonationVaultFixture() {
        const [owner, beneficiary, relayer, governance, donor1, donor2, donor3, donor4] = await ethers.getSigners();

        // Deploy NFT contract first (required for the vault)
        const HopeStreamNFT = await ethers.getContractFactory("HopeStreamNFT");
        const nft = await HopeStreamNFT.deploy(owner.address);

        // Deploy DonationVault
        const DonationVault = await ethers.getContractFactory("DonationVault");
        const vault = await DonationVault.deploy(beneficiary.address, owner.address);

        // Set up governance and relayer first (required for other function calls)
        await vault.setGovernanceContract(governance.address);
        await vault.connect(owner).setDefenderRelayer(relayer.address);
        
        // Set up the relationship between contracts
        await vault.connect(owner).setDonorNFT(nft.target);
        await nft.setDonationVault(vault.target);

        return { 
            vault, 
            nft, 
            owner, 
            beneficiary, 
            relayer, 
            governance, 
            donor1, 
            donor2, 
            donor3, 
            donor4 
        };
    }

    describe("Deployment", function () {
        it("Should set the correct beneficiary", async function () {
            const { vault, beneficiary } = await loadFixture(deployDonationVaultFixture);
            expect(await vault.beneficiary()).to.equal(beneficiary.address);
        });

        it("Should set the correct owner", async function () {
            const { vault, owner } = await loadFixture(deployDonationVaultFixture);
            expect(await vault.owner()).to.equal(owner.address);
        });

        it("Should initialize with correct default values", async function () {
            const { vault } = await loadFixture(deployDonationVaultFixture);
            expect(await vault.totalDonated()).to.equal(0);
            expect(await vault.totalReleased()).to.equal(0);
            expect(await vault.magnitudeThreshold()).to.equal(7);
            expect(await vault.minimumDonationForNFT()).to.equal(ethers.parseEther("0.01"));
            expect(await vault.maxNFTsPerAddress()).to.equal(15);
            expect(await vault.donationCooldown()).to.equal(3600); // 1 hour
        });

        it("Should reject zero address as beneficiary", async function () {
            const [owner] = await ethers.getSigners();
            const DonationVault = await ethers.getContractFactory("DonationVault");
            
            await expect(DonationVault.deploy(ethers.ZeroAddress, owner.address))
                .to.be.revertedWith("Invalid beneficiary");
        });
    });

    describe("Contract Setup", function () {
        it("Should allow owner to set donor NFT", async function () {
            const { vault, nft, governance } = await loadFixture(deployDonationVaultFixture);
            await expect(vault.connect(governance).setDonorNFT(nft.target))
                .to.not.be.reverted;
        });

        it("Should allow governance to set donor NFT", async function () {
            const { vault, nft, governance } = await loadFixture(deployDonationVaultFixture);
            await expect(vault.connect(governance).setDonorNFT(nft.target))
                .to.not.be.reverted;
        });

        it("Should allow owner to set governance contract", async function () {
            const { vault, owner, governance } = await loadFixture(deployDonationVaultFixture);
            await expect(vault.connect(owner).setGovernanceContract(governance.address))
                .to.emit(vault, "GovernanceContractChanged")
                .withArgs(governance.address, governance.address);
        });

        it("Should allow setting defender relayer", async function () {
            const { vault, governance, relayer } = await loadFixture(deployDonationVaultFixture);
            await expect(vault.connect(governance).setDefenderRelayer(relayer.address))
                .to.emit(vault, "DefenderRelayerChanged")
                .withArgs(relayer.address, relayer.address);
        });

        it("Should reject zero address for relayer", async function () {
            const { vault, governance } = await loadFixture(deployDonationVaultFixture);
            await expect(vault.connect(governance).setDefenderRelayer(ethers.ZeroAddress))
                .to.be.revertedWith("Invalid relayer address");
        });
    });

    describe("Donation Receiving", function () {
        it("Should accept donations and emit events", async function () {
            const { vault, donor1 } = await loadFixture(deployDonationVaultFixture);
            const donationAmount = ethers.parseEther("0.1");
            
            await expect(donor1.sendTransaction({ to: vault.target, value: donationAmount }))
                .to.emit(vault, "DonationReceived")
                .withArgs(donor1.address, donationAmount);
            
            expect(await vault.totalDonated()).to.equal(donationAmount);
        });

        it("Should mint NFT for qualifying donations", async function () {
            const { vault, nft, donor1 } = await loadFixture(deployDonationVaultFixture);
            const donationAmount = ethers.parseEther("0.1"); // Above minimum threshold
            
            await expect(donor1.sendTransaction({ to: vault.target, value: donationAmount }))
                .to.emit(nft, "DonorNFTMinted")
                .withArgs(donor1.address, 0, donationAmount);
            
            expect(await nft.ownerOf(0)).to.equal(donor1.address);
            expect(await nft.tokenDonationAmount(0)).to.equal(donationAmount);
        });

        it("Should reject zero-value donations", async function () {
            const { vault, donor1 } = await loadFixture(deployDonationVaultFixture);
            
            await expect(donor1.sendTransaction({ to: vault.target, value: 0 }))
                .to.be.revertedWith("No ETH sent");
        });

        it("Should not mint NFT for donations below threshold", async function () {
            const { vault, nft, donor1 } = await loadFixture(deployDonationVaultFixture);
            const donationAmount = ethers.parseEther("0.005"); // Below minimum threshold
            
            await expect(donor1.sendTransaction({ to: vault.target, value: donationAmount }))
                .to.emit(vault, "DonationBelowThreshold")
                .withArgs(donor1.address, donationAmount, ethers.parseEther("0.01"));
            
            expect(await nft.balanceOf(donor1.address)).to.equal(0);
        });

        it("Should work when contract is not paused", async function () {
            const { vault, donor1 } = await loadFixture(deployDonationVaultFixture);
            const donationAmount = ethers.parseEther("0.1");
            
            await expect(donor1.sendTransaction({ to: vault.target, value: donationAmount }))
                .to.not.be.reverted;
        });

        it("Should reject donations when contract is paused", async function () {
            const { vault, owner, donor1 } = await loadFixture(deployDonationVaultFixture);
            
            await vault.connect(owner).pause();
            
            await expect(donor1.sendTransaction({ to: vault.target, value: ethers.parseEther("0.1") }))
                .to.be.revertedWithCustomError(vault, "EnforcedPause");
        });
    });

    describe("Anti-Sybil Protection", function () {
        it("Should enforce minimum donation amount", async function () {
            const { vault, donor1 } = await loadFixture(deployDonationVaultFixture);
            const lowAmount = ethers.parseEther("0.005");
            
            await expect(donor1.sendTransaction({ to: vault.target, value: lowAmount }))
                .to.emit(vault, "DonationBelowThreshold");
        });

        it("Should enforce cooldown period", async function () {
            const { vault, donor1 } = await loadFixture(deployDonationVaultFixture);
            const donationAmount = ethers.parseEther("0.1");
            
            // First donation should succeed
            await donor1.sendTransaction({ to: vault.target, value: donationAmount });
            
            // Second donation immediately should fail
            await expect(donor1.sendTransaction({ to: vault.target, value: donationAmount }))
                .to.emit(vault, "DonationInCooldown");
        });

        it("Should allow donations after cooldown period", async function () {
            const { vault, nft, donor1 } = await loadFixture(deployDonationVaultFixture);
            const donationAmount = ethers.parseEther("0.1");
            
            // First donation
            await donor1.sendTransaction({ to: vault.target, value: donationAmount });
            
            // Fast forward time beyond cooldown
            await time.increase(3601); // 1 hour + 1 second
            
            // Second donation should succeed
            await expect(donor1.sendTransaction({ to: vault.target, value: donationAmount }))
                .to.emit(nft, "DonorNFTMinted");
            
            expect(await nft.balanceOf(donor1.address)).to.equal(2);
        });

        it("Should enforce maximum NFTs per address", async function () {
            const { vault, donor1 } = await loadFixture(deployDonationVaultFixture);
            const donationAmount = ethers.parseEther("0.1");
            
            // Make 15 donations (the maximum)
            for (let i = 0; i < 15; i++) {
                await donor1.sendTransaction({ to: vault.target, value: donationAmount });
                await time.increase(3601); // Skip cooldown
            }
            
            // 16th donation should fail
            await expect(donor1.sendTransaction({ to: vault.target, value: donationAmount }))
                .to.emit(vault, "MaxNFTsReached");
        });

        it("Should implement progressive donation thresholds", async function () {
            const { vault, donor1 } = await loadFixture(deployDonationVaultFixture);
            const baseAmount = ethers.parseEther("0.01");
            
            // First donation with minimum amount should succeed
            await donor1.sendTransaction({ to: vault.target, value: baseAmount });
            await time.increase(3601);
            
            // Second donation with same amount should succeed (still 1x)
            await donor1.sendTransaction({ to: vault.target, value: baseAmount });
            await time.increase(3601);
            
            // Third donation requires 1.5x (progressive threshold)
            const requiredAmount = baseAmount * 3n / 2n; // 1.5x
            await expect(donor1.sendTransaction({ to: vault.target, value: baseAmount }))
                .to.emit(vault, "DonationBelowThreshold");
            
            // But with correct amount should succeed
            await expect(donor1.sendTransaction({ to: vault.target, value: requiredAmount }))
                .to.not.be.reverted;
        });

        it("Should update anti-Sybil parameters", async function () {
            const { vault, owner } = await loadFixture(deployDonationVaultFixture);
            const newMinDonation = ethers.parseEther("0.05");
            const newMaxNFTs = 10;
            const newCooldown = 7200; // 2 hours
            
            await expect(vault.connect(owner).updateAntiSybilParameters(newMinDonation, newMaxNFTs, newCooldown))
                .to.emit(vault, "AntiSybilParametersUpdated")
                .withArgs(newMinDonation, newMaxNFTs, newCooldown);
            
            expect(await vault.minimumDonationForNFT()).to.equal(newMinDonation);
            expect(await vault.maxNFTsPerAddress()).to.equal(newMaxNFTs);
            expect(await vault.donationCooldown()).to.equal(newCooldown);
        });
    });

    describe("Milestone Management", function () {
        it("Should allow owner to add milestones", async function () {
            const { vault, owner } = await loadFixture(deployDonationVaultFixture);
            const releaseAmount = ethers.parseEther("1.0");
            
            // Don't check exact timestamp due to block mining timing
            await expect(vault.connect(owner).addMilestone(releaseAmount))
                .to.emit(vault, "MilestoneAdded");
            
            expect(await vault.getMilestonesCount()).to.equal(1);
        });

        it("Should allow governance to add milestones", async function () {
            const { vault, governance } = await loadFixture(deployDonationVaultFixture);
            const releaseAmount = ethers.parseEther("1.0");
            
            await expect(vault.connect(governance).addMilestone(releaseAmount))
                .to.emit(vault, "MilestoneAdded");
        });

        it("Should add milestone with custom time", async function () {
            const { vault, governance } = await loadFixture(deployDonationVaultFixture);
            const releaseAmount = ethers.parseEther("1.0");
            const currentTime = await time.latest();
            const releaseTime = currentTime + 86400; // 1 day later
            
            await expect(vault.connect(governance).addMilestoneWithTime(releaseTime, releaseAmount))
                .to.emit(vault, "MilestoneAdded")
                .withArgs(releaseAmount, releaseTime);
        });

        it("Should reject milestone with zero amount", async function () {
            const { vault, owner } = await loadFixture(deployDonationVaultFixture);
            
            await expect(vault.connect(owner).addMilestone(0))
                .to.be.revertedWith("Release amount must be greater than zero");
        });

        it("Should reject milestone with past time", async function () {
            const { vault, governance } = await loadFixture(deployDonationVaultFixture);
            const releaseAmount = ethers.parseEther("1.0");
            const pastTime = (await time.latest()) - 1000;
            
            await expect(vault.connect(governance).addMilestoneWithTime(pastTime, releaseAmount))
                .to.be.revertedWith("Release time must be in the future");
        });

        it("Should reject non-authorized milestone addition", async function () {
            const { vault, donor1 } = await loadFixture(deployDonationVaultFixture);
            const releaseAmount = ethers.parseEther("1.0");
            
            await expect(vault.connect(donor1).addMilestone(releaseAmount))
                .to.be.revertedWith("Caller is not governance or owner");
        });
    });

    describe("Fund Release", function () {
        it("Should release funds when milestone time is reached", async function () {
            const { vault, owner, beneficiary, relayer, donor1 } = await loadFixture(deployDonationVaultFixture);
            const donationAmount = ethers.parseEther("2.0");
            const releaseAmount = ethers.parseEther("1.0");
            
            // Add donation
            await donor1.sendTransaction({ to: vault.target, value: donationAmount });
            
            // Add milestone
            await vault.connect(owner).addMilestone(releaseAmount);
            
            // Fast forward time to release milestone
            await time.increase(30 * 24 * 3600 + 1); // 30 days + 1 second
            
            const beneficiaryBalanceBefore = await ethers.provider.getBalance(beneficiary.address);
            
            // Release funds - don't check exact timestamp due to block mining timing
            await expect(vault.connect(relayer).releaseFunds())
                .to.emit(vault, "MilestoneReleased");
            
            const beneficiaryBalanceAfter = await ethers.provider.getBalance(beneficiary.address);
            expect(beneficiaryBalanceAfter - beneficiaryBalanceBefore).to.equal(releaseAmount);
            expect(await vault.totalReleased()).to.equal(releaseAmount);
        });

        it("Should not release funds before milestone time", async function () {
            const { vault, owner, relayer, donor1 } = await loadFixture(deployDonationVaultFixture);
            const donationAmount = ethers.parseEther("2.0");
            const releaseAmount = ethers.parseEther("1.0");
            
            // Add donation and milestone
            await donor1.sendTransaction({ to: vault.target, value: donationAmount });
            await vault.connect(owner).addMilestone(releaseAmount);
            
            // Try to release funds immediately (should not release anything)
            await vault.connect(relayer).releaseFunds();
            
            expect(await vault.totalReleased()).to.equal(0);
        });

        it("Should allow owner to release funds", async function () {
            const { vault, owner, donor1 } = await loadFixture(deployDonationVaultFixture);
            const donationAmount = ethers.parseEther("2.0");
            const releaseAmount = ethers.parseEther("1.0");
            
            await donor1.sendTransaction({ to: vault.target, value: donationAmount });
            await vault.connect(owner).addMilestone(releaseAmount);
            await time.increase(30 * 24 * 3600 + 1);
            
            await expect(vault.connect(owner).releaseFunds())
                .to.emit(vault, "MilestoneReleased");
        });

        it("Should allow governance to release funds", async function () {
            const { vault, governance, donor1 } = await loadFixture(deployDonationVaultFixture);
            const donationAmount = ethers.parseEther("2.0");
            const releaseAmount = ethers.parseEther("1.0");
            
            await donor1.sendTransaction({ to: vault.target, value: donationAmount });
            await vault.connect(governance).addMilestone(releaseAmount);
            await time.increase(30 * 24 * 3600 + 1);
            
            await expect(vault.connect(governance).releaseFunds())
                .to.emit(vault, "MilestoneReleased");
        });

        it("Should reject unauthorized fund release", async function () {
            const { vault, donor1 } = await loadFixture(deployDonationVaultFixture);
            
            await expect(vault.connect(donor1).releaseFunds())
                .to.be.revertedWith("Not authorized");
        });

        it("Should not release funds when paused", async function () {
            const { vault, owner, relayer, donor1 } = await loadFixture(deployDonationVaultFixture);
            const donationAmount = ethers.parseEther("2.0");
            const releaseAmount = ethers.parseEther("1.0");
            
            await donor1.sendTransaction({ to: vault.target, value: donationAmount });
            await vault.connect(owner).addMilestone(releaseAmount);
            await time.increase(30 * 24 * 3600 + 1);
            
            // Pause the contract
            await vault.connect(owner).pause();
            
            await expect(vault.connect(relayer).releaseFunds())
                .to.be.revertedWith("Pausable: paused");
        });

        it("Should handle insufficient balance gracefully", async function () {
            const { vault, owner, relayer, donor1 } = await loadFixture(deployDonationVaultFixture);
            const donationAmount = ethers.parseEther("1.0");
            const releaseAmount = ethers.parseEther("2.0"); // More than donated
            
            await donor1.sendTransaction({ to: vault.target, value: donationAmount });
            await vault.connect(owner).addMilestone(releaseAmount);
            await time.increase(30 * 24 * 3600 + 1);
            
            await expect(vault.connect(relayer).releaseFunds())
                .to.be.revertedWith("Insufficient balance for release");
        });
    });

    describe("Pause/Unpause", function () {
        it("Should allow owner to pause contract", async function () {
            const { vault, owner } = await loadFixture(deployDonationVaultFixture);
            
            await expect(vault.connect(owner).pause())
                .to.emit(vault, "Paused")
                .withArgs(owner.address);
            
            expect(await vault.paused()).to.be.true;
        });

        it("Should allow governance to pause contract", async function () {
            const { vault, governance } = await loadFixture(deployDonationVaultFixture);
            
            await expect(vault.connect(governance).pause())
                .to.emit(vault, "Paused");
        });

        it("Should allow owner to unpause contract", async function () {
            const { vault, owner } = await loadFixture(deployDonationVaultFixture);
            
            await vault.connect(owner).pause();
            
            await expect(vault.connect(owner).unpause())
                .to.emit(vault, "Unpaused")
                .withArgs(owner.address);
            
            expect(await vault.paused()).to.be.false;
        });

        it("Should reject unauthorized pause", async function () {
            const { vault, donor1 } = await loadFixture(deployDonationVaultFixture);
            
            await expect(vault.connect(donor1).pause())
                .to.be.revertedWith("Caller is not governance or owner");
        });
    });

    describe("DAO Donation", function () {
        it("Should allow governance to donate directly", async function () {
            const { vault, governance } = await loadFixture(deployDonationVaultFixture);
            const donationAmount = ethers.parseEther("1.0");
            
            await expect(vault.connect(governance).donateFromDAO({ value: donationAmount }))
                .to.emit(vault, "DonationReceived")
                .withArgs(governance.address, donationAmount);
            
            expect(await vault.totalDonated()).to.equal(donationAmount);
        });

        it("Should reject DAO donation with zero value", async function () {
            const { vault, governance } = await loadFixture(deployDonationVaultFixture);
            
            await expect(vault.connect(governance).donateFromDAO({ value: 0 }))
                .to.be.revertedWith("No ETH sent");
        });

        it("Should reject unauthorized DAO donation", async function () {
            const { vault, donor1 } = await loadFixture(deployDonationVaultFixture);
            
            await expect(vault.connect(donor1).donateFromDAO({ value: ethers.parseEther("1.0") }))
                .to.be.revertedWith("Caller is not governance or owner");
        });
    });

    describe("View Functions", function () {
        it("Should return correct donor info", async function () {
            const { vault, donor1 } = await loadFixture(deployDonationVaultFixture);
            const donationAmount = ethers.parseEther("0.1");
            
            await donor1.sendTransaction({ to: vault.target, value: donationAmount });
            
            const info = await vault.getDonorInfo(donor1.address);
            expect(info[0]).to.equal(1); // nftCount
            expect(info[1]).to.equal(donationAmount); // totalDonated
            expect(info[2]).to.be.greaterThan(0); // lastDonation
        });

        it("Should return correct anti-Sybil parameters", async function () {
            const { vault } = await loadFixture(deployDonationVaultFixture);
            
            const params = await vault.getAntiSybilParameters();
            expect(params[0]).to.equal(ethers.parseEther("0.01")); // minDonation
            expect(params[1]).to.equal(15); // maxNFTs
            expect(params[2]).to.equal(3600); // cooldown
        });

        it("Should return correct DAO stats", async function () {
            const { vault, beneficiary, governance, relayer } = await loadFixture(deployDonationVaultFixture);
            
            const stats = await vault.getDAOStats();
            expect(stats[0]).to.equal(beneficiary.address); // currentBeneficiary
            expect(stats[1]).to.equal(governance.address); // currentGovernance
            expect(stats[2]).to.equal(relayer.address); // currentRelayer
            expect(stats[3]).to.equal(0); // currentDonated
            expect(stats[4]).to.equal(0); // currentReleased
            expect(stats[5]).to.equal(0); // currentMilestones
            expect(stats[6]).to.be.false; // isPaused
        });
    });

    describe("Fallback Function", function () {
        it("Should handle fallback donations", async function () {
            const { vault, donor1 } = await loadFixture(deployDonationVaultFixture);
            const donationAmount = ethers.parseEther("0.1");
            
            // Send transaction with data to trigger fallback
            await expect(donor1.sendTransaction({ 
                to: vault.target, 
                value: donationAmount,
                data: "0x1234" 
            }))
                .to.emit(vault, "DonationReceived")
                .withArgs(donor1.address, donationAmount);
            
            expect(await vault.totalDonated()).to.equal(donationAmount);
        });
    });
}); 
