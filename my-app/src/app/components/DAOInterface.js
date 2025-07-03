"use client";

import { useState, useEffect } from "react";
import { ethers } from "ethers";
import { useAccount, useWalletClient } from "wagmi";
import snapshot from "@snapshot-labs/snapshot.js";

// Update these with your actual deployed contract addresses
const CONTRACTS = {
  DONOR_NFT: "0x2ee4952978E1B0753d03820840367bebe4a8Ff3b",
  DONATION_VAULT: "0x0a9F6B6cF48039A6402460e3189D7D1b780CD90c",
  GOVERNOR: "0xD16Ed14EE05727485409e18E45f518f4BAE5Fcf1"
};

const NFT_ABI = [
  "function getVotes(address account) view returns (uint256)",
  "function delegate(address delegatee)",
  "function delegates(address account) view returns (address)",
  "function balanceOf(address owner) view returns (uint256)",
  "function totalSupply() view returns (uint256)"
];

const VAULT_ABI = [
  "function totalDonated() view returns (uint256)",
  "function totalReleased() view returns (uint256)",
  "function getMilestonesCount() view returns (uint256)",
  "function releaseFunds()",
  "function pause()",
  "function unpause()",
  "function donate() payable",
  // Add governance functions for execution
  "function executeProposal(bytes calldata data)",
  "function setBeneficiary(address newBeneficiary)",
  "function emergencyPause()"
];

// Use a custom Snapshot space name (you'll need to create this)
const SNAPSHOT_SPACE = "hopestream-dao"; // Change to your actual space
const SNAPSHOT_HUB = "https://hub.snapshot.org";

