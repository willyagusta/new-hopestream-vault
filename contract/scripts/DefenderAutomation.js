const { Defender } = require('@openzeppelin/defender-sdk');
const { ethers } = require('ethers');

// ABI for the releaseFund function only
const ABI = [
  {
    "inputs": [],
    "name": "releaseFund",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  }
];

const CONTRACT_ADDRESS = '0xC3687CC836ADF527Ce1a9e76bc3c8Cb4a8103cA1'; // Replace with your actual contract address

// Function to check BMKG API for earthquakes
async function checkBMKGEarthquakes() {
  try {
    // Fetch earthquake data from BMKG API
    const response = await fetch('https://data.bmkg.go.id/DataMKG/TEWS/gempadirasakan.json');
    if (!response.ok) throw new Error(`API error: ${response.status}`);
    
    const data = await response.json();
    
    // Check if there's any earthquake with magnitude >= 2.0
    let earthquakeDetected = false;
    if (data.Infogempa && data.Infogempa.gempa) {
      const earthquakes = Array.isArray(data.Infogempa.gempa) 
        ? data.Infogempa.gempa 
        : [data.Infogempa.gempa];
        
      for (const quake of earthquakes) {
        const magnitude = parseFloat(quake.Magnitude);
        console.log(`Detected earthquake with magnitude: ${magnitude}`);
        if (magnitude >= 2.0) {
          earthquakeDetected = true;
          break;
        }
      }
    }
    
    return earthquakeDetected;
  } catch (error) {
    console.error('Error checking earthquakes:', error);
    return false;
  }
}

exports.handler = async function(credentials) {
  try {
    // Create the Defender client
    const client = new Defender(credentials);
    
    // First check for earthquakes
    const hasEarthquake = await checkBMKGEarthquakes();
    console.log(`Earthquake detected: ${hasEarthquake}`);
    
    // Only proceed if earthquake is detected
    if (hasEarthquake) {
      // Create an interface for encoding the function call
      const iface = new ethers.utils.Interface(ABI);
      const data = iface.encodeFunctionData('releaseFund');
      
      // Send the transaction using the relayer
      const txRes = await client.relaySigner.sendTransaction({
        to: CONTRACT_ADDRESS,
        data: data,
        speed: 'fast',
        gasLimit: 300000, // Set a reasonable fixed gas limit
      });
      
      console.log(`Transaction hash: ${txRes.hash}`);
      return { success: true, txHash: txRes.hash };
    } else {
      console.log('No qualifying earthquake detected, no transaction sent');
      return { success: true, message: 'No earthquake detected' };
    }
  } catch (error) {
    console.error('Error in autotask:', error);
    return { success: false, error: error.message };
  }
};