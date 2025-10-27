// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

interface IStrategy {
    function deposit(uint256 amount) external;
    function withdraw(uint256 amount) external returns (uint256);
    function harvest() external returns (uint256 profit);
    function totalAssets() external view returns (uint256);
    function estimatedAPY() external view returns (uint256);
}
