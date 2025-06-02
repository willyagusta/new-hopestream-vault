"use client";

import { useEffect, useState } from "react";
import { ethers } from "ethers";
import { useAccount, useWalletClient } from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import ScrollHeader from "./components/Header";

const CONTRACT_ADDRESS = "0x6d66514137F4698D7Ebf1f68C5CB6D5aF337B8b6";
const TARGET_ETH = 0.5;

const CONTRACT_ABI = [
  "function totalDonated() view returns (uint256)",
  "function totalReleased() view returns (uint256)",
  "function getMilestonesCount() view returns (uint256)",
  "function releaseFunds()",
  "function pause()",
  "function unpause()",
  "function donate() payable",
];

export default function Home() {
  const { address, isConnected } = useAccount();
  const { data: walletClient } = useWalletClient();
  const [contract, setContract] = useState(null);
  const [donated, setDonated] = useState("0");
  const [released, setReleased] = useState("0");
  const [milestones, setMilestones] = useState(0);
  const [status, setStatus] = useState("");
  const [donationAmount, setDonationAmount] = useState("");

  useEffect(() => {
    if (walletClient) {
      const setup = async () => {
        const browserProvider = new ethers.BrowserProvider(window.ethereum);
        const signer = await browserProvider.getSigner();
        const contractInstance = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);
        setContract(contractInstance);
      };
      setup();
    }
  }, [walletClient]);

  const fetchVaultStats = async () => {
    if (!contract) return;
    const donated = await contract.totalDonated();
    const released = await contract.totalReleased();
    const count = await contract.getMilestonesCount();
    setDonated(ethers.formatEther(donated));
    setReleased(ethers.formatEther(released));
    setMilestones(count.toString());
  };

  const releaseFunds = async () => {
    if (!contract) return;
    try {
      const tx = await contract.releaseFunds();
      setStatus("Releasing funds...");
      await tx.wait();
      setStatus("Funds released.");
      fetchVaultStats();
    } catch (err) {
      console.error(err);
      setStatus("Failed to release funds.");
    }
  };

  const pauseVault = async () => {
    if (!contract) return;
    try {
      const tx = await contract.pause();
      setStatus("Pausing...");
      await tx.wait();
      setStatus("Vault paused.");
    } catch (err) {
      console.error(err);
      setStatus("Failed to pause.");
    }
  };

  const unpauseVault = async () => {
    if (!contract) return;
    try {
      const tx = await contract.unpause();
      setStatus("Unpausing...");
      await tx.wait();
      setStatus("Vault unpaused.");
    } catch (err) {
      console.error(err);
      setStatus("Failed to unpause.");
    }
  };

  const donate = async () => {
    if (!contract || !donationAmount) return;
    try {
      const tx = await contract.donate({ value: ethers.parseEther(donationAmount) });
      setStatus("Processing donation...");
      await tx.wait();
      setStatus("Donation successful!");
      setDonationAmount("");
      fetchVaultStats();
    } catch (err) {
      console.error(err);
      setStatus("Donation failed.");
    }
  };

   return (
    <>
      <ScrollHeader />
      
      <div className="min-h-screen p-6 bg-gray-100 text-gray-900 pt-24">
        <div className="mx-20 mb-18 mt-10">
          <h1 className="text-4xl font-bold mb-2">HopeStream Vault</h1>
          <h2 className="text-2xl font-bold mb-2 text-blue-600">Disaster Relief for Humanity</h2>
          <p className="text-gray-700 mb-4">
            This HopeStream vault supports communities affected by natural disasters in any countries across the world.
            Every donation helps fund emergency aid, food, water, shelter, and recovery programs.
          </p>

          <img
            src="/disaster.jpg"
            alt="Natural Disaster Image"
            className="w-full h-100 object-cover rounded-lg mb-4"
          />

          {!isConnected && (
            <div className="mt-8">
              <p className="text-gray-700 mb-4">
                Please connect your wallet to view and interact with the vault.
              </p>
              <ConnectButton />
            </div>
          )}

          {isConnected && (
            <>
              <p className="mt-4">
                <strong>Connected Wallet:</strong> {address}
              </p>

              <button
                onClick={fetchVaultStats}
                className="mt-4 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
              >
                Refresh Vault Stats
              </button>

              <div className="mt-4">
                <p>Total Donated: {donated} ETH</p>
                <p>Total Released: {released} ETH</p>
                <p>Milestones: {milestones}</p>
              </div>

              {/* ETH Donation Progress Bar */}
              <div className="mt-6">
                <p className="text-lg font-medium mb-1">Donation Progress</p>
                <div className="w-full bg-gray-300 rounded-full h-4 overflow-hidden mb-2">
                  <div
                    className="bg-green-500 h-full"
                    style={{
                      width: `${Math.min((parseFloat(donated) / TARGET_ETH) * 100, 100)}%`,
                      transition: "width 0.5s ease",
                    }}
                  ></div>
                </div>
                <p className="text-sm text-gray-700">
                  {donated} / {TARGET_ETH} ETH raised
                </p>
              </div>

              {/* Donate Section */}
              <div className="mt-6 flex flex-row justify-center space-x-4">
                <input
                  type="number"
                  placeholder="Enter ETH to donate"
                  value={donationAmount}
                  onChange={(e) => setDonationAmount(e.target.value)}
                  className="border border-gray-300 px-4 py-2 rounded w-60 mb-2 h-12"
                />
                <button
                  onClick={donate}
                  className="w-40 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 h-12"
                >
                  Donate
                </button>
              </div>

              {status && <p className="mt-4 text-sm text-gray-700">{status}</p>}
            </>
          )}
        </div>
      </div>
    </>
  );
}