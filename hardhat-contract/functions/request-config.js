const fs = require("fs");

module.exports = {
  source: fs.readFileSync("./functions/source.js").toString(),

  secrets: {}, // optionally provide secrets object or encrypted secrets

  args: [], // pass arguments to the source.js script (if needed)

  subscriptionId: "YOUR_CHAINLINK_SUBSCRIPTION_ID", // Replace with your Functions sub ID

  gasLimit: 300000, // Estimate gas for fulfillRequest

  donId: "fun-sepolia-1", // Chainlink DON ID for Sepolia

  routerAddress: "0xb08e45ca44de4a1b8b1830196892d4f52b1c03f4", // Sepolia Functions Router
};