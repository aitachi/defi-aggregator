// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract MockStrategy {
    uint256 private _totalAssets;
    address public asset;

    function deposit(uint256 amount) external {
        _totalAssets += amount;
    }

    function withdraw(uint256 amount) external returns (uint256) {
        require(_totalAssets >= amount, "Insufficient assets");
        _totalAssets -= amount;
        return amount;
    }

    function totalAssets() external view returns (uint256) {
        return _totalAssets;
    }

    function setTotalAssets(uint256 amount) external {
        _totalAssets = amount;
    }
}