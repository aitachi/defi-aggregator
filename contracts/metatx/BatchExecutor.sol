// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title BatchExecutor
 * @notice 批量交易执行器 - 降低Gas成本
 */
contract BatchExecutor is ReentrancyGuard, Ownable {
    struct Call {
        address target;
        bytes data;
        uint256 value;
    }

    struct BatchCall {
        Call[] calls;
        address refundRecipient;
        uint256 deadline;
    }

    mapping(bytes32 => bool) public executedBatches;

    event BatchExecuted(
        bytes32 indexed batchId,
        uint256 successCount,
        uint256 failureCount
    );
    event CallFailed(uint256 indexed index, bytes reason);

    constructor() Ownable(msg.sender) {}

    /**
     * @notice 执行批量调用
     */
    function executeBatch(BatchCall calldata batch)
    external
    payable
    nonReentrant
    returns (bool[] memory successes, bytes[] memory results)
    {
        require(block.timestamp <= batch.deadline, "Batch expired");

        bytes32 batchId = keccak256(abi.encode(batch, block.number));
        require(!executedBatches[batchId], "Batch already executed");

        executedBatches[batchId] = true;

        uint256 length = batch.calls.length;
        successes = new bool[](length);
        results = new bytes[](length);

        uint256 successCount = 0;
        uint256 failureCount = 0;

        for (uint256 i = 0; i < length; i++) {
            Call memory call = batch.calls[i];

            (bool success, bytes memory result) = call.target.call{
                    value: call.value
                }(call.data);

            successes[i] = success;
            results[i] = result;

            if (success) {
                successCount++;
            } else {
                failureCount++;
                emit CallFailed(i, result);
            }
        }

        // 退还剩余ETH
        if (address(this).balance > 0) {
            payable(batch.refundRecipient).transfer(address(this).balance);
        }

        emit BatchExecuted(batchId, successCount, failureCount);
    }

    /**
     * @notice 执行批量Vault存款
     */
    function batchDeposit(
        address[] calldata vaults,
        uint256[] calldata amounts
    ) external nonReentrant returns (bool[] memory) {
        require(vaults.length == amounts.length, "Length mismatch");

        bool[] memory successes = new bool[](vaults.length);

        for (uint256 i = 0; i < vaults.length; i++) {
            (bool success, ) = vaults[i].call(
                abi.encodeWithSignature("deposit(uint256)", amounts[i])
            );
            successes[i] = success;
        }

        return successes;
    }

    /**
     * @notice 执行批量Vault提款
     */
    function batchWithdraw(
        address[] calldata vaults,
        uint256[] calldata shares
    ) external nonReentrant returns (bool[] memory) {
        require(vaults.length == shares.length, "Length mismatch");

        bool[] memory successes = new bool[](vaults.length);

        for (uint256 i = 0; i < vaults.length; i++) {
            (bool success, ) = vaults[i].call(
                abi.encodeWithSignature("withdraw(uint256)", shares[i])
            );
            successes[i] = success;
        }

        return successes;
    }

    /**
     * @notice 批量收获
     */
    function batchHarvest(address[] calldata vaults)
    external
    nonReentrant
    returns (bool[] memory)
    {
        bool[] memory successes = new bool[](vaults.length);

        for (uint256 i = 0; i < vaults.length; i++) {
            (bool success, ) = vaults[i].call(
                abi.encodeWithSignature("harvest()")
            );
            successes[i] = success;
        }

        return successes;
    }

    receive() external payable {}
}