// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

/**
 * @title IStrategy
 * @notice Interface for yield farming strategies
 */
interface IStrategy {
    function deposit(uint256 amount) external;
    function withdraw(uint256 amount) external returns (uint256);
    function harvest() external returns (uint256 profit);
    function totalAssets() external view returns (uint256);
    function estimatedAPY() external view returns (uint256);
}

/**
 * @title IVault
 * @notice Interface for the main vault contract
 */
interface IVault {
    // ============ Deposit & Withdraw Functions ============

    /**
     * @notice Deposit tokens into the vault
     * @param token Token address
     * @param amount Amount to deposit
     */
    function deposit(address token, uint256 amount) external returns (uint256 shares);

    /**
     * @notice Withdraw tokens from the vault
     * @param token Token address
     * @param amount Amount to withdraw
     */
    function withdraw(address token, uint256 amount) external returns (uint256);

    /**
     * @notice Withdraw tokens to a specific address
     * @param token Token address
     * @param amount Amount to withdraw
     * @param to Recipient address
     */
    function withdrawTo(address token, uint256 amount, address to) external;

    // ============ View Functions ============

    /**
     * @notice Get the balance of a token in the vault
     * @param token Token address
     * @return Balance amount
     */
    function getBalance(address token) external view returns (uint256);

    /**
     * @notice Get user's share balance
     * @param token Token address
     * @param user User address
     * @return User's share balance
     */
    function getUserShares(address token, address user) external view returns (uint256);

    /**
     * @notice Get total shares for a token
     * @param token Token address
     * @return Total shares
     */
    function getTotalShares(address token) external view returns (uint256);

    // ============ Events ============

    event Deposit(address indexed token, address indexed user, uint256 amount, uint256 shares);
    event Withdraw(address indexed token, address indexed user, uint256 amount, uint256 shares);
    event YieldDistributed(address indexed token, uint256 amount);
}