// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract TokenGasPayment is Ownable, ReentrancyGuard {
    address public forwarder;
    address public paymentToken;

    mapping(address => uint256) public tokenBalances;

    event TokenPaid(address indexed user, address indexed relayer, uint256 amount);

    constructor(address _forwarder, address _paymentToken) Ownable(msg.sender) {
        forwarder = _forwarder;
        paymentToken = _paymentToken;
    }

    function payForGas(address user, address relayer, uint256 amount) external nonReentrant {
        IERC20(paymentToken).transferFrom(user, relayer, amount);

        emit TokenPaid(user, relayer, amount);
    }

    function depositTokens(uint256 amount) external {
        IERC20(paymentToken).transferFrom(msg.sender, address(this), amount);
        tokenBalances[msg.sender] += amount;
    }

    function withdrawTokens(uint256 amount) external nonReentrant {
        require(tokenBalances[msg.sender] >= amount, "Insufficient balance");
        tokenBalances[msg.sender] -= amount;
        IERC20(paymentToken).transfer(msg.sender, amount);
    }
}