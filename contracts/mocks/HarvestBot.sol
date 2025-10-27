// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

interface IVault {
    function harvest() external returns (uint256);
}

contract HarvestBot {
    address public vault;
    uint256 public lastHarvest;
    uint256 public harvestInterval = 1 days;

    constructor(address _vault) {
        vault = _vault;
    }

    function checkUpkeep(bytes calldata) external view returns (bool, bytes memory) {
        bool needsHarvest = block.timestamp >= lastHarvest + harvestInterval;
        return (needsHarvest, "");
    }

    function performUpkeep(bytes calldata) external {
        require(block.timestamp >= lastHarvest + harvestInterval, "Too soon");
        IVault(vault).harvest();
        lastHarvest = block.timestamp;
    }
}
