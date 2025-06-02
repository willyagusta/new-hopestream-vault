// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "./HopeStreamNFT.sol";

import "hardhat/console.sol";

contract DonationVault is Ownable, Pausable {
    struct Milestone {
        uint256 releaseTime; // Timestamp when funds can be released
        uint256 releaseAmount; // Amount eligible for release
        bool released; // Has this milestone been paid out
    }

    address public beneficiary;
    uint256 public totalDonated;
    uint256 public totalReleased;
    Milestone[] public milestones;
    HopeStreamNFT public donorNFT;

    event DonationReceived(address indexed donor, uint256 amount);
    event MilestoneReleased(uint256 index, uint256 amount, uint256 timestamp);
    event BeneficiaryChanged(address indexed oldBeneficiary, address indexed newBeneficiary);

    constructor(address _beneficiary, address _initialOwner) Ownable(_initialOwner) {
        require(_beneficiary != address(0), "Invalid beneficiary");
        beneficiary = _beneficiary;
    }

    receive() external payable whenNotPaused {
        require(msg.value > 0, "No ETH sent");
        totalDonated += msg.value;

        // Mint NFT to donor
        if (address(donorNFT) != address(0)) {
            string memory uri = "https://gateway.pinata.cloud/ipfs/bafybeigywgtx6zsywe5w26r6jzti55qym3je5xj4acpbyezlvakh6no4fi";
            donorNFT.mint(msg.sender, uri);
        }

        emit DonationReceived(msg.sender, msg.value);
    }

    function setDonorNFT(address _nft) external onlyOwner {
    donorNFT = HopeStreamNFT(_nft);
    }

    function setBeneficiary(address _new) external onlyOwner {
        require(_new != address(0), "Invalid beneficiary");
        emit BeneficiaryChanged(beneficiary, _new);
        beneficiary = _new;
    }

    function addMilestone(uint256 _releaseTime, uint256 _releaseAmount) external onlyOwner {
        require(_releaseTime > block.timestamp, "Release time must be in the future");
        require(_releaseAmount > 0, "Release amount must be greater than zero");
        milestones.push(Milestone(_releaseTime, _releaseAmount, false));
    }

    function getMilestonesCount() external view returns (uint256) {
        return milestones.length;
    }

    // Called by Chainlink Automation (or anyone) to trigger payout
    function releaseFunds() public whenNotPaused {
        uint256 totalToRelease;

        for (uint256 i = 0; i < milestones.length; i++) {
            Milestone storage milestone = milestones[i];
            if (!milestone.released && block.timestamp >= milestone.releaseTime) {
                require(address(this).balance >= milestone.releaseAmount, "Insufficient balance for release");
                milestone.released = true;
                totalToRelease += milestone.releaseAmount;
                emit MilestoneReleased(i, milestone.releaseAmount, block.timestamp);
            }
        }

        if (totalToRelease > 0) {
            totalReleased += totalToRelease;
            (bool success, ) = beneficiary.call{value: totalToRelease}("");
            require(success, "Transfer to beneficiary failed");
        }
    }

    // Emergency stop
    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    // Fallback function
    fallback() external payable {
        totalDonated += msg.value;
        emit DonationReceived(msg.sender, msg.value);
    }
}   