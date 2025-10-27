// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract GasSponsor is Ownable, ReentrancyGuard {
    address public forwarder;

    mapping(bytes32 => bool) public refundClaimed;
    mapping(address => uint256) public refundAmounts;

    event RefundClaimed(address indexed relayer, bytes32 indexed txHash, uint256 amount);
    event FundsDeposited(address indexed sender, uint256 amount);

    constructor(address _forwarder) Ownable(msg.sender) {
        forwarder = _forwarder;
    }

    function claimRefund(bytes32 txHash) external nonReentrant {
        require(!refundClaimed[txHash], "Already claimed");
        require(refundAmounts[msg.sender] > 0, "No refund available");

        refundClaimed[txHash] = true;
        uint256 amount = refundAmounts[msg.sender];
        refundAmounts[msg.sender] = 0;

        payable(msg.sender).transfer(amount);

        emit RefundClaimed(msg.sender, txHash, amount);
    }

    function setRefundAmount(address relayer, uint256 amount) external onlyOwner {
        refundAmounts[relayer] = amount;
    }

    receive() external payable {
        emit FundsDeposited(msg.sender, msg.value);
    }
}