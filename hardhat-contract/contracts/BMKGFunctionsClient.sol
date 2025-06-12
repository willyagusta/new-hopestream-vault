// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import { FunctionsClient } from "@chainlink/functions/contracts/dev/v1_0_0/FunctionsClient.sol";
import { FunctionsRequest } from "@chainlink/functions/contracts/dev/v1_0_0/libraries/FunctionsRequest.sol";

interface IUpkeepTrigger {
    function updateEarthquakeStatus(bool _detected) external;
}

contract BMKGFunctionsClient is FunctionsClient {
    address public keeperTrigger;
    address public owner;

    constructor(address router, address _trigger) FunctionsClient(router) {
        keeperTrigger = _trigger;
        owner = msg.sender;
    }

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    // This is called by the Chainlink node
    function fulfillRequest(bytes32 requestId, bytes memory response, bytes memory err) internal override {
        require(err.length == 0, "Chainlink request error");

        bool detected = abi.decode(response, (bool));

        IUpkeepTrigger(keeperTrigger).updateEarthquakeStatus(detected);
    }

    // Optional: to allow changing the upkeep trigger address
    function updateTrigger(address _newTrigger) external onlyOwner {
        keeperTrigger = _newTrigger;
    }
}
