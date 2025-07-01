"use client";

import { useState, useEffect } from "react";
import { ethers } from "ethers";
import { useAccount, useWalletClient } from "wagmi";

// Contract addresses (update these after deployment)
const CONTRACTS = {
  DONOR_NFT: "0x...", // Update after deployment
  DONATION_VAULT: "0x...", // Update after deployment
  TIMELOCK: "0x...", // Update after deployment
  GOVERNOR: "0x...", // Update after deployment
};

const GOVERNOR_ABI = [
  "function proposeBeneficiaryChange(address newBeneficiary, string memory description) returns (uint256)",
  "function proposePause(string memory description) returns (uint256)",
  "function proposeUnpause(string memory description) returns (uint256)",
  "function proposeAddMilestone(uint256 releaseAmount, string memory description) returns (uint256)",
  "function castVote(uint256 proposalId, uint8 support) returns (uint256)",
  "function state(uint256 proposalId) view returns (uint8)",
  "function proposalVotes(uint256 proposalId) view returns (uint256 againstVotes, uint256 forVotes, uint256 abstainVotes)",
  "function getVotingPower(address account) view returns (uint256)",
  "function votingDelay() view returns (uint256)",
  "function votingPeriod() view returns (uint256)",
  "function quorum(uint256 blockNumber) view returns (uint256)",
  "function proposalDeadline(uint256 proposalId) view returns (uint256)",
  "function hasVoted(uint256 proposalId, address account) view returns (bool)",
  "event ProposalCreated(uint256 indexed proposalId, address indexed proposer, address[] targets, uint256[] values, string[] signatures, bytes[] calldatas, uint256 startBlock, uint256 endBlock, string description)"
];

const NFT_ABI = [
  "function getVotes(address account) view returns (uint256)",
  "function delegate(address delegatee)",
  "function delegates(address account) view returns (address)",
  "function balanceOf(address owner) view returns (uint256)"
];

const VAULT_ABI = [
  "function getDAOStats() view returns (address currentBeneficiary, address currentGovernance, address currentRelayer, uint256 currentDonated, uint256 currentReleased, uint256 currentMilestones, bool isPaused)"
];

