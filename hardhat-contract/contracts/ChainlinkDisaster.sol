// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import {Functions, FunctionsClient} from "@chainlink/functions/contracts/dev/0_0_1/FunctionsClient.sol";
import {ConfirmedOwner} from "@chainlink/contracts/src/v0.8/ConfirmedOwner.sol";

interface IDonationVault {
    function releaseFunds() external;
}

contract BMKGTrigger is FunctionsClient, ConfirmedOwner {
    using Functions for Functions.Request;

    IDonationVault public vault;
    bytes32 public latestRequestId;
    string public latestMagnitude;
    bool public triggered;

    constructor(
        address router,
        address _vault
    ) FunctionsClient(router) ConfirmedOwner(msg.sender) {
        vault = IDonationVault(_vault);
    }

    // Send Chainlink Functions Request
    function triggerRequest() public onlyOwner {
        string memory source = 
            "const url = 'https://data.bmkg.go.id/DataMKG/TEWS/gempaterkini.json';"
            "const response = await Functions.makeHttpRequest({ url });"
            "if (!response || !response.data) throw Error('No data');"
            "const mag = response.data.Infogempa.gempa[0].Magnitude;"
            "return Functions.encodeString(mag);";

        Functions.Request memory req;
        req.initializeRequestForInlineJavaScript(bytes(source));
        latestRequestId = sendRequest(req, 200_000);
    }

    // Callback from Chainlink Node
    function fulfillRequest(bytes32 requestId, bytes memory response, bytes memory err) internal override {
        latestMagnitude = string(response);

        if (bytes(err).length == 0) {
            uint256 mag = parseMagnitude(response);
            if (mag > 6 * 10) { // convert 6.5 to 65 for comparison
                vault.releaseFunds();
                triggered = true;
            }
        }
    }

    function parseMagnitude(bytes memory input) internal pure returns (uint256) {
        string memory str = string(input);
        bytes memory b = bytes(str);
        uint256 result = 0;
        bool decimal = false;
        uint256 decimals = 0;

        for (uint256 i = 0; i < b.length; i++) {
            if (b[i] == ".") {
                decimal = true;
                continue;
            }
            if (b[i] >= "0" && b[i] <= "9") {
                result = result * 10 + (uint8(b[i]) - 48);
                if (decimal) decimals++;
            }
        }

        // Normalize to 1 decimal place: 6.5 → 65
        if (decimals == 1) result *= 10;
        return result;
    }
}
