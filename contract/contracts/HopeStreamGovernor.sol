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
    address public donationVault;
    address public donorNFT;
    
    enum ProposalType {
        CUSTOM,
        PAUSE_CONTRACT,
        UNPAUSE_CONTRACT,
        ADD_MILESTONE,
        CHANGE_RELAYER,
        UPDATE_ANTI_SYBIL,
        EMERGENCY_ACTION
    }
    
    mapping(uint256 => ProposalType) public proposalTypes;
    
    event ProposalCreatedWithType(uint256 proposalId, ProposalType proposalType, address proposer);
    event PauseProposed(uint256 proposalId, bool shouldPause);
    event EmergencyActionProposed(uint256 proposalId, address target, bytes data);

    constructor(
        address _donorNFT,
        address _donationVault,
        TimelockController _timelock
    )
        Governor("HopeStream Governor")
        GovernorSettings(7200, 50400, 1e16) // 24 hours, 1 week, 0.01 ETH
        GovernorVotes(IVotes(_donorNFT))
        GovernorVotesQuorumFraction(4) // 4%
        GovernorTimelockControl(_timelock)
    {
        donorNFT = _donorNFT;
        donationVault = _donationVault;
    }
    
    // Proposal creation functions
    function proposePause(string memory description) public returns (uint256) {
        address[] memory targets = new address[](1);
        uint256[] memory values = new uint256[](1);
        bytes[] memory calldatas = new bytes[](1);
        
        targets[0] = donationVault;
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
        
        targets[0] = donationVault;
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
        
        targets[0] = donationVault;
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
        
        targets[0] = donationVault;
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
        
        // Import the NFT interface to check voting power
        IVotes nft = IVotes(donorNFT);
        uint256 proposerVotingPower = nft.getVotes(msg.sender);
        require(proposerVotingPower >= 1 ether, "Insufficient voting power for anti-Sybil proposal");
        
        address[] memory targets = new address[](1);
        uint256[] memory values = new uint256[](1);
        bytes[] memory calldatas = new bytes[](1);
        
        targets[0] = donationVault;
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
        return IVotes(donorNFT).getVotes(account);
    }

    function getTotalVotingPower() public view returns (uint256) {
        return IVotes(donorNFT).getPastTotalSupply(block.number - 1);
    }

    // Required overrides for OpenZeppelin v5.x compatibility
    function votingDelay() public view override(Governor, GovernorSettings) returns (uint256) {
        return super.votingDelay();
    }

    function votingPeriod() public view override(Governor, GovernorSettings) returns (uint256) {
        return super.votingPeriod();
    }

    function quorum(uint256 blockNumber)
        public
        view
        override(Governor, GovernorVotesQuorumFraction)
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

    function proposalNeedsQueuing(uint256 proposalId)
        public
        view
        override(Governor, GovernorTimelockControl)
        returns (bool)
    {
        return super.proposalNeedsQueuing(proposalId);
    }

    function _queueOperations(
        uint256 proposalId,
        address[] memory targets,
        uint256[] memory values,
        bytes[] memory calldatas,
        bytes32 descriptionHash
    ) internal override(Governor, GovernorTimelockControl) returns (uint48) {
        return super._queueOperations(proposalId, targets, values, calldatas, descriptionHash);
    }

    function _executeOperations(
        uint256 proposalId,
        address[] memory targets,
        uint256[] memory values,
        bytes[] memory calldatas,
        bytes32 descriptionHash
    ) internal override(Governor, GovernorTimelockControl) {
        super._executeOperations(proposalId, targets, values, calldatas, descriptionHash);
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
        override(Governor)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }
} 