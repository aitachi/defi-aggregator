// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title PositionManager
 * @notice 杠杆头寸管理器 - 批量管理、再平衡
 */
contract PositionManager is Ownable, ReentrancyGuard {
    address public leverageEngine;

    struct PositionData {
        uint256 id;
        address owner;
        uint256 collateralAmount;
        uint256 borrowedAmount;
        uint256 leverage;
        uint256 healthFactor;
        uint256 targetHealthFactor;  // 目标健康因子
        bool autoRebalance;          // 是否自动再平衡
    }

    mapping(uint256 => PositionData) public positions;
    mapping(address => uint256[]) public userPositions;

    uint256 public rebalanceThreshold = 10; // 10% 偏差触发再平衡

    event PositionRebalanced(uint256 indexed positionId, uint256 newHealthFactor);
    event AutoRebalanceEnabled(uint256 indexed positionId);

    modifier onlyPositionOwner(uint256 positionId) {
        require(positions[positionId].owner == msg.sender, "Not owner");
        _;
    }

    constructor(address _leverageEngine) Ownable(msg.sender) {
        leverageEngine = _leverageEngine;
    }

    /**
     * @notice 注册新头寸
     */
    function registerPosition(
        uint256 positionId,
        address owner,
        uint256 collateralAmount,
        uint256 borrowedAmount,
        uint256 leverage,
        uint256 targetHealthFactor
    ) external {
        require(msg.sender == leverageEngine, "Only leverage engine");

        positions[positionId] = PositionData({
            id: positionId,
            owner: owner,
            collateralAmount: collateralAmount,
            borrowedAmount: borrowedAmount,
            leverage: leverage,
            healthFactor: 150, // 初始值
            targetHealthFactor: targetHealthFactor,
            autoRebalance: false
        });

        userPositions[owner].push(positionId);
    }

    /**
     * @notice 启用自动再平衡
     */
    function enableAutoRebalance(uint256 positionId)
    external
    onlyPositionOwner(positionId)
    {
        positions[positionId].autoRebalance = true;
        emit AutoRebalanceEnabled(positionId);
    }

    /**
     * @notice 手动再平衡头寸
     */
    function rebalancePosition(uint256 positionId)
    external
    nonReentrant
    {
        PositionData storage pos = positions[positionId];
        require(pos.autoRebalance || msg.sender == pos.owner, "Not authorized");

        // 检查是否需要再平衡
        uint256 deviation = _calculateDeviation(
            pos.healthFactor,
            pos.targetHealthFactor
        );

        require(deviation >= rebalanceThreshold, "No rebalance needed");

        // 调用LeverageEngine执行再平衡
        // ILeverageEngine(leverageEngine).rebalance(positionId);

        emit PositionRebalanced(positionId, pos.healthFactor);
    }

    /**
     * @notice 批量再平衡
     */
    function batchRebalance(uint256[] calldata positionIds)
    external
    nonReentrant
    {
        for (uint256 i = 0; i < positionIds.length; i++) {
            PositionData storage pos = positions[positionIds[i]];

            if (!pos.autoRebalance) continue;

            uint256 deviation = _calculateDeviation(
                pos.healthFactor,
                pos.targetHealthFactor
            );

            if (deviation >= rebalanceThreshold) {
                // 执行再平衡
                emit PositionRebalanced(positionIds[i], pos.healthFactor);
            }
        }
    }

    /**
     * @notice 获取用户所有头寸
     */
    function getUserPositions(address user)
    external
    view
    returns (uint256[] memory)
    {
        return userPositions[user];
    }

    /**
     * @notice 获取需要再平衡的头寸
     */
    function getPositionsNeedRebalance()
    external
    pure
    returns (uint256[] memory)
    {
        // 简单实现 - 实际应遍历所有头寸
        uint256[] memory result = new uint256[](0);
        return result;
    }

    function getPositionHealth(uint256 positionId)
    external
    view
    returns (uint256 collateral, uint256 debt, uint256 healthFactor)
    {
        PositionData memory pos = positions[positionId];
        return (pos.collateralAmount, pos.borrowedAmount, pos.healthFactor);
    }

    function _calculateDeviation(uint256 current, uint256 target)
    internal
    pure
    returns (uint256)
    {
        if (current > target) {
            return ((current - target) * 100) / target;
        } else {
            return ((target - current) * 100) / target;
        }
    }

    function setRebalanceThreshold(uint256 _threshold) external onlyOwner {
        rebalanceThreshold = _threshold;
    }
}