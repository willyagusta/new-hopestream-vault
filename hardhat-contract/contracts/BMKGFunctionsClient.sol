// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import {FunctionsClient} from "@chainlink/contracts@1.4.0/src/v0.8/functions/v1_0_0/FunctionsClient.sol";
import {ConfirmedOwner} from "@chainlink/contracts@1.4.0/src/v0.8/shared/access/ConfirmedOwner.sol";
import {FunctionsRequest} from "@chainlink/contracts@1.4.0/src/v0.8/functions/v1_0_0/libraries/FunctionsRequest.sol";

interface IUpkeepTrigger {
    function updateEarthquakeStatus(bool detected) external;
}

contract BMKGEarthquakeFunctionsClient is FunctionsClient, ConfirmedOwner {
    using FunctionsRequest for FunctionsRequest.Request;

    // State variables
    bytes32 public s_lastRequestId;
    bytes public s_lastResponse;
    bytes public s_lastError;
    
    address public keeperTrigger;
    bool public lastEarthquakeStatus;

    // Custom error type
    error UnexpectedRequestID(bytes32 requestId);

    // Event to log responses
    event EarthquakeResponse(
        bytes32 indexed requestId,
        bool earthquakeDetected,
        bytes response,
        bytes err
    );

    // Router address - Hardcoded for Sepolia (change for your network)
    address router = 0xb83E47C2bC239B3bf370bc41e1459A34b41238D0;

    // JavaScript source code for earthquake checking
    string source =
        "const BMKG_API = 'https://data.bmkg.go.id/DataMKG/TEWS/gempadirasakan.json';"
        "try {"
        "const response = await Functions.makeHttpRequest({"
        "url: BMKG_API,"
        "method: 'GET'"
        "});"
        "if (response.error) {"
        "throw new Error('API request failed');"
        "}"
        "const data = response.data;"
        "let earthquakeDetected = false;"
        "if (data.Infogempa && data.Infogempa.gempa) {"
        "const earthquakes = Array.isArray(data.Infogempa.gempa) ? data.Infogempa.gempa : [data.Infogempa.gempa];"
        "for (const quake of earthquakes) {"
        "const magnitude = parseFloat(quake.Magnitude);"
        "if (magnitude >= 6.0) {"
        "earthquakeDetected = true;"
        "break;"
        "}"
        "}"
        "}"
        "return Functions.encodeUint256(earthquakeDetected ? 1 : 0);"
        "} catch (error) {"
        "return Functions.encodeUint256(0);"
        "}";

    // Callback gas limit
    uint32 gasLimit = 300000;

    // donID - Hardcoded for Sepolia (change for your network)
    bytes32 donID = 0x66756e2d657468657265756d2d7365706f6c69612d3100000000000000000000;

    constructor(address _keeperTrigger) FunctionsClient(router) ConfirmedOwner(msg.sender) {
        keeperTrigger = _keeperTrigger;
    }

    /**
     * @notice Sends an HTTP request to check for earthquakes
     * @param subscriptionId The ID for the Chainlink subscription
     * @return requestId The ID of the request
     */
    function sendEarthquakeRequest(
        uint64 subscriptionId
    ) external onlyOwner returns (bytes32 requestId) {
        FunctionsRequest.Request memory req;
        req.initializeRequestForInlineJavaScript(source);

        // Send the request and store the request ID
        s_lastRequestId = _sendRequest(
            req.encodeCBOR(),
            subscriptionId,
            gasLimit,
            donID
        );

        return s_lastRequestId;
    }

    /**
     * @notice Callback function for fulfilling a request
     * @param requestId The ID of the request to fulfill
     * @param response The HTTP response data
     * @param err Any errors from the Functions request
     */
    function fulfillRequest(
        bytes32 requestId,
        bytes memory response,
        bytes memory err
    ) internal override {
        if (s_lastRequestId != requestId) {
            revert UnexpectedRequestID(requestId);
        }

        // Update state variables
        s_lastResponse = response;
        s_lastError = err;

        // Process the response if no errors
        if (err.length == 0 && response.length > 0) {
            uint256 result = abi.decode(response, (uint256));
            bool earthquakeDetected = result == 1;
            lastEarthquakeStatus = earthquakeDetected;
            
            // Update the upkeep trigger
            IUpkeepTrigger(keeperTrigger).updateEarthquakeStatus(earthquakeDetected);
        }

        // Emit event
        emit EarthquakeResponse(requestId, lastEarthquakeStatus, s_lastResponse, s_lastError);
    }

    /**
     * @notice Update the keeper trigger address
     * @param _newTrigger New trigger contract address
     */
    function updateTrigger(address _newTrigger) external onlyOwner {
        keeperTrigger = _newTrigger;
    }

    /**
     * @notice Update the JavaScript source code
     * @param _newSource New JavaScript source code
     */
    function updateSource(string memory _newSource) external onlyOwner {
        source = _newSource;
    }
}