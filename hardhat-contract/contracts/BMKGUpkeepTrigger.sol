// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

interface IDonationVault {
    function releaseFunds() external;
}

contract BMKGUpkeepTrigger {
    address public functionsCaller;
    IDonationVault public vault;
    bool public earthquakeDetected;

    constructor(address _vault) {
        vault = IDonationVault(_vault);
        functionsCaller = msg.sender; // Chainlink Functions authorized source
    }

    modifier onlyFunctions() {
        require(msg.sender == functionsCaller, "Not authorized");
        _;
    }

    function updateEarthquakeStatus(bool _detected) external onlyFunctions {
        earthquakeDetected = _detected;
    }

    // Chainlink Automation-compatible functions
    function checkUpkeep(bytes calldata) external view returns (bool upkeepNeeded, bytes memory) {
        upkeepNeeded = earthquakeDetected;
    }

    function performUpkeep(bytes calldata) external {
        if (earthquakeDetected) {
            earthquakeDetected = false; // reset
            vault.releaseFunds();
        }
    }
}