export default function DAOInterface() {
  const { address, isConnected } = useAccount();
  const { data: walletClient } = useWalletClient();

  // Contract instances
  const [governor, setGovernor] = useState(null);
  const [nft, setNFT] = useState(null);
  const [vault, setVault] = useState(null);

  // State
  const [votingPower, setVotingPower] = useState("0");
  const [hasNFT, setHasNFT] = useState(false);
  const [isDelegated, setIsDelegated] = useState(false);
  const [proposals, setProposals] = useState([]);
  const [vaultStats, setVaultStats] = useState(null);
  const [status, setStatus] = useState("");
  const [activeTab, setActiveTab] = useState("overview");

  // Form states
  const [newBeneficiary, setNewBeneficiary] = useState("");
  const [milestoneAmount, setMilestoneAmount] = useState("");
  const [proposalDescription, setProposalDescription] = useState("");

  // Initialize contracts
  useEffect(() => {
    if (walletClient && isConnected) {
      const setup = async () => {
        try {
          const browserProvider = new ethers.BrowserProvider(window.ethereum);
          const signer = await browserProvider.getSigner();

          const governorContract = new ethers.Contract(CONTRACTS.GOVERNOR, GOVERNOR_ABI, signer);
          const nftContract = new ethers.Contract(CONTRACTS.DONOR_NFT, NFT_ABI, signer);
          const vaultContract = new ethers.Contract(CONTRACTS.DONATION_VAULT, VAULT_ABI, signer);

          setGovernor(governorContract);
          setNFT(nftContract);
          setVault(vaultContract);

          // Load initial data
          await loadUserData(nftContract, governorContract, vaultContract);
        } catch (error) {
          console.error("Contract setup failed:", error);
          setStatus("Failed to connect to contracts");
        }
      };
      setup();
    }
  }, [walletClient, isConnected]);

  const loadUserData = async (nftContract, governorContract, vaultContract) => {
    if (!address) return;

    try {
      // Get user's NFT balance and voting power
      const balance = await nftContract.balanceOf(address);
      const votes = await nftContract.getVotes(address);
      const delegate = await nftContract.delegates(address);
      
      setHasNFT(balance > 0);
      setVotingPower(votes.toString());
      setIsDelegated(delegate === address);

      // Get vault stats
      const stats = await vaultContract.getDAOStats();
      setVaultStats({
        beneficiary: stats[0],
        governance: stats[1],
        relayer: stats[2],
        donated: ethers.formatEther(stats[3]),
        released: ethers.formatEther(stats[4]),
        milestones: stats[5].toString(),
        isPaused: stats[6]
      });

    } catch (error) {
      console.error("Failed to load user data:", error);
    }
  };

  const delegateVotes = async () => {
    if (!nft) return;
    try {
      setStatus("Delegating votes to yourself...");
      const tx = await nft.delegate(address);
      await tx.wait();
      setStatus("Votes delegated successfully!");
      setIsDelegated(true);
      await loadUserData(nft, governor, vault);
    } catch (error) {
      console.error(error);
      setStatus("Failed to delegate votes");
    }
  };

  const createBeneficiaryProposal = async () => {
    if (!governor || !newBeneficiary || !proposalDescription) return;
    try {
      setStatus("Creating beneficiary change proposal...");
      const tx = await governor.proposeBeneficiaryChange(newBeneficiary, proposalDescription);
      await tx.wait();
      setStatus("Proposal created successfully!");
      setNewBeneficiary("");
      setProposalDescription("");
    } catch (error) {
      console.error(error);
      setStatus("Failed to create proposal");
    }
  };

  const createPauseProposal = async () => {
    if (!governor || !proposalDescription) return;
    try {
      setStatus("Creating pause proposal...");
      const tx = await governor.proposePause(proposalDescription);
      await tx.wait();
      setStatus("Pause proposal created!");
      setProposalDescription("");
    } catch (error) {
      console.error(error);
      setStatus("Failed to create pause proposal");
    }
  };

  const createUnpauseProposal = async () => {
    if (!governor || !proposalDescription) return;
    try {
      setStatus("Creating unpause proposal...");
      const tx = await governor.proposeUnpause(proposalDescription);
      await tx.wait();
      setStatus("Unpause proposal created!");
      setProposalDescription("");
    } catch (error) {
      console.error(error);
      setStatus("Failed to create unpause proposal");
    }
  };

  const createMilestoneProposal = async () => {
    if (!governor || !milestoneAmount || !proposalDescription) return;
    try {
      setStatus("Creating milestone proposal...");
      const amount = ethers.parseEther(milestoneAmount);
      const tx = await governor.proposeAddMilestone(amount, proposalDescription);
      await tx.wait();
      setStatus("Milestone proposal created!");
      setMilestoneAmount("");
      setProposalDescription("");
    } catch (error) {
      console.error(error);
      setStatus("Failed to create milestone proposal");
    }
  };

  const voteOnProposal = async (proposalId, support) => {
    if (!governor) return;
    try {
      setStatus(`Casting vote on proposal ${proposalId}...`);
      const tx = await governor.castVote(proposalId, support);
      await tx.wait();
      setStatus("Vote cast successfully!");
    } catch (error) {
      console.error(error);
      setStatus("Failed to cast vote");
    }
  };

  if (!isConnected) {
    return (
      <div className="max-w-4xl mx-auto p-6 bg-white rounded-lg shadow-lg">
        <h2 className="text-2xl font-bold mb-4">🏛️ HopeStream DAO</h2>
        <p className="text-gray-600">Please connect your wallet to participate in governance.</p>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto p-6 bg-white rounded-lg shadow-lg">
      <div className="mb-6">
        <h2 className="text-3xl font-bold mb-2">🏛️ HopeStream DAO</h2>
        <p className="text-gray-600">Decentralized governance for disaster relief funding</p>
      </div>

      {/* Navigation Tabs */}
      <div className="flex space-x-4 mb-6 border-b">
        {["overview", "propose", "vote"].map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 font-medium capitalize ${
              activeTab === tab
                ? "text-blue-600 border-b-2 border-blue-600"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Overview Tab */}
      {activeTab === "overview" && (
        <div className="space-y-6">
          {/* User Stats */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-blue-50 p-4 rounded-lg">
              <h3 className="font-semibold text-blue-800">Your Voting Power</h3>
              <p className="text-2xl font-bold text-blue-600">{votingPower}</p>
              <p className="text-sm text-blue-600">
                {hasNFT ? "✅ NFT Holder" : "❌ No NFT"}
              </p>
            </div>
            
            <div className="bg-green-50 p-4 rounded-lg">
              <h3 className="font-semibold text-green-800">Delegation Status</h3>
              <p className="text-lg font-bold text-green-600">
                {isDelegated ? "✅ Delegated" : "❌ Not Delegated"}
              </p>
              {!isDelegated && hasNFT && (
                <button
                  onClick={delegateVotes}
                  className="mt-2 px-3 py-1 bg-green-600 text-white rounded text-sm hover:bg-green-700"
                >
                  Delegate to Self
                </button>
              )}
            </div>

            <div className="bg-purple-50 p-4 rounded-lg">
              <h3 className="font-semibold text-purple-800">Contract Status</h3>
              <p className="text-lg font-bold text-purple-600">
                {vaultStats?.isPaused ? "⏸️ Paused" : "▶️ Active"}
              </p>
            </div>
          </div>

          {/* Vault Stats */}
          {vaultStats && (
            <div className="bg-gray-50 p-6 rounded-lg">
              <h3 className="text-xl font-semibold mb-4">📊 Vault Statistics</h3>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <div>
                  <p className="text-sm text-gray-600">Current Beneficiary</p>
                  <p className="font-mono text-sm break-all">{vaultStats.beneficiary}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Total Donated</p>
                  <p className="font-bold">{vaultStats.donated} ETH</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Total Released</p>
                  <p className="font-bold">{vaultStats.released} ETH</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Milestones</p>
                  <p className="font-bold">{vaultStats.milestones}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Status</p>
                  <p className="font-bold">{vaultStats.isPaused ? "Paused" : "Active"}</p>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Propose Tab */}
      {activeTab === "propose" && (
        <div className="space-y-6">
          {!hasNFT && (
            <div className="bg-yellow-50 border border-yellow-200 p-4 rounded-lg">
              <p className="text-yellow-800">
                ℹ️ You need to donate first to receive an NFT and gain proposal rights.
              </p>
            </div>
          )}

          {/* Beneficiary Change Proposal */}
          <div className="border border-gray-200 p-4 rounded-lg">
            <h3 className="text-lg font-semibold mb-3">👤 Change Beneficiary</h3>
            <div className="space-y-3">
              <input
                type="text"
                placeholder="New beneficiary address (0x...)"
                value={newBeneficiary}
                onChange={(e) => setNewBeneficiary(e.target.value)}
                className="w-full p-2 border border-gray-300 rounded"
              />
              <textarea
                placeholder="Proposal description and reasoning..."
                value={proposalDescription}
                onChange={(e) => setProposalDescription(e.target.value)}
                className="w-full p-2 border border-gray-300 rounded h-24"
              />
              <button
                onClick={createBeneficiaryProposal}
                disabled={!hasNFT || !newBeneficiary || !proposalDescription}
                className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-400"
              >
                Create Beneficiary Proposal
              </button>
            </div>
          </div>

          {/* Pause/Unpause Proposals */}
          <div className="border border-gray-200 p-4 rounded-lg">
            <h3 className="text-lg font-semibold mb-3">⏸️ Pause/Unpause Contract</h3>
            <div className="space-y-3">
              <textarea
                placeholder="Reason for pausing/unpausing..."
                value={proposalDescription}
                onChange={(e) => setProposalDescription(e.target.value)}
                className="w-full p-2 border border-gray-300 rounded h-24"
              />
              <div className="flex space-x-3">
                <button
                  onClick={createPauseProposal}
                  disabled={!hasNFT || !proposalDescription}
                  className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 disabled:bg-gray-400"
                >
                  Propose Pause
                </button>
                <button
                  onClick={createUnpauseProposal}
                  disabled={!hasNFT || !proposalDescription}
                  className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:bg-gray-400"
                >
                  Propose Unpause
                </button>
              </div>
            </div>
          </div>

          {/* Milestone Proposal */}
          <div className="border border-gray-200 p-4 rounded-lg">
            <h3 className="text-lg font-semibold mb-3">🎯 Add Milestone</h3>
            <div className="space-y-3">
              <input
                type="number"
                placeholder="Release amount in ETH"
                value={milestoneAmount}
                onChange={(e) => setMilestoneAmount(e.target.value)}
                className="w-full p-2 border border-gray-300 rounded"
                step="0.01"
              />
              <textarea
                placeholder="Milestone description..."
                value={proposalDescription}
                onChange={(e) => setProposalDescription(e.target.value)}
                className="w-full p-2 border border-gray-300 rounded h-24"
              />
              <button
                onClick={createMilestoneProposal}
                disabled={!hasNFT || !milestoneAmount || !proposalDescription}
                className="px-4 py-2 bg-purple-600 text-white rounded hover:bg-purple-700 disabled:bg-gray-400"
              >
                Create Milestone Proposal
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Vote Tab */}
      {activeTab === "vote" && (
        <div className="space-y-6">
          <p className="text-gray-600">
            Active proposals will appear here. You can vote For, Against, or Abstain on each proposal.
          </p>
          
          {/* Placeholder for proposal list */}
          <div className="border border-gray-200 p-6 rounded-lg text-center">
            <p className="text-gray-400">No active proposals at the moment.</p>
            <p className="text-sm text-gray-400 mt-2">
              Create a proposal in the "Propose" tab to get started!
            </p>
          </div>
        </div>
      )}

      {/* Status Message */}
      {status && (
        <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded">
          <p className="text-blue-800">{status}</p>
        </div>
      )}
    </div>
  );
} 