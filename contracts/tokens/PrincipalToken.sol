// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract PrincipalToken is ERC20, Ownable {
    IERC20 public underlyingAsset;
    uint256 public maturityDate;
    uint256 public exchangeRate; // 1e18 = 1:1

    event Mint(address indexed user, uint256 principalAmount, uint256 underlyingAmount);
    event Redeem(address indexed user, uint256 principalAmount, uint256 underlyingAmount);

    constructor(
        string memory name,
        string memory symbol,
        address _underlyingAsset,
        uint256 _maturityDate
    ) ERC20(name, symbol) Ownable(msg.sender) {
        require(_underlyingAsset != address(0), "Invalid underlying asset");
        require(_maturityDate > block.timestamp, "Maturity date must be in the future");

        underlyingAsset = IERC20(_underlyingAsset);
        maturityDate = _maturityDate;
        exchangeRate = 1e18; // 初始 1:1 兑换率
    }

    /**
     * @dev 铸造 Principal Token
     * @param underlyingAmount 存入的底层资产数量
     */
    function mint(uint256 underlyingAmount) external returns (uint256) {
        require(underlyingAmount > 0, "Amount must be greater than 0");
        require(block.timestamp < maturityDate, "Token has matured");

        // 转入底层资产
        require(
            underlyingAsset.transferFrom(msg.sender, address(this), underlyingAmount),
            "Transfer failed"
        );

        // 计算铸造的 PT 数量
        uint256 principalAmount = (underlyingAmount * 1e18) / exchangeRate;

        // 铸造 PT
        _mint(msg.sender, principalAmount);

        emit Mint(msg.sender, principalAmount, underlyingAmount);
        return principalAmount;
    }

    /**
     * @dev 赎回 Principal Token（核心函数，必须在调用它的函数之前定义）
     * @param principalAmount 赎回的 PT 数量
     */
    function redeem(uint256 principalAmount) public returns (uint256) {
        require(principalAmount > 0, "Amount must be greater than 0");
        require(balanceOf(msg.sender) >= principalAmount, "Insufficient balance");
        require(block.timestamp >= maturityDate, "Token has not matured yet");

        // 计算返还的底层资产数量
        uint256 underlyingAmount = (principalAmount * exchangeRate) / 1e18;

        // 销毁 PT
        _burn(msg.sender, principalAmount);

        // 返还底层资产
        require(
            underlyingAsset.transfer(msg.sender, underlyingAmount),
            "Transfer failed"
        );

        emit Redeem(msg.sender, principalAmount, underlyingAmount);
        return underlyingAmount;
    }

    /**
     * @dev 赎回所有 Principal Token（调用 redeem 函数）
     */
    function redeemAll() external returns (uint256) {
        uint256 balance = balanceOf(msg.sender);
        require(balance > 0, "No balance to redeem");
        return redeem(balance); // ✅ 现在可以调用了
    }

    /**
     * @dev 更新兑换率（仅所有者）
     * @param newRate 新的兑换率（1e18 为基准）
     */
    function updateExchangeRate(uint256 newRate) external onlyOwner {
        require(newRate > 0, "Invalid exchange rate");
        exchangeRate = newRate;
    }

    /**
     * @dev 检查是否已到期
     */
    function isMatured() public view returns (bool) {
        return block.timestamp >= maturityDate;
    }

    /**
     * @dev 获取用户可赎回的底层资产数量
     * @param account 用户地址
     */
    function redeemableAmount(address account) public view returns (uint256) {
        uint256 balance = balanceOf(account);
        return (balance * exchangeRate) / 1e18;
    }
}