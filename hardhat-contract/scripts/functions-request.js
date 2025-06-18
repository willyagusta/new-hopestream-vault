const { ethers } = require("hardhat");
const fs = require("fs");

async function main() {
  // Get the contract factory and attach to deployed contract
  const contractAddress = "YOUR_DEPLOYED_CONTRACT_ADDRESS"; // Replace with your actual address
  const BMKGFunctionsClient = await ethers.getContractFactory("BMKGFunctionsClient");
  const contract = BMKGFunctionsClient.attach(contractAddress);

  // Read the request configuration
  let requestConfig;
  try {
    const configPath = "./functions/request-config.js";
    delete require.cache[require.resolve(configPath)];
    requestConfig = require(configPath);
  } catch (error) {
    console.error("Error loading request config:", error.message);
    return;
  }

  console.log("Making Functions request...");

  try {
    // Make the request (adjust parameters based on your contract's function)
    const tx = await contract.makeRequest(
      requestConfig.source,
      requestConfig.args || [],
      requestConfig.secrets || [],
      {
        gasLimit: 500000, // Adjust as needed
      }
    );

    console.log("Transaction sent:", tx.hash);
    console.log("Waiting for confirmation...");

    const receipt = await tx.wait();
    console.log("Transaction confirmed in block:", receipt.blockNumber);

    // Listen for the response (adjust event name based on your contract)
    contract.on("ResponseReceived", (requestId, response) => {
      console.log("Response received for request:", requestId);
      console.log("Response:", response);
    });

  } catch (error) {
    console.error("Error making request:", error);
  }
}

main()
  .then(() => {
    console.log("Script completed");
  })
  .catch((error) => {
    console.error("Script failed:", error);
    process.exit(1);
  });