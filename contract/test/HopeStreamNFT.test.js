const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture } = require("@nomicfoundation/hardhat-toolbox/network-helpers");

describe("HopeStreamNFT", function () {
    async function deployNFTFixture() {
        const [owner, vault, donor1, donor2, donor3] = await ethers.getSigners();

        const HopeStreamNFT = await ethers.getContractFactory("HopeStreamNFT");
        const nft = await HopeStreamNFT.deploy(owner.address);

        // Set the donation vault
        await nft.setDonationVault(vault.address);

        return { nft, owner, vault, donor1, donor2, donor3 };
    }

    describe("Deployment", function () {
        it("Should set the right owner", async function () {
            const { nft, owner } = await loadFixture(deployNFTFixture);
            expect(await nft.owner()).to.equal(owner.address);
        });

        it("Should set correct name and symbol", async function () {
            const { nft } = await loadFixture(deployNFTFixture);
            expect(await nft.name()).to.equal("HopeStream Donor NFT");
            expect(await nft.symbol()).to.equal("HSNFT");
        });

        it("Should initialize with zero tokens", async function () {
            const { nft } = await loadFixture(deployNFTFixture);
            expect(await nft.nextTokenId()).to.equal(0);
        });
    });

    describe("Vault Management", function () {
        it("Should allow owner to set donation vault", async function () {
            const { nft, owner, vault } = await loadFixture(deployNFTFixture);
            await expect(nft.connect(owner).setDonationVault(vault.address))
                .to.not.be.reverted;
            expect(await nft.donationVault()).to.equal(vault.address);
        });

        it("Should reject zero address for vault", async function () {
            const { nft, owner } = await loadFixture(deployNFTFixture);
            await expect(nft.connect(owner).setDonationVault(ethers.ZeroAddress))
                .to.be.revertedWith("Invalid vault address");
        });

        it("Should reject non-owner trying to set vault", async function () {
            const { nft, donor1, vault } = await loadFixture(deployNFTFixture);
            await expect(nft.connect(donor1).setDonationVault(vault.address))
                .to.be.revertedWith("Ownable: caller is not the owner");
        });
    });

    describe("Minting", function () {
        it("Should allow vault to mint NFT", async function () {
            const { nft, vault, donor1 } = await loadFixture(deployNFTFixture);
            const uri = "https://example.com/token/1";
            
            await expect(nft.connect(vault).mint(donor1.address, uri))
                .to.emit(nft, "DonorNFTMinted")
                .withArgs(donor1.address, 0, 0);
            
            expect(await nft.ownerOf(0)).to.equal(donor1.address);
            expect(await nft.tokenURI(0)).to.equal(uri);
            expect(await nft.nextTokenId()).to.equal(1);
        });

        it("Should allow vault to mint NFT with donation tracking", async function () {
            const { nft, vault, donor1 } = await loadFixture(deployNFTFixture);
            const uri = "https://example.com/token/1";
            const donationAmount = ethers.parseEther("1.0");
            
            await expect(nft.connect(vault).mintWithDonation(donor1.address, uri, donationAmount))
                .to.emit(nft, "DonorNFTMinted")
                .withArgs(donor1.address, 0, donationAmount);
            
            expect(await nft.ownerOf(0)).to.equal(donor1.address);
            expect(await nft.tokenDonationAmount(0)).to.equal(donationAmount);
            expect(await nft.totalDonationByAddress(donor1.address)).to.equal(donationAmount);
        });

        it("Should reject non-vault trying to mint", async function () {
            const { nft, donor1, donor2 } = await loadFixture(deployNFTFixture);
            const uri = "https://example.com/token/1";
            
            await expect(nft.connect(donor1).mint(donor2.address, uri))
                .to.be.revertedWith("Only vault can mint");
        });

        it("Should increment token IDs correctly", async function () {
            const { nft, vault, donor1, donor2 } = await loadFixture(deployNFTFixture);
            const uri = "https://example.com/token/";
            
            await nft.connect(vault).mint(donor1.address, uri + "1");
            await nft.connect(vault).mint(donor2.address, uri + "2");
            
            expect(await nft.nextTokenId()).to.equal(2);
            expect(await nft.ownerOf(0)).to.equal(donor1.address);
            expect(await nft.ownerOf(1)).to.equal(donor2.address);
        });
    });

    describe("Soulbound Nature", function () {
        it("Should prevent transfers between users", async function () {
            const { nft, vault, donor1, donor2 } = await loadFixture(deployNFTFixture);
            const uri = "https://example.com/token/1";
            
            await nft.connect(vault).mint(donor1.address, uri);
            
            await expect(nft.connect(donor1).transferFrom(donor1.address, donor2.address, 0))
                .to.be.revertedWith("Soulbound: non-transferable");
        });

        it("Should prevent approve", async function () {
            const { nft, vault, donor1, donor2 } = await loadFixture(deployNFTFixture);
            const uri = "https://example.com/token/1";
            
            await nft.connect(vault).mint(donor1.address, uri);
            
            await expect(nft.connect(donor1).approve(donor2.address, 0))
                .to.be.revertedWith("Soulbound: non-transferable");
        });

        it("Should prevent setApprovalForAll", async function () {
            const { nft, vault, donor1, donor2 } = await loadFixture(deployNFTFixture);
            const uri = "https://example.com/token/1";
            
            await nft.connect(vault).mint(donor1.address, uri);
            
            await expect(nft.connect(donor1).setApprovalForAll(donor2.address, true))
                .to.be.revertedWith("Soulbound: non-transferable");
        });
    });

    describe("Voting Power", function () {
        it("Should calculate voting power based on donation amounts", async function () {
            const { nft, vault, donor1 } = await loadFixture(deployNFTFixture);
            const uri = "https://example.com/token/";
            const donation1 = ethers.parseEther("1.0");
            const donation2 = ethers.parseEther("2.0");
            
            await nft.connect(vault).mintWithDonation(donor1.address, uri + "1", donation1);
            await nft.connect(vault).mintWithDonation(donor1.address, uri + "2", donation2);
            
            const expectedVotingPower = donation1 + donation2;
            expect(await nft.getVotes(donor1.address)).to.equal(expectedVotingPower);
            expect(await nft.getVotingPower(donor1.address)).to.equal(expectedVotingPower);
        });

        it("Should return zero voting power for non-donors", async function () {
            const { nft, donor1 } = await loadFixture(deployNFTFixture);
            expect(await nft.getVotes(donor1.address)).to.equal(0);
        });

        it("Should track voting power correctly for multiple donors", async function () {
            const { nft, vault, donor1, donor2 } = await loadFixture(deployNFTFixture);
            const uri = "https://example.com/token/";
            const donation1 = ethers.parseEther("1.0");
            const donation2 = ethers.parseEther("3.0");
            
            await nft.connect(vault).mintWithDonation(donor1.address, uri + "1", donation1);
            await nft.connect(vault).mintWithDonation(donor2.address, uri + "2", donation2);
            
            expect(await nft.getVotes(donor1.address)).to.equal(donation1);
            expect(await nft.getVotes(donor2.address)).to.equal(donation2);
        });
    });

    describe("Utility Functions", function () {
        it("Should return correct voting breakdown", async function () {
            const { nft, vault, donor1 } = await loadFixture(deployNFTFixture);
            const uri = "https://example.com/token/";
            const donation1 = ethers.parseEther("1.0");
            const donation2 = ethers.parseEther("2.0");
            
            await nft.connect(vault).mintWithDonation(donor1.address, uri + "1", donation1);
            await nft.connect(vault).mintWithDonation(donor1.address, uri + "2", donation2);
            
            const breakdown = await nft.getVotingBreakdown(donor1.address);
            expect(breakdown[0]).to.equal(2); // nftCount
            expect(breakdown[1]).to.equal(donation1 + donation2); // totalDonation
            expect(breakdown[2]).to.equal(donation1 + donation2); // votingPower
            expect(breakdown[3]).to.equal((donation1 + donation2) / 2n); // averageDonationPerNFT
        });

        it("Should return correct donation amounts", async function () {
            const { nft, vault, donor1 } = await loadFixture(deployNFTFixture);
            const uri = "https://example.com/token/1";
            const donationAmount = ethers.parseEther("1.5");
            
            await nft.connect(vault).mintWithDonation(donor1.address, uri, donationAmount);
            
            expect(await nft.getTokenDonationAmount(0)).to.equal(donationAmount);
            expect(await nft.getTotalDonationAmount(donor1.address)).to.equal(donationAmount);
            expect(await nft.getVotingPowerByDonation(donor1.address)).to.equal(donationAmount);
        });

        it("Should handle zero donation amounts correctly", async function () {
            const { nft, vault, donor1 } = await loadFixture(deployNFTFixture);
            const uri = "https://example.com/token/1";
            
            await nft.connect(vault).mint(donor1.address, uri);
            
            expect(await nft.getTokenDonationAmount(0)).to.equal(0);
            expect(await nft.getTotalDonationAmount(donor1.address)).to.equal(0);
        });
    });

    describe("Edge Cases", function () {
        it("Should handle multiple NFTs with different donation amounts", async function () {
            const { nft, vault, donor1 } = await loadFixture(deployNFTFixture);
            const uri = "https://example.com/token/";
            const donations = [
                ethers.parseEther("0.1"),
                ethers.parseEther("1.0"),
                ethers.parseEther("5.0")
            ];
            
            for (let i = 0; i < donations.length; i++) {
                await nft.connect(vault).mintWithDonation(donor1.address, uri + i, donations[i]);
            }
            
            const totalExpected = donations.reduce((sum, donation) => sum + donation, 0n);
            expect(await nft.getVotes(donor1.address)).to.equal(totalExpected);
            expect(await nft.balanceOf(donor1.address)).to.equal(donations.length);
        });

        it("Should maintain correct voting power after burning (if supported)", async function () {
            const { nft, vault, donor1 } = await loadFixture(deployNFTFixture);
            const uri = "https://example.com/token/1";
            const donationAmount = ethers.parseEther("1.0");
            
            await nft.connect(vault).mintWithDonation(donor1.address, uri, donationAmount);
            
            // Note: This test assumes burning functionality exists
            // The current contract doesn't have burning, but this test structure is ready
            expect(await nft.getVotes(donor1.address)).to.equal(donationAmount);
        });
    });
}); 