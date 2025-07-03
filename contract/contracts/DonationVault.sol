// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/governance/utils/IVotes.sol";
import "@openzeppelin/contracts/governance/Governor.sol";
import "./HopeStreamNFT.sol";

import "hardhat/console.sol";

contract DonationVault is Ownable, Pausable {
    struct Milestone {
        uint256 releaseTime; // Timestamp when funds can be released
        uint256 releaseAmount; // Amount eligible for release
        bool released; // Has this milestone been paid out
    }

    address public beneficiary;
    address public defenderRelayer;
    address public governanceContract;
    uint256 public totalDonated;
    uint256 public totalReleased;
    Milestone[] public milestones;
    HopeStreamNFT public donorNFT;
    uint256 public magnitudeThreshold = 7;
    
    // Anti-Sybil Protection Parameters
    uint256 public minimumDonationForNFT = 0.01 ether; // Minimum 0.01 ETH to get NFT
    uint256 public maxNFTsPerAddress = 15; // Maximum NFTs per address
    uint256 public donationCooldown = 1 hours; // Cooldown between donations from same address
    
    // Track donation history for Sybil protection
    mapping(address => uint256) public lastDonationTime;
    mapping(address => uint256) public nftCountPerAddress;

    event DonationReceived(address indexed donor, uint256 amount);
    event MilestoneReleased(uint256 index, uint256 amount, uint256 timestamp);
    event BeneficiaryChanged(address indexed oldBeneficiary, address indexed newBeneficiary);
    event DefenderRelayerChanged(address indexed oldRelayer, address indexed newRelayer);
    event GovernanceContractChanged(address indexed oldGovernance, address indexed newGovernance);
    event MilestoneAdded(uint256 releaseAmount, uint256 timestamp);
    
    // Anti-Sybil Events
    event DonationBelowThreshold(address indexed donor, uint256 amount, uint256 threshold);
    event DonationInCooldown(address indexed donor, uint256 timeRemaining);
    event MaxNFTsReached(address indexed donor, uint256 maxAllowed);
    event AntiSybilParametersUpdated(uint256 minimumDonation, uint256 maxNFTs, uint256 cooldown);

    modifier onlyGovernance() {
        require(
            msg.sender == governanceContract,
            "Caller is not governance"
        );
        _;
    }

    modifier onlyGovernanceOrOwner() {
        require(
            msg.sender == governanceContract || msg.sender == owner(),
            "Caller is not governance or owner"
        );
        _;
    }


    constructor(address _beneficiary, address _initialOwner) Ownable(_initialOwner) {
        require(_beneficiary != address(0), "Invalid beneficiary");
        require(_initialOwner != address(0), "Invalid initial owner");
        beneficiary = _beneficiary;
        _transferOwnership(_initialOwner);
    }

    receive() external payable whenNotPaused {
        require(msg.value > 0, "No ETH sent");
        totalDonated += msg.value;

        // Anti-Sybil Protection: Check if donation qualifies for NFT
        bool qualifiesForNFT = _checkDonationQualification(msg.sender, msg.value);
        
        // Mint NFT to donor with donation amount tracking (if qualifies)
        if (address(donorNFT) != address(0) && qualifiesForNFT) {
            string memory uri = "https://gateway.pinata.cloud/ipfs/bafybeigywgtx6zsywe5w26r6jzti55qym3je5xj4acpbyezlvakh6no4fi";
            donorNFT.mintWithDonation(msg.sender, uri, msg.value);
            
            // Update tracking
            nftCountPerAddress[msg.sender]++;
            lastDonationTime[msg.sender] = block.timestamp;
        }

        emit DonationReceived(msg.sender, msg.value);
    }

    function setDonorNFT(address _nft) external onlyOwner() {
        donorNFT = HopeStreamNFT(_nft);
    }

    function setDefenderRelayer(address _relayer) external onlyOwner {
        require(_relayer != address(0), "Invalid relayer address");
        emit DefenderRelayerChanged(defenderRelayer, _relayer);
        defenderRelayer = _relayer;
    }

    function setGovernanceContract(address _governanceContract) external onlyOwner {
        require(_governanceContract != address(0), "Invalid governance address");
        emit GovernanceContractChanged(governanceContract, _governanceContract);
        governanceContract = _governanceContract;
    }

    function setBeneficiary(address _new) external onlyGovernance {
        require(_new != address(0), "Invalid beneficiary");
        emit BeneficiaryChanged(beneficiary, _new);
        beneficiary = _new;
    }

    function addMilestone(uint256 _releaseAmount) external onlyGovernanceOrOwner {
        require(_releaseAmount > 0, "Release amount must be greater than zero");
        milestones.push(Milestone(block.timestamp + 30 days, _releaseAmount, false));
        emit MilestoneAdded(_releaseAmount, block.timestamp);
    }

    function addMilestoneWithTime(uint256 _releaseTime, uint256 _releaseAmount) external onlyGovernance {
        require(_releaseAmount > 0, "Release amount must be greater than zero");
        require(_releaseTime > block.timestamp, "Release time must be in the future");
        milestones.push(Milestone(_releaseTime, _releaseAmount, false));
        emit MilestoneAdded(_releaseAmount, _releaseTime);
    }

    function getMilestonesCount() external view returns (uint256) {
        return milestones.length;
    }

    // Modified to be called by the Defender Relayer
    function releaseFunds() public whenNotPaused {
        require(msg.sender == defenderRelayer || msg.sender == owner() || msg.sender == governanceContract, "Not authorized");
        
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
    function pause() external onlyGovernanceOrOwner {
        _pause();
    }

    function unpause() external onlyGovernanceOrOwner {
        _unpause();
    }

    // Direct donation from the DAO
    function donateFromDAO() external payable onlyGovernanceOrOwner {
        require(msg.value > 0, "No ETH sent");
        totalDonated += msg.value;
        emit DonationReceived(msg.sender, msg.value);
    }

    // Anti-Sybil Protection Functions
    function _checkDonationQualification(address donor, uint256 amount) internal returns (bool) {
        // Check 1: Minimum donation threshold
        if (amount < minimumDonationForNFT) {
            emit DonationBelowThreshold(donor, amount, minimumDonationForNFT);
            return false;
        }
        
        // Check 2: Cooldown period (except for first donation)
        if (lastDonationTime[donor] != 0) {
            uint256 timeSinceLastDonation = block.timestamp - lastDonationTime[donor];
            if (timeSinceLastDonation < donationCooldown) {
                uint256 timeRemaining = donationCooldown - timeSinceLastDonation;
                emit DonationInCooldown(donor, timeRemaining);
                return false;
            }
        }
        
        // Check 3: Maximum NFTs per address
        if (nftCountPerAddress[donor] >= maxNFTsPerAddress) {
            emit MaxNFTsReached(donor, maxNFTsPerAddress);
            return false;
        }
        
        // Check 4: Progressive threshold (higher threshold for additional NFTs)
        uint256 currentNFTCount = nftCountPerAddress[donor];
        uint256 requiredAmount = minimumDonationForNFT * (1 + currentNFTCount / 2); // 1x, 1x, 1.5x, 1.5x, 2x, 2x, 2.5x...
        
        if (amount < requiredAmount) {
            emit DonationBelowThreshold(donor, amount, requiredAmount);
            return false;
        }
        
        return true;
    }
    
    // Governance functions to update anti-Sybil parameters
    function updateAntiSybilParameters(
        uint256 _minimumDonation,
        uint256 _maxNFTs,
        uint256 _cooldown
    ) external onlyGovernanceOrOwner {
        require(_minimumDonation > 0, "Minimum donation must be > 0");
        require(_maxNFTs > 0, "Max NFTs must be > 0");
        require(_cooldown <= 24 hours, "Cooldown too long");
        
        minimumDonationForNFT = _minimumDonation;
        maxNFTsPerAddress = _maxNFTs;
        donationCooldown = _cooldown;
        
        emit AntiSybilParametersUpdated(_minimumDonation, _maxNFTs, _cooldown);
    }
    
    // View functions for anti-Sybil info
    function getDonorInfo(address donor) external view returns (
        uint256 nftCount,
        uint256 totalDonatedByDonor,
        uint256 lastDonation,
        uint256 nextAllowedDonation,
        uint256 nextRequiredAmount
    ) {
        uint256 nftCount_ = nftCountPerAddress[donor];
        uint256 totalDonatedByDonor_ = address(donorNFT) != address(0) ? donorNFT.getTotalDonationAmount(donor) : 0;
        uint256 lastDonation_ = lastDonationTime[donor];
        
        uint256 nextAllowed = lastDonation_ == 0 ? 0 : lastDonation_ + donationCooldown;
        uint256 nextRequired = minimumDonationForNFT * (1 + nftCount_ / 2);
        
        return (nftCount_, totalDonatedByDonor_, lastDonation_, nextAllowed, nextRequired);
    }
    
    function getAntiSybilParameters() external view returns (
        uint256 minDonation,
        uint256 maxNFTs,
        uint256 cooldown
    ) {
        return (minimumDonationForNFT, maxNFTsPerAddress, donationCooldown);
    }

    // DAO Management Functions
    function getDAOStats() external view returns (
        address currentBeneficiary,
        address currentGovernance,
        address currentRelayer,
        uint256 currentDonated,
        uint256 currentReleased,
        uint256 currentMilestones,
        bool isPaused
    ) {
        return (
            beneficiary,
            governanceContract,
            defenderRelayer,
            totalDonated,
            totalReleased,
            milestones.length,
            paused()
        );
    }

    // Fallback function
    fallback() external payable {
        totalDonated += msg.value;
        emit DonationReceived(msg.sender, msg.value);
    }
}   