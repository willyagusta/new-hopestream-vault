// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/governance/Governor.sol";
import "@openzeppelin/contracts/governance/extensions/GovernorSettings.sol";
import "@openzeppelin/contracts/governance/extensions/GovernorCountingSimple.sol";
import "@openzeppelin/contracts/governance/extensions/GovernorVotes.sol";
import "@openzeppelin/contracts/governance/extensions/GovernorVotesQuorumFraction.sol";
import "@openzeppelin/contracts/governance/extensions/GovernorTimelockControl.sol";
import "@openzeppelin/contracts/governance/TimelockController.sol";
import "./HopeStreamNFT.sol";
import "./DonationVault.sol";

contract HopeStreamGovernor is
    Governor,
    GovernorSettings,
    GovernorCountingSimple,
    GovernorVotes,
    GovernorVotesQuorumFraction,
    GovernorTimelockControl
{
    HopeStreamNFT public immutable donorNFT;
    DonationVault public immutable donationVault;
    
    // Proposal types for better organization
    enum ProposalType {
        CHANGE_BENEFICIARY,
        PAUSE_CONTRACT,
        UNPAUSE_CONTRACT,
        ADD_MILESTONE,
        CHANGE_RELAYER,
        UPDATE_ANTI_SYBIL,
        EMERGENCY_ACTION
    }
    
    // Track proposal types
    mapping(uint256 => ProposalType) public proposalTypes;
    
    // Events
    event ProposalCreatedWithType(uint256 indexed proposalId, ProposalType proposalType, address indexed proposer);
    event BeneficiaryChangeProposed(uint256 indexed proposalId, address indexed currentBeneficiary, address indexed newBeneficiary);
    event PauseProposed(uint256 indexed proposalId, bool pauseState);
    event EmergencyActionProposed(uint256 indexed proposalId, address indexed target, bytes data);

    constructor(
        HopeStreamNFT _token,
        TimelockController _timelock,
        DonationVault _vault
    )
        Governor("HopeStreamGovernor")
        GovernorSettings(
            7200, /* 1 day (in blocks, assuming 12 second blocks) */
            50400, /* 1 week */
            0.1 ether /* minimum 0.1 ETH donated to propose */
        )
        GovernorVotes(_token)
        GovernorVotesQuorumFraction(4) /* 4% quorum */
        GovernorTimelockControl(_timelock)
    {
        donorNFT = _token;
        donationVault = _vault;
    }

    // Specialized proposal functions
    function proposeBeneficiaryChange(
        address newBeneficiary,
        string memory description
    ) public returns (uint256) {
        require(newBeneficiary != address(0), "Invalid beneficiary address");
        
        address[] memory targets = new address[](1);
        uint256[] memory values = new uint256[](1);
        bytes[] memory calldatas = new bytes[](1);
        
        targets[0] = address(donationVault);
        values[0] = 0;
        calldatas[0] = abi.encodeWithSignature("setBeneficiary(address)", newBeneficiary);
        
        uint256 proposalId = propose(targets, values, calldatas, description);
        proposalTypes[proposalId] = ProposalType.CHANGE_BENEFICIARY;
        
        emit ProposalCreatedWithType(proposalId, ProposalType.CHANGE_BENEFICIARY, msg.sender);
        emit BeneficiaryChangeProposed(proposalId, donationVault.beneficiary(), newBeneficiary);
        
        return proposalId;
    }

    function proposePause(string memory description) public returns (uint256) {
        address[] memory targets = new address[](1);
        uint256[] memory values = new uint256[](1);
        bytes[] memory calldatas = new bytes[](1);
        
        targets[0] = address(donationVault);
        values[0] = 0;
        calldatas[0] = abi.encodeWithSignature("pause()");
        
        uint256 proposalId = propose(targets, values, calldatas, description);
        proposalTypes[proposalId] = ProposalType.PAUSE_CONTRACT;
        
        emit ProposalCreatedWithType(proposalId, ProposalType.PAUSE_CONTRACT, msg.sender);
        emit PauseProposed(proposalId, true);
        
        return proposalId;
    }

    function proposeUnpause(string memory description) public returns (uint256) {
        address[] memory targets = new address[](1);
        uint256[] memory values = new uint256[](1);
        bytes[] memory calldatas = new bytes[](1);
        
        targets[0] = address(donationVault);
        values[0] = 0;
        calldatas[0] = abi.encodeWithSignature("unpause()");
        
        uint256 proposalId = propose(targets, values, calldatas, description);
        proposalTypes[proposalId] = ProposalType.UNPAUSE_CONTRACT;
        
        emit ProposalCreatedWithType(proposalId, ProposalType.UNPAUSE_CONTRACT, msg.sender);
        emit PauseProposed(proposalId, false);
        
        return proposalId;
    }

    function proposeAddMilestone(
        uint256 releaseAmount,
        string memory description
    ) public returns (uint256) {
        require(releaseAmount > 0, "Release amount must be greater than zero");
        
        address[] memory targets = new address[](1);
        uint256[] memory values = new uint256[](1);
        bytes[] memory calldatas = new bytes[](1);
        
        targets[0] = address(donationVault);
        values[0] = 0;
        calldatas[0] = abi.encodeWithSignature("addMilestone(uint256)", releaseAmount);
        
        uint256 proposalId = propose(targets, values, calldatas, description);
        proposalTypes[proposalId] = ProposalType.ADD_MILESTONE;
        
        emit ProposalCreatedWithType(proposalId, ProposalType.ADD_MILESTONE, msg.sender);
        
        return proposalId;
    }

    function proposeChangeRelayer(
        address newRelayer,
        string memory description
    ) public returns (uint256) {
        require(newRelayer != address(0), "Invalid relayer address");
        
        address[] memory targets = new address[](1);
        uint256[] memory values = new uint256[](1);
        bytes[] memory calldatas = new bytes[](1);
        
        targets[0] = address(donationVault);
        values[0] = 0;
        calldatas[0] = abi.encodeWithSignature("setDefenderRelayer(address)", newRelayer);
        
        uint256 proposalId = propose(targets, values, calldatas, description);
        proposalTypes[proposalId] = ProposalType.CHANGE_RELAYER;
        
        emit ProposalCreatedWithType(proposalId, ProposalType.CHANGE_RELAYER, msg.sender);
        
        return proposalId;
    }

    function proposeUpdateAntiSybil(
        uint256 minimumDonation,
        uint256 maxNFTs,
        uint256 cooldown,
        string memory description
    ) public returns (uint256) {
        require(minimumDonation > 0, "Invalid minimum donation");
        require(maxNFTs > 0 && maxNFTs <= 100, "Invalid max NFTs");
        require(cooldown <= 24 hours, "Cooldown too long");
        
        // Extra protection: require higher voting power for anti-Sybil changes
        uint256 proposerVotingPower = donorNFT.getVotes(msg.sender);
        require(proposerVotingPower >= 1 ether, "Insufficient voting power for anti-Sybil proposal");
        
        address[] memory targets = new address[](1);
        uint256[] memory values = new uint256[](1);
        bytes[] memory calldatas = new bytes[](1);
        
        targets[0] = address(donationVault);
        values[0] = 0;
        calldatas[0] = abi.encodeWithSignature(
            "updateAntiSybilParameters(uint256,uint256,uint256)",
            minimumDonation,
            maxNFTs,
            cooldown
        );
        
        uint256 proposalId = propose(targets, values, calldatas, description);
        proposalTypes[proposalId] = ProposalType.UPDATE_ANTI_SYBIL;
        
        emit ProposalCreatedWithType(proposalId, ProposalType.UPDATE_ANTI_SYBIL, msg.sender);
        
        return proposalId;
    }

    // Emergency proposal for custom actions
    function proposeEmergencyAction(
        address target,
        uint256 value,
        bytes memory data,
        string memory description
    ) public returns (uint256) {
        address[] memory targets = new address[](1);
        uint256[] memory values = new uint256[](1);
        bytes[] memory calldatas = new bytes[](1);
        
        targets[0] = target;
        values[0] = value;
        calldatas[0] = data;
        
        uint256 proposalId = propose(targets, values, calldatas, description);
        proposalTypes[proposalId] = ProposalType.EMERGENCY_ACTION;
        
        emit ProposalCreatedWithType(proposalId, ProposalType.EMERGENCY_ACTION, msg.sender);
        emit EmergencyActionProposed(proposalId, target, data);
        
        return proposalId;
    }

    // View functions
    function getProposalType(uint256 proposalId) public view returns (ProposalType) {
        return proposalTypes[proposalId];
    }

    function getVotingPower(address account) public view returns (uint256) {
        return donorNFT.getVotes(account);
    }

    function getTotalVotingPower() public view returns (uint256) {
        return donorNFT.getPastTotalSupply(block.number - 1);
    }

    // Required overrides
    function votingDelay() public view override(IGovernor, GovernorSettings) returns (uint256) {
        return super.votingDelay();
    }

    function votingPeriod() public view override(IGovernor, GovernorSettings) returns (uint256) {
        return super.votingPeriod();
    }

    function quorum(uint256 blockNumber)
        public
        view
        override(IGovernor, GovernorVotesQuorumFraction)
        returns (uint256)
    {
        return super.quorum(blockNumber);
    }

    function proposalThreshold()
        public
        view
        override(Governor, GovernorSettings)
        returns (uint256)
    {
        return super.proposalThreshold();
    }

    function state(uint256 proposalId)
        public
        view
        override(Governor, GovernorTimelockControl)
        returns (ProposalState)
    {
        return super.state(proposalId);
    }

    function _execute(
        uint256 proposalId,
        address[] memory targets,
        uint256[] memory values,
        bytes[] memory calldatas,
        bytes32 descriptionHash
    ) internal override(Governor, GovernorTimelockControl) {
        super._execute(proposalId, targets, values, calldatas, descriptionHash);
    }

    function _cancel(
        address[] memory targets,
        uint256[] memory values,
        bytes[] memory calldatas,
        bytes32 descriptionHash
    ) internal override(Governor, GovernorTimelockControl) returns (uint256) {
        return super._cancel(targets, values, calldatas, descriptionHash);
    }

    function _executor()
        internal
        view
        override(Governor, GovernorTimelockControl)
        returns (address)
    {
        return super._executor();
    }

    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(Governor, GovernorTimelockControl)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }
} 