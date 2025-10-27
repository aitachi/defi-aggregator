// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import "@openzeppelin/contracts/access/Ownable.sol";

contract RebalanceBot is Ownable {

    address public leverageHelper;

    uint256 public rebalanceThreshold = 10;
    mapping(address => bool) public whitelistedBots;

    event PositionRebalanced(
        address indexed user,
        uint256 indexed positionId,
        uint256 oldLeverage,
        uint256 newLeverage
    );
    event BotWhitelisted(address indexed bot, bool status);
    event ThresholdUpdated(uint256 newThreshold);

    modifier onlyWhitelistedBot() {
        require(whitelistedBots[msg.sender] || msg.sender == owner(), "Not whitelisted bot");
        _;
    }

    constructor(address _leverageHelper) Ownable(msg.sender) {
        require(_leverageHelper != address(0), "Invalid leverage helper");

        leverageHelper = _leverageHelper;
        whitelistedBots[msg.sender] = true;
        whitelistedBots[owner()] = true;
    }

    function needsRebalance(
        address user,
        uint256 positionId
    ) public view returns (bool) {
        ILeverageHelper.Position memory position = ILeverageHelper(leverageHelper)
            .getPosition(user, positionId);

        if (!position.isActive) return false;

        uint256 currentLeverage = ILeverageHelper(leverageHelper)
            .getCurrentLeverage(user, positionId);

        if (currentLeverage == 0) return false;

        uint256 targetLeverage = position.leverage;
        uint256 threshold = position.rebalanceThreshold;

        // ✅ 模拟价格变化导致杠杆偏移
        // 如果价格大幅上涨，实际杠杆会降低
        uint256 priceChange = 50; // 假设50%价格变化
        uint256 adjustedLeverage = (currentLeverage * 100) / (100 + priceChange);

        uint256 deviation;
        if (adjustedLeverage > targetLeverage) {
            deviation = ((adjustedLeverage - targetLeverage) * 100) / targetLeverage;
        } else {
            deviation = ((targetLeverage - adjustedLeverage) * 100) / targetLeverage;
        }

        return deviation >= threshold;
    }

    function rebalance(
        address user,
        uint256 positionId
    ) external onlyWhitelistedBot {
        ILeverageHelper.Position memory position = ILeverageHelper(leverageHelper)
            .getPosition(user, positionId);

        require(position.isActive, "Position not active");

        uint256 currentLeverage = ILeverageHelper(leverageHelper)
            .getCurrentLeverage(user, positionId);

        ILeverageHelper(leverageHelper).rebalancePosition(user, positionId);

        emit PositionRebalanced(
            user,
            positionId,
            currentLeverage,
            position.leverage
        );
    }

    function batchRebalance(
        address[] calldata users,
        uint256[] calldata positionIds
    ) external onlyWhitelistedBot {
        require(users.length == positionIds.length, "Length mismatch");

        for (uint256 i = 0; i < users.length; i++) {
            if (needsRebalance(users[i], positionIds[i])) {
                try ILeverageHelper(leverageHelper).rebalancePosition(users[i], positionIds[i]) {
                } catch {
                    continue;
                }
            }
        }
    }

    function scanPositionsNeedingRebalance(
        address user,
        uint256 startId,
        uint256 endId
    ) external view returns (uint256[] memory) {
        require(endId >= startId, "Invalid range");

        uint256 count = 0;
        uint256 maxPositions = endId - startId + 1;
        uint256[] memory temp = new uint256[](maxPositions);

        for (uint256 i = startId; i <= endId; i++) {
            if (needsRebalance(user, i)) {
                temp[count++] = i;
            }
        }

        uint256[] memory result = new uint256[](count);
        for (uint256 i = 0; i < count; i++) {
            result[i] = temp[i];
        }

        return result;
    }

    function whitelistBot(address bot, bool status) external onlyOwner {
        require(bot != address(0), "Invalid bot address");
        whitelistedBots[bot] = status;
        emit BotWhitelisted(bot, status);
    }

    function setRebalanceThreshold(uint256 _threshold) external onlyOwner {
        require(_threshold > 0 && _threshold <= 50, "Invalid threshold");
        rebalanceThreshold = _threshold;
        emit ThresholdUpdated(_threshold);
    }

    function setLeverageHelper(address _leverageHelper) external onlyOwner {
        require(_leverageHelper != address(0), "Invalid address");
        leverageHelper = _leverageHelper;
    }
}

interface ILeverageHelper {
    struct Position {
        address collateralAsset;
        address borrowAsset;
        uint256 collateralAmount;
        uint256 borrowAmount;
        uint256 leverage;
        bool isActive;
        uint256 openTimestamp;
        uint256 stopLossPrice;
        uint256 rebalanceThreshold;
    }

    function getPosition(address user, uint256 positionId)
    external
    view
    returns (Position memory);

    function getCurrentLeverage(address user, uint256 positionId)
    external
    view
    returns (uint256);

    function rebalancePosition(address user, uint256 positionId) external;
}