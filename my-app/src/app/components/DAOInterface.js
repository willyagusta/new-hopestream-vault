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

const SNAPSHOT_SPACE = "s-tn-hopestream.eth";
const SNAPSHOT_HUB = "https://testnet.snapshot.box";
const SNAPSHOT_GRAPHQL = "https://testnet.snapshot.box/graphql";

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
      setStatus("Loading proposals...");
      
      // First, test if testnet is reachable at all
      console.log("🔍 Testing testnet connectivity...");
      try {
        const testResponse = await fetch("https://testnet.snapshot.box/graphql", {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            query: "{ __typename }"
          })
        });
        console.log(`🔍 Testnet connectivity test: ${testResponse.status}`);
        if (testResponse.ok) {
          const testJson = await testResponse.json();
          console.log("✅ Testnet is reachable:", testJson);
        } else {
          console.log("❌ Testnet connectivity failed:", await testResponse.text());
        }
      } catch (err) {
        console.log("❌ Testnet connectivity error:", err.message);
      }
      
      // First, try to check if the space exists on testnet
      const spaceCheckQuery = `
        query {
          space(id: "${SNAPSHOT_SPACE}") {
            id
            name
            about
            network
            symbol
            members
          }
        }
      `;

      // Updated proposals query with correct Snapshot API format
      const proposalsQuery = `
        query {
          proposals(
            first: 20,
            where: { space_in: ["s-tn-hopestream.eth"] },
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
            author
            created
          }
        }
      `;

      // Alternative query format without variables
      const proposalsQueryDirect = `
        query {
          proposals(
            first: 20,
            skip: 0,
            where: { space_in: ["s-tn-hopestream.eth"] },
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
            author
            created
          }
        }
      `;

      // Use correct testnet endpoints - testnet.snapshot.box uses different API
      const queries = [
        // Check space existence on main hub (since that's working)
        {
          endpoint: "https://hub.snapshot.org/graphql",
          query: spaceCheckQuery,
          isSpaceCheck: true
        },
        // Try testnet proposals FIRST since user confirmed proposals exist there
        {
          endpoint: "https://testnet.snapshot.box/graphql",
          query: proposalsQueryDirect
        },
        // Try testnet with simpler query
        {
          endpoint: "https://testnet.snapshot.box/graphql",
          query: proposalsQuery
        },
        // Try main hub proposals as backup
        {
          endpoint: "https://hub.snapshot.org/graphql",
          query: proposalsQuery
        },
        // Try main hub with direct query
        {
          endpoint: "https://hub.snapshot.org/graphql",
          query: proposalsQueryDirect
        },
        // Check if space exists on testnet too
        {
          endpoint: "https://testnet.snapshot.box/graphql",
          query: spaceCheckQuery,
          isSpaceCheck: true
        }
      ];

      let proposals = [];
      let spaceExists = false;
      let lastError = null;
      let workingEndpoint = null;

      for (const { endpoint, query, isSpaceCheck } of queries) {
        try {
          console.log(`\n=== Trying endpoint: ${endpoint} ===`);
          console.log(`Is space check: ${isSpaceCheck}`);
          console.log(`Query:`, query);
          
          const requestBody = {
            query: query
          };

          // Add timeout to avoid hanging
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout

          const res = await fetch(endpoint, {
            method: 'POST',
            headers: { 
              'Content-Type': 'application/json',
              'Accept': 'application/json',
            },
            body: JSON.stringify(requestBody),
            signal: controller.signal
          });
          
          clearTimeout(timeoutId);
          
          console.log(`Response status: ${res.status}`);
          
          if (res.ok) {
            const json = await res.json();
            console.log('Full GraphQL response:', JSON.stringify(json, null, 2));
            
            if (isSpaceCheck) {
              if (json.data?.space) {
                spaceExists = true;
                workingEndpoint = endpoint;
                console.log('✅ Space exists:', json.data.space);
                setStatus(`✅ Space found: ${json.data.space.name || 'HopeStream DAO'} (via ${endpoint})`);
                continue; // Continue to fetch proposals
              } else if (json.errors) {
                console.log('❌ GraphQL errors for space check:', json.errors);
                continue; // Try next endpoint
              } else {
                console.log('❌ Space does not exist on this endpoint');
                continue; // Try next endpoint
              }
            } else if (json.data && json.data.proposals) {
              proposals = json.data.proposals;
              console.log(`✅ Found ${proposals.length} proposals:`, proposals);
              spaceExists = true; // If we got proposals, space exists
              workingEndpoint = endpoint;
              break;
            } else if (json.errors) {
              console.error('❌ GraphQL errors:', json.errors);
              lastError = json.errors[0]?.message || 'GraphQL error';
              continue; // Try next endpoint
            } else {
              console.log('❌ No proposals in response, but no errors either');
              console.log('Response data:', json.data);
              continue; // Try next endpoint
            }
          } else {
            const errorText = await res.text();
            console.error(`❌ HTTP Error: ${res.status}`, errorText);
            lastError = `HTTP ${res.status} from ${endpoint}: ${errorText}`;
            continue; // Try next endpoint
          }
        } catch (err) {
          console.error(`❌ Failed to fetch from ${endpoint}:`, err);
          lastError = err.message;
          continue;
        }
      }

      setSnapshotProposals(proposals);
      
      if (proposals.length > 0) {
        setStatus(`✅ Loaded ${proposals.length} proposals from ${workingEndpoint}`);
      } else if (spaceExists) {
        setStatus(`✅ Space exists (via ${workingEndpoint}) but no proposals found yet. Create your first proposal!`);
      } else {
        setStatus(`❌ Could not connect to Snapshot space. Last error: ${lastError}`);
        console.log('❌ All endpoints failed. Space ID:', SNAPSHOT_SPACE);
        console.log('❌ Tried endpoints:', queries.map(q => q.endpoint));
      }
      
    } catch (error) {
      console.error("❌ Failed to fetch proposals:", error);
      setSnapshotProposals([]);
      setStatus("Error loading proposals: " + error.message);
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
      // Since metadata is not available, determine proposal type from title/body
      const title = proposal.title.toLowerCase();
      const body = proposal.body.toLowerCase();
      
      let proposalType = 'general';
      let executionData = {};
      
      // Try to determine proposal type from title and body
      if (title.includes('beneficiary') || body.includes('beneficiary')) {
        proposalType = 'beneficiary';
        // Try to extract beneficiary address from body
        const addressMatch = proposal.body.match(/0x[a-fA-F0-9]{40}/);
        if (addressMatch) {
          executionData.newBeneficiary = addressMatch[0];
        }
      } else if (title.includes('pause') || body.includes('pause contract')) {
        proposalType = 'pause';
      } else if (title.includes('unpause') || body.includes('unpause contract')) {
        proposalType = 'unpause';
      } else if (title.includes('release') || body.includes('release fund')) {
        proposalType = 'release';
      }
      
      setStatus("Executing proposal on-chain...");
      
      if (proposalType === 'beneficiary' && executionData.newBeneficiary) {
        const tx = await vault.setBeneficiary(executionData.newBeneficiary);
        await tx.wait();
        setStatus("Beneficiary updated successfully!");
      } else if (proposalType === 'pause') {
        const tx = await vault.pause();
        await tx.wait();
        setStatus("Contract paused successfully!");
      } else if (proposalType === 'unpause') {
        const tx = await vault.unpause();
        await tx.wait();
        setStatus("Contract unpaused successfully!");
      } else if (proposalType === 'release') {
        const tx = await vault.releaseFunds();
        await tx.wait();
        setStatus("Funds released successfully!");
      } else {
        setStatus("⚠️ Could not determine proposal type for automatic execution. Please execute manually.");
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
        {["overview", "vote", "execute"].map((tab) => (
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
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-blue-50 p-4 rounded-lg">
              <h3 className="font-semibold text-blue-800">Your Voting Power</h3>
              <p className="text-2xl font-bold text-blue-600">{ethers.formatEther(votingPower)}</p>
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
        </div>
      )}

      {activeTab === "vote" && (
        <div className="space-y-6">
          {/* Create Proposal - Simplified */}
          <div className="bg-gradient-to-r from-blue-50 to-indigo-50 p-4 rounded-lg border border-blue-200">
            <h3 className="font-semibold text-blue-800 mb-2">📝 Create Proposals</h3>
            <p className="text-blue-700 text-sm mb-3">
              Create new governance proposals directly on Snapshot:
            </p>
            <div className="flex space-x-3">
              <a
                href="https://testnet.snapshot.box/#/s-tn-hopestream.eth"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm"
              >
                🚀 Create Proposal
              </a>
              
            </div>
          </div>
          
          
        </div>
      )}

      {activeTab === "execute" && (
        <div className="space-y-6">
          <div className="bg-yellow-50 p-4 rounded-lg border border-yellow-200">
            <h3 className="font-semibold text-yellow-800 mb-2">⚡ On-Chain Execution</h3>
            <p className="text-sm text-yellow-700">
              Only approved proposals can be executed on-chain. You need appropriate permissions.
            </p>
          </div>

          {snapshotProposals.filter(p => p.state === "closed" && canExecute(p)).length > 0 ? (
            <div className="space-y-4">
              {snapshotProposals
                .filter(p => p.state === "closed" && canExecute(p))
                .map((proposal) => (
                  <div key={proposal.id} className="border border-green-200 p-4 rounded-lg bg-green-50">
                    <h4 className="font-semibold text-lg text-green-800 mb-2">{proposal.title}</h4>
                    <p className="text-green-600 text-sm mb-3">{proposal.body}</p>
                    
                    <div className="mb-3 p-3 bg-white rounded border">
                      <h5 className="font-medium text-gray-700 mb-2">📊 Final Results:</h5>
                      <div className="space-y-1">
                        {proposal.choices.map((choice, index) => (
                          <div key={index} className="flex justify-between items-center">
                            <span className="text-sm font-medium">{choice}:</span>
                            <span className="text-sm text-gray-600">{proposal.scores[index] || 0} votes</span>
                          </div>
                        ))}
                      </div>
                    </div>
                    
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-medium text-green-800">✅ Proposal Approved</span>
                      <button
                        onClick={() => executeApprovedProposal(proposal)}
                        className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
                      >
                        Execute On-Chain
                      </button>
                    </div>
                  </div>
                ))}
            </div>
          ) : (
            <div className="text-center py-8 text-gray-500">
              <div className="text-lg mb-2">⏳ No approved proposals ready for execution</div>
              <p className="text-sm">Approved proposals will appear here for on-chain execution.</p>
            </div>
          )}
        </div>
      )}

    </div>
  );
}
