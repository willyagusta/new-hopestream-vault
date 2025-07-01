const { Defender } = require('@openzeppelin/defender-sdk');
const { ethers } = require('ethers');

// ABI for the releaseFunds function only - to keep it minimal
const ABI = [
  {
    "inputs": [],
    "name": "releaseFunds",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  }
];

const CONTRACT_ADDRESS = '0x6d66514137F4698D7Ebf1f68C5CB6D5aF337B8b6';

exports.handler = async function(credentials) {
  // Create the Defender client
  const client = new Defender(credentials);
  
  // Create an interface for encoding the function call
  const iface = new ethers.utils.Interface(ABI);
  const data = iface.encodeFunctionData('releaseFunds');
  
  // Send the transaction using the simple pattern from the default code
  const txRes = await client.relaySigner.sendTransaction({
    to: CONTRACT_ADDRESS,
    data: data,
    speed: 'fast',
    gasLimit: 200000, // Set a reasonable fixed gas limit
  });
  
  console.log(`Transaction hash: ${txRes.hash}`);
  return txRes.hash;
};