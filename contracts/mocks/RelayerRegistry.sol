// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import "@openzeppelin/contracts/access/Ownable.sol";

contract RelayerRegistry is Ownable {
    struct RelayerInfo {
        bool active;
        string name;
        uint256 registeredAt;
    }

    mapping(address => RelayerInfo) public relayers;
    address[] public relayerList;

    event RelayerRegistered(address indexed relayer, string name);
    event RelayerDeactivated(address indexed relayer);

    constructor() Ownable(msg.sender) {}

    function registerRelayer(address relayer, string memory name) external onlyOwner {
        require(!relayers[relayer].active, "Already registered");

        relayers[relayer] = RelayerInfo({
            active: true,
            name: name,
            registeredAt: block.timestamp
        });

        relayerList.push(relayer);
        emit RelayerRegistered(relayer, name);
    }

    function deactivateRelayer(address relayer) external onlyOwner {
        require(relayers[relayer].active, "Not active");
        relayers[relayer].active = false;
        emit RelayerDeactivated(relayer);
    }

    function isActiveRelayer(address relayer) external view returns (bool) {
        return relayers[relayer].active;
    }

    function getRelayerCount() external view returns (uint256) {
        return relayerList.length;
    }
}