export default function DAOInterface() {
  const { address, isConnected } = useAccount();
  const { data: walletClient } = useWalletClient();

  const [nft, setNFT] = useState(null);
  const [vault, setVault] = useState(null);
  const [votingPower, setVotingPower] = useState("0");
  const [hasNFT, setHasNFT] = useState(false);
  const [isDelegated, setIsDelegated] = useState(false);
  const [vaultStats, setVaultStats] = useState(null);
  const [snapshotProposals, setSnapshotProposals] = useState([]);
  const [status, setStatus] = useState("");
  const [activeTab, setActiveTab] = useState("overview");

  const [proposalTitle, setProposalTitle] = useState("");
  const [proposalDescription, setProposalDescription] = useState("");
  const [proposalType, setProposalType] = useState("general");
  const [newBeneficiary, setNewBeneficiary] = useState("");

  const client = new snapshot.Client712(SNAPSHOT_HUB);

  useEffect(() => {
    if (walletClient && isConnected) {
      const setup = async () => {
        try {
          const browserProvider = new ethers.BrowserProvider(window.ethereum);
          const signer = await browserProvider.getSigner();

          const nftContract = new ethers.Contract(CONTRACTS.DONOR_NFT, NFT_ABI, signer);
          const vaultContract = new ethers.Contract(CONTRACTS.DONATION_VAULT, VAULT_ABI, signer);

          setNFT(nftContract);
          setVault(vaultContract);

          await loadUserData(nftContract, vaultContract);
          await fetchSnapshotProposals();
        } catch (error) {
          console.error("Setup failed:", error);
          setStatus("Failed to connect to contracts");
        }
      };
      setup();
    }
  }, [walletClient, isConnected]);

  const loadUserData = async (nftContract, vaultContract) => {
    if (!address) return;
    try {
      const balance = await nftContract.balanceOf(address);
      const votes = await nftContract.getVotes(address);
      const delegate = await nftContract.delegates(address);

      setHasNFT(balance > 0);
      setVotingPower(votes.toString());
      setIsDelegated(delegate === address);

      // Load vault stats
      const donated = await vaultContract.totalDonated();
      const released = await vaultContract.totalReleased();
      const milestones = await vaultContract.getMilestonesCount();

      setVaultStats({
        donated: ethers.formatEther(donated),
        released: ethers.formatEther(released),
        milestones: milestones.toString(),
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
      await loadUserData(nft, vault);
    } catch (error) {
      console.error(error);
      setStatus("Failed to delegate votes");
    }
  };

  const createSnapshotProposal = async () => {
    try {
      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const chainId = await provider.getNetwork().then(n => n.chainId);
      
      const start = Math.floor(Date.now() / 1000) + 300; // Start in 5 minutes
      const end = start + 7 * 24 * 60 * 60; // 7 days voting period

      // Create proposal body with execution details
      let body = proposalDescription;
      if (proposalType === "beneficiary" && newBeneficiary) {
        body += `\n\n**Execution Details:**\nNew Beneficiary: ${newBeneficiary}`;
      }

      const proposal = {
        space: SNAPSHOT_SPACE,
        type: "single-choice",
        title: proposalTitle,
        body,
        choices: ["For", "Against", "Abstain"],
        start,
        end,
        snapshot: await provider.getBlockNumber(),
        network: chainId.toString(),
        strategies: [
          {
            name: "erc721",
            network: chainId.toString(),
            params: {
              address: CONTRACTS.DONOR_NFT,
              symbol: "HOPE"
            }
          }
        ],
        plugins: JSON.stringify({}),
        metadata: JSON.stringify({
          proposalType,
          executionData: proposalType === "beneficiary" ? { newBeneficiary } : {}
        })
      };

      await client.proposal(signer, address, proposal);
      setStatus("Proposal submitted to Snapshot!");
      setProposalTitle("");
      setProposalDescription("");
      setNewBeneficiary("");
      await fetchSnapshotProposals();
    } catch (e) {
      console.error(e);
      setStatus("Proposal submission failed: " + e.message);
    }
  };

  const fetchSnapshotProposals = async () => {
    try {
      const res = await fetch(`https://hub.snapshot.org/graphql`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: `
            query {
              proposals(
                first: 10,
                where: { space: "${SNAPSHOT_SPACE}" },
                orderBy: "created",
                orderDirection: desc
              ) {
                id
                title
                body
                choices
                start
                end
                state
                scores
                scores_total
                metadata
              }
            }
          `
        })
      });
      const json = await res.json();
      setSnapshotProposals(json.data?.proposals || []);
    } catch (error) {
      console.error("Failed to fetch proposals:", error);
    }
  };

  const voteOnSnapshotProposal = async (proposalId, choiceIndex) => {
    try {
      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      await client.vote(signer, address, {
        space: SNAPSHOT_SPACE,
        proposal: proposalId,
        type: "single-choice",
        choice: choiceIndex,
        metadata: JSON.stringify({})
      });
      setStatus("Vote cast successfully!");
      await fetchSnapshotProposals();
    } catch (e) {
      console.error(e);
      setStatus("Vote submission failed: " + e.message);
    }
  };

  // ON-CHAIN EXECUTION FUNCTIONS
  const executeApprovedProposal = async (proposal) => {
    if (!vault) return;
    
    try {
      const metadata = JSON.parse(proposal.metadata || "{}");
      const proposalType = metadata.proposalType;
      
      setStatus("Executing proposal on-chain...");
      
      if (proposalType === "beneficiary" && metadata.executionData?.newBeneficiary) {
        const tx = await vault.setBeneficiary(metadata.executionData.newBeneficiary);
        await tx.wait();
        setStatus("Beneficiary updated successfully!");
      } else if (proposalType === "pause") {
        const tx = await vault.pause();
        await tx.wait();
        setStatus("Contract paused successfully!");
      } else if (proposalType === "unpause") {
        const tx = await vault.unpause();
        await tx.wait();
        setStatus("Contract unpaused successfully!");
      } else if (proposalType === "release") {
        const tx = await vault.releaseFunds();
        await tx.wait();
        setStatus("Funds released successfully!");
      } else {
        setStatus("Unknown proposal type for execution");
      }
      
      await loadUserData(nft, vault);
    } catch (error) {
      console.error(error);
      setStatus("Execution failed: " + error.message);
    }
  };

  const canExecute = (proposal) => {
    if (proposal.state !== "closed") return false;
    if (!proposal.scores || proposal.scores.length < 2) return false;
    
    // Check if "For" votes won (index 0)
    return proposal.scores[0] > proposal.scores[1];
  };

  return (
    <div className="max-w-6xl mx-auto p-6 bg-white rounded-lg shadow-lg">
      <h2 className="text-3xl font-bold mb-2">🏛️ HopeStream DAO</h2>
      <p className="text-gray-600 mb-4">Decentralized governance for disaster relief</p>
      <p className="text-sm text-blue-600 mb-6">
        💡 Proposals and voting happen off-chain via Snapshot. Execution happens on-chain after approval.
      </p>

      <div className="flex space-x-4 mb-6 border-b">
        {["overview", "propose", "vote", "execute"].map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 font-medium capitalize ${
              activeTab === tab ? "text-blue-600 border-b-2 border-blue-600" : "text-gray-500 hover:text-gray-700"
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {activeTab === "overview" && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-blue-50 p-4 rounded-lg">
            <h3 className="font-semibold text-blue-800">Your Voting Power</h3>
            <p className="text-2xl font-bold text-blue-600">{votingPower}</p>
            <p className="text-sm text-blue-600">{hasNFT ? "✅ NFT Holder" : "❌ No NFT"}</p>
          </div>

          <div className="bg-green-50 p-4 rounded-lg">
            <h3 className="font-semibold text-green-800">Delegation Status</h3>
            <p className="text-lg font-bold text-green-600">{isDelegated ? "✅ Self-Delegated" : "❌ Not Delegated"}</p>
            {!isDelegated && hasNFT && (
              <button onClick={delegateVotes} className="mt-2 px-3 py-1 bg-green-600 text-white rounded text-sm hover:bg-green-700">
                Delegate to Self
              </button>
            )}
          </div>

          <div className="bg-purple-50 p-4 rounded-lg">
            <h3 className="font-semibold text-purple-800">Vault Stats</h3>
            <div className="text-sm text-purple-600">
              <div>Donated: {vaultStats?.donated || "0"} ETH</div>
              <div>Released: {vaultStats?.released || "0"} ETH</div>
              <div>Milestones: {vaultStats?.milestones || "0"}</div>
            </div>
          </div>
        </div>
      )}

      {activeTab === "propose" && (
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Proposal Type</label>
            <select
              value={proposalType}
              onChange={(e) => setProposalType(e.target.value)}
              className="w-full p-2 border border-gray-300 rounded"
            >
              <option value="general">General Proposal</option>
              <option value="beneficiary">Change Beneficiary</option>
              <option value="pause">Pause Contract</option>
              <option value="unpause">Unpause Contract</option>
              <option value="release">Release Funds</option>
            </select>
          </div>

          <input
            type="text"
            placeholder="Proposal Title"
            value={proposalTitle}
            onChange={(e) => setProposalTitle(e.target.value)}
            className="w-full p-2 border border-gray-300 rounded"
          />

          {proposalType === "beneficiary" && (
            <input
              type="text"
              placeholder="New Beneficiary Address (0x...)"
              value={newBeneficiary}
              onChange={(e) => setNewBeneficiary(e.target.value)}
              className="w-full p-2 border border-gray-300 rounded"
            />
          )}

          <textarea
            placeholder="Proposal Description"
            value={proposalDescription}
            onChange={(e) => setProposalDescription(e.target.value)}
            className="w-full p-2 border border-gray-300 rounded h-32"
          />

          <button
            onClick={createSnapshotProposal}
            disabled={!hasNFT || !proposalTitle || !proposalDescription || (proposalType === "beneficiary" && !newBeneficiary)}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-400"
          >
            Submit Proposal to Snapshot
          </button>
        </div>
      )}

      {activeTab === "vote" && (
        <div className="space-y-6">
          {snapshotProposals.length > 0 ? (
            snapshotProposals.map((proposal) => (
              <div key={proposal.id} className="border p-4 rounded-lg">
                <h4 className="font-semibold text-lg">{proposal.title}</h4>
                <p className="text-gray-600 text-sm mb-2">{proposal.body}</p>
                
                {proposal.state === "active" && (
                  <div className="flex space-x-2 mb-2">
                    {proposal.choices.map((choice, index) => (
                      <button
                        key={index}
                        onClick={() => voteOnSnapshotProposal(proposal.id, index + 1)}
                        disabled={!hasNFT}
                        className="px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm disabled:bg-gray-400"
                      >
                        Vote {choice}
                      </button>
                    ))}
                  </div>
                )}
                
                <div className="text-sm text-gray-400">
                  <div>Status: {proposal.state}</div>
                  {proposal.scores && (
                    <div>Results: For: {proposal.scores[0] || 0} | Against: {proposal.scores[1] || 0} | Abstain: {proposal.scores[2] || 0}</div>
                  )}
                </div>
              </div>
            ))
          ) : (
            <div className="text-gray-400">No proposals found. Create one to get started!</div>
          )}
        </div>
      )}

      {activeTab === "execute" && (
        <div className="space-y-6">
          <div className="bg-yellow-50 p-4 rounded-lg border border-yellow-200">
            <h3 className="font-semibold text-yellow-800 mb-2">⚡ Proposal Execution</h3>
            <p className="text-sm text-yellow-700">
              Only approved proposals can be executed on-chain. You need appropriate permissions to execute.
            </p>
          </div>

          {snapshotProposals.filter(p => p.state === "closed" && canExecute(p)).length > 0 ? (
            snapshotProposals
              .filter(p => p.state === "closed" && canExecute(p))
              .map((proposal) => (
                <div key={proposal.id} className="border border-green-200 p-4 rounded-lg bg-green-50">
                  <h4 className="font-semibold text-lg text-green-800">{proposal.title}</h4>
                  <p className="text-green-600 text-sm mb-2">{proposal.body}</p>
                  <div className="text-sm text-green-600 mb-3">
                    ✅ Proposal Approved - Ready for execution
                  </div>
                  <button
                    onClick={() => executeApprovedProposal(proposal)}
                    className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
                  >
                    Execute On-Chain
                  </button>
                </div>
              ))
          ) : (
            <div className="text-gray-400">No approved proposals ready for execution.</div>
          )}
        </div>
      )}

      {status && (
        <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded">
          <p className="text-blue-800">{status}</p>
        </div>
      )}
    </div>
  );
}
