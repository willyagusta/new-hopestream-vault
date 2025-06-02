"use client";

import { WagmiProvider, createConfig, http } from "wagmi";
import {
  mainnet,
  polygon,
  optimism,
  arbitrum,
  sepolia,
} from "wagmi/chains";
import {
  RainbowKitProvider,
  getDefaultConfig,
} from "@rainbow-me/rainbowkit";
import '@rainbow-me/rainbowkit/styles.css';

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const queryClient = new QueryClient();

// Replace with your WalletConnect project ID
const projectId = "YOUR_WALLETCONNECT_PROJECT_ID";

const config = getDefaultConfig({
  appName: "HopeStream Vault",
  projectId,
  chains: [mainnet, polygon, optimism, arbitrum, sepolia],
  transports: {
    [mainnet.id]: http(),
    [polygon.id]: http(),
    [optimism.id]: http(),
    [arbitrum.id]: http(),
    [sepolia.id]: http(),
  },
});

export function Providers({ children }) {
  return (
    <QueryClientProvider client={queryClient}>
      <WagmiProvider config={config}>
        <RainbowKitProvider>
          {children}
        </RainbowKitProvider>
      </WagmiProvider>
    </QueryClientProvider>
  );
